import { and, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  auditLogs,
  type CreateOrderInput,
  customers,
  debts,
  inventoryTransactions,
  orders,
  products,
  productVariants,
  suppliers,
  users,
} from '@kiotviet-lite/shared'

import { createOrdersRoutes } from '../routes/orders.routes.js'
import { createPurchaseOrdersRoutes } from '../routes/purchase-orders.routes.js'
import { createReceiptsRoutes } from '../routes/receipts.routes.js'
import { createSupplierPaymentsRoutes } from '../routes/supplier-payments.routes.js'
import { createSuppliersRoutes } from '../routes/suppliers.routes.js'
import { addCustomerDebt } from '../services/customer-debt-ledger.service.js'
import { countPendingReview, reviewOrder } from '../services/order-review.service.js'
import { createOrder } from '../services/orders.service.js'
import { getDebtSummaryReport } from '../services/reports.service.js'
import { createReturn } from '../services/returns.service.js'
import { getRevenueByTime } from '../services/revenue-report.service.js'
import { expectDebtLedgerConsistent } from './helpers/debt-ledger.js'
import {
  createCustomer,
  createProduct,
  createUnitConversion,
  createVariant,
} from './helpers/factories.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

// TIEN-107, KHO-11, TIEN-104: hủy chứng từ đảo đúng bút toán đã ghi, trả hàng nhập theo phiếu
// nhập gốc, phiếu chi gắn phiếu nhập. Sau mỗi ca, bộ bất biến GL-14 (scripts/invariants.sql)
// phải sạch.

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

const __dirname = dirname(fileURLToPath(import.meta.url))
const INVARIANT_INSERTS = readFileSync(resolve(__dirname, '../../scripts/invariants.sql'), 'utf8')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')
  .split(';')
  .map((stmt) => stmt.trim())
  .filter((stmt) => stmt.startsWith('INSERT INTO invariant_violations'))

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())

let env: TestEnv
let app: Hono

function buildApp(e: TestEnv) {
  const a = new Hono()
  a.route('/orders', createOrdersRoutes({ db: e.db }))
  a.route('/receipts', createReceiptsRoutes({ db: e.db }))
  a.route('/purchase-orders', createPurchaseOrdersRoutes({ db: e.db }))
  a.route('/supplier-payments', createSupplierPaymentsRoutes({ db: e.db }))
  a.route('/suppliers', createSuppliersRoutes({ db: e.db }))
  return a
}

interface Resp {
  status: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
}

async function call(
  method: string,
  path: string,
  authHeader: { Authorization: string },
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Resp> {
  const res = await app.request(path, {
    method,
    headers: { ...authHeader, 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : undefined }
}

async function rows<T>(query: ReturnType<typeof sql>): Promise<T[]> {
  const result = (await env.db.execute(query)) as unknown as { rows?: T[] } | T[]
  return Array.isArray(result) ? result : (result.rows ?? [])
}

/** Chạy đúng các câu kiểm của scripts/invariants.sql trên PGlite */
async function invariantViolations() {
  await env.db.execute(sql`
    CREATE TEMP TABLE IF NOT EXISTS invariant_violations (
      check_name text NOT NULL, store_id uuid, entity text NOT NULL, detail text NOT NULL
    )`)
  await env.db.execute(sql`DELETE FROM invariant_violations`)
  expect(INVARIANT_INSERTS.length).toBeGreaterThanOrEqual(9)
  for (const stmt of INVARIANT_INSERTS) await env.db.execute(sql.raw(stmt))
  return rows<{ check_name: string; entity: string; detail: string }>(
    sql`SELECT check_name, entity, detail FROM invariant_violations`,
  )
}

beforeEach(async () => {
  env = await createTestEnv()
  app = buildApp(env)
})

afterEach(async () => {
  expect(await invariantViolations()).toEqual([])
  await expectDebtLedgerConsistent(env.db, env.storeId)
  await env.close()
})

const ownerActor = () => ({ userId: env.owner.id, storeId: env.storeId, role: env.owner.role })
const cancelBody = (extra: Record<string, unknown> = {}) => ({ reason: 'Nhập nhầm', ...extra })

async function newProduct(name = 'Sữa Ensure') {
  return createProduct(env, { name, currentStock: 0, costPrice: 0, sellingPrice: 100_000 })
}

async function newSupplier(name = 'NCC Vinamilk') {
  const r = await call('POST', '/suppliers', env.owner.authHeader, { name })
  expect(r.status).toBe(201)
  return r.body.data as { id: string }
}

async function purchase(
  supplierId: string,
  lines: Array<{ productId: string; quantity: number; unitPrice: number; discountValue?: number }>,
  extra: Record<string, unknown> = {},
) {
  const r = await call('POST', '/purchase-orders', env.owner.authHeader, {
    supplierId,
    items: lines.map((l) => ({ discountType: 'amount', discountValue: 0, ...l })),
    ...extra,
  })
  expect(r.status).toBe(201)
  return r.body.data as {
    id: string
    code: string
    totalAmount: number
    items: Array<{ id: string; productId: string }>
  }
}

async function sell(
  product: { id: string; name: string },
  quantity: number,
  customerId: string | null = null,
  opts: { unitPrice?: number; unit?: string; unitConversionId?: string; variantId?: string } = {},
) {
  const unitPrice = opts.unitPrice ?? 100_000
  const total = unitPrice * quantity
  const onDebt = customerId !== null
  return createOrder({
    db: env.db,
    actor: ownerActor(),
    input: {
      customerId,
      subtotal: total,
      discountType: null,
      discountValue: 0,
      discountAmount: 0,
      total,
      paymentMethod: onDebt ? 'debt' : 'cash',
      paymentStatus: onDebt ? 'unpaid' : 'paid',
      ...(onDebt ? { debtAmount: total } : { cashAmount: total }),
      debtLimitOverridden: false,
      note: null,
      items: [
        {
          productId: product.id,
          variantId: opts.variantId ?? null,
          productName: product.name,
          variantName: opts.variantId ? 'Đỏ' : null,
          unit: opts.unit ?? 'cái',
          unitPrice,
          quantity,
          discountType: null,
          discountValue: 0,
          discountAmount: 0,
          lineTotal: total,
          note: null,
          unitConversionId: opts.unitConversionId ?? null,
          originalPrice: null,
          priceOverride: false,
          priceOverrideReason: null,
          priceOverridePinUsed: false,
        },
      ],
    } as CreateOrderInput,
  })
}

async function stockOf(productId: string) {
  const [p] = await env.db
    .select({ stock: products.currentStock, cost: products.costPrice })
    .from(products)
    .where(eq(products.id, productId))
  return { stock: p!.stock, cost: p!.cost === null ? null : Number(p!.cost) }
}

async function supplierDebt(supplierId: string) {
  const [s] = await env.db
    .select({ debt: suppliers.currentDebt })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
  return Number(s!.debt)
}

async function customerDebt(customerId: string) {
  const [c] = await env.db
    .select({ debt: customers.currentDebt })
    .from(customers)
    .where(eq(customers.id, customerId))
  return Number(c!.debt)
}

async function orderDebt(orderId: string) {
  const [d] = await env.db.select().from(debts).where(eq(debts.orderId, orderId))
  return d!
}

async function debtSummary() {
  return getDebtSummaryReport({ db: env.db, storeId: env.storeId, query: {} as never })
}

async function auditCount(targetId: string, action: string) {
  const list = await env.db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.targetId, targetId), eq(auditLogs.action, action)))
  return list.length
}

describe('TIEN-107: hủy phiếu thu', () => {
  it('đảo phần đã thu trong sổ công nợ, báo cáo không còn tính, hủy lần hai 409', async () => {
    const product = await newProduct()
    const supplier = await newSupplier()
    await purchase(supplier.id, [{ productId: product.id, quantity: 10, unitPrice: 50_000 }])
    const customer = await createCustomer(env, { debtLimit: 10_000_000 })
    const order = await sell(product, 3, customer.id)
    const debt = await orderDebt(order.id)

    const receipt = await call('POST', '/receipts', env.owner.authHeader, {
      customerId: customer.id,
      amount: 100_000,
      allocationMode: 'manual',
      allocations: [{ debtId: debt.id, amount: 100_000 }],
    })
    expect(receipt.status).toBe(201)
    expect(await customerDebt(customer.id)).toBe(200_000)
    expect((await debtSummary()).receivable.totalCollected).toBe(100_000)

    const staffTry = await call(
      'POST',
      `/receipts/${receipt.body.data.id}/cancel`,
      env.staff.authHeader,
      cancelBody(),
    )
    expect(staffTry.status).toBe(403)

    const noReason = await call(
      'POST',
      `/receipts/${receipt.body.data.id}/cancel`,
      env.manager.authHeader,
      { reason: '  ' },
    )
    expect(noReason.status).toBe(400)

    const cancelled = await call(
      'POST',
      `/receipts/${receipt.body.data.id}/cancel`,
      env.manager.authHeader,
      cancelBody(),
    )
    expect(cancelled.status).toBe(200)
    expect(cancelled.body.data).toMatchObject({
      status: 'cancelled',
      cancelReason: 'Nhập nhầm',
      cancelledBy: env.manager.id,
    })
    expect(await customerDebt(customer.id)).toBe(300_000)
    expect(await orderDebt(order.id)).toMatchObject({ paid: 0, remaining: 300_000 })
    const summary = await debtSummary()
    expect(summary.receivable.totalCollected).toBe(0)
    expect(summary.receivable.receiptCount).toBe(0)
    expect(await auditCount(receipt.body.data.id, 'receipt.cancelled')).toBe(1)

    const again = await call(
      'POST',
      `/receipts/${receipt.body.data.id}/cancel`,
      env.manager.authHeader,
      cancelBody(),
    )
    expect(again.status).toBe(409)
    expect(await customerDebt(customer.id)).toBe(300_000)
  })

  it('cùng Idempotency-Key gửi lại chỉ đảo một lần', async () => {
    const product = await newProduct()
    const supplier = await newSupplier()
    await purchase(supplier.id, [{ productId: product.id, quantity: 5, unitPrice: 50_000 }])
    const customer = await createCustomer(env, { debtLimit: 10_000_000 })
    const order = await sell(product, 2, customer.id)
    const debt = await orderDebt(order.id)
    const receipt = await call('POST', '/receipts', env.owner.authHeader, {
      customerId: customer.id,
      amount: 200_000,
      allocationMode: 'manual',
      allocations: [{ debtId: debt.id, amount: 200_000 }],
    })
    const key = { 'Idempotency-Key': '0190aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee' }
    const first = await call(
      'POST',
      `/receipts/${receipt.body.data.id}/cancel`,
      env.owner.authHeader,
      cancelBody(),
      key,
    )
    const replay = await call(
      'POST',
      `/receipts/${receipt.body.data.id}/cancel`,
      env.owner.authHeader,
      cancelBody(),
      key,
    )
    expect(first.status).toBe(200)
    expect(replay.status).toBe(200)
    expect(await customerDebt(customer.id)).toBe(200_000)
  })

  it('khách đang có tiền trả trước: nợ mở lại được cấn vào trả trước', async () => {
    const product = await newProduct()
    const supplier = await newSupplier()
    await purchase(supplier.id, [{ productId: product.id, quantity: 5, unitPrice: 50_000 }])
    const customer = await createCustomer(env, { debtLimit: 10_000_000 })
    const order = await sell(product, 1, customer.id)
    const debt = await orderDebt(order.id)
    const receipt = await call('POST', '/receipts', env.owner.authHeader, {
      customerId: customer.id,
      amount: 100_000,
      allocationMode: 'manual',
      allocations: [{ debtId: debt.id, amount: 100_000 }],
    })
    await env.db.transaction((tx) =>
      addCustomerDebt(tx as never, {
        storeId: env.storeId,
        customerId: customer.id,
        type: 'opening',
        amount: -250_000,
      }),
    )
    expect(await customerDebt(customer.id)).toBe(-250_000)

    const r = await call(
      'POST',
      `/receipts/${receipt.body.data.id}/cancel`,
      env.owner.authHeader,
      cancelBody(),
    )
    expect(r.status).toBe(200)
    expect(await customerDebt(customer.id)).toBe(-150_000)
    expect(await orderDebt(order.id)).toMatchObject({
      paid: 0,
      remaining: 0,
      prepaymentApplied: 100_000,
    })
  })
})

describe('TIEN-107: hủy đơn bán', () => {
  it('nhân viên không có PIN bị 403, có PIN quản lý thì hủy được; tồn, sổ kho, doanh thu như chưa bán', async () => {
    const product = await newProduct()
    const supplier = await newSupplier()
    await purchase(supplier.id, [{ productId: product.id, quantity: 10, unitPrice: 50_000 }])
    const order = await sell(product, 3)
    expect((await stockOf(product.id)).stock).toBe(7)
    const revenueBefore = await getRevenueByTime(env.db, env.storeId, today, today, 'day')
    expect(revenueBefore.summary.totalRevenue).toBe(300_000)

    const noPin = await call(
      'POST',
      `/orders/${order.id}/cancel`,
      env.staff.authHeader,
      cancelBody(),
    )
    expect(noPin.status).toBe(403)

    const ownPin = await call(
      'POST',
      `/orders/${order.id}/cancel`,
      env.staff.authHeader,
      cancelBody({ approverId: env.staff.id, approverPin: env.staff.pin }),
    )
    expect(ownPin.status).toBe(403)

    const ok = await call(
      'POST',
      `/orders/${order.id}/cancel`,
      env.staff.authHeader,
      cancelBody({ approverId: env.manager.id, approverPin: env.manager.pin }),
    )
    expect(ok.status).toBe(200)
    expect(ok.body.data).toMatchObject({ status: 'cancelled', cashRefundAmount: 300_000 })

    expect((await stockOf(product.id)).stock).toBe(10)
    const ledger = await env.db
      .select()
      .from(inventoryTransactions)
      .where(eq(inventoryTransactions.productId, product.id))
    expect(ledger.map((t) => t.type).sort()).toEqual(['order_cancel', 'purchase', 'sale'])
    const revenueAfter = await getRevenueByTime(env.db, env.storeId, today, today, 'day')
    expect(revenueAfter.summary.totalRevenue).toBe(0)
    expect(await auditCount(order.id, 'order.cancelled')).toBe(1)

    const again = await call(
      'POST',
      `/orders/${order.id}/cancel`,
      env.manager.authHeader,
      cancelBody(),
    )
    expect(again.status).toBe(409)
    expect((await stockOf(product.id)).stock).toBe(10)
  })

  it('hoàn kho theo hệ số quy đổi và theo biến thể', async () => {
    const product = await newProduct('Bia Tiger')
    const box = await createUnitConversion(env, product.id, {
      unit: 'thùng',
      conversionFactor: 12,
      sellingPrice: 1_200_000,
    })
    const shirt = await createProduct(env, {
      name: 'Áo thun',
      currentStock: 0,
      costPrice: 0,
      withVariants: true,
    })
    const red = await createVariant(env, shirt.id, {
      attribute1Value: 'Đỏ',
      stockQuantity: 0,
      costPrice: 0,
      sellingPrice: 120_000,
    })
    const supplier = await newSupplier()
    await purchase(supplier.id, [{ productId: product.id, quantity: 24, unitPrice: 10_000 }])
    const r = await call('POST', '/purchase-orders', env.owner.authHeader, {
      supplierId: supplier.id,
      items: [{ productId: shirt.id, variantId: red.id, quantity: 5, unitPrice: 60_000 }],
    })
    expect(r.status).toBe(201)

    const beer = await sell(product, 1, null, {
      unitPrice: 1_200_000,
      unit: 'thùng',
      unitConversionId: box.id,
    })
    const tee = await sell(shirt, 2, null, { unitPrice: 120_000, variantId: red.id })
    expect((await stockOf(product.id)).stock).toBe(12)

    for (const o of [beer, tee]) {
      const c = await call('POST', `/orders/${o.id}/cancel`, env.owner.authHeader, cancelBody())
      expect(c.status).toBe(200)
    }
    expect((await stockOf(product.id)).stock).toBe(24)
    const [v] = await env.db
      .select({ stock: productVariants.stockQuantity })
      .from(productVariants)
      .where(eq(productVariants.id, red.id))
    expect(v!.stock).toBe(5)
    expect((await stockOf(shirt.id)).stock).toBe(5)
  })

  it('đơn ghi nợ đã cấn tiền trả trước: hủy trả lại trả trước và xóa phần nợ còn lại', async () => {
    const product = await newProduct()
    const supplier = await newSupplier()
    await purchase(supplier.id, [{ productId: product.id, quantity: 10, unitPrice: 50_000 }])
    const customer = await createCustomer(env, { debtLimit: 10_000_000 })
    await env.db.transaction((tx) =>
      addCustomerDebt(tx as never, {
        storeId: env.storeId,
        customerId: customer.id,
        type: 'opening',
        amount: -100_000,
      }),
    )
    const order = await sell(product, 3, customer.id)
    expect(await customerDebt(customer.id)).toBe(200_000)

    const r = await call('POST', `/orders/${order.id}/cancel`, env.owner.authHeader, cancelBody())
    expect(r.status).toBe(200)
    expect(r.body.data).toMatchObject({
      cashRefundAmount: 0,
      debtReductionAmount: 200_000,
      prepaymentRefundAmount: 100_000,
    })
    expect(await customerDebt(customer.id)).toBe(-100_000)
    expect(await orderDebt(order.id)).toMatchObject({ remaining: 0, prepaymentApplied: 0 })
  })

  it('đơn đã có phiếu thu hoặc đã trả hàng thì chặn hủy', async () => {
    const product = await newProduct()
    const supplier = await newSupplier()
    await purchase(supplier.id, [{ productId: product.id, quantity: 10, unitPrice: 50_000 }])
    const customer = await createCustomer(env, { debtLimit: 10_000_000 })
    const withReceipt = await sell(product, 2, customer.id)
    const debt = await orderDebt(withReceipt.id)
    await call('POST', '/receipts', env.owner.authHeader, {
      customerId: customer.id,
      amount: 50_000,
      allocationMode: 'manual',
      allocations: [{ debtId: debt.id, amount: 50_000 }],
    })
    const blocked = await call(
      'POST',
      `/orders/${withReceipt.id}/cancel`,
      env.owner.authHeader,
      cancelBody(),
    )
    expect(blocked.status).toBe(422)
    expect(blocked.body.error.details.reason).toBe('order_has_receipts')

    const returned = await sell(product, 2)
    await createReturn({
      db: env.db,
      actor: ownerActor(),
      orderId: returned.id,
      input: { items: [{ orderItemId: returned.items[0]!.id, quantity: 1, reason: 'defective' }] },
    } as never)
    const blocked2 = await call(
      'POST',
      `/orders/${returned.id}/cancel`,
      env.owner.authHeader,
      cancelBody(),
    )
    expect(blocked2.status).toBe(422)
    expect(blocked2.body.error.details.reason).toBe('order_has_returns')
  })
})

describe('KHO-11: hủy phiếu nhập', () => {
  it('rút lại tồn, giá vốn và công nợ NCC như chưa nhập; hủy lần hai 409', async () => {
    const product = await newProduct()
    const supplier = await newSupplier()
    const first = await purchase(supplier.id, [
      { productId: product.id, quantity: 10, unitPrice: 40_000 },
    ])
    const second = await purchase(supplier.id, [
      { productId: product.id, quantity: 10, unitPrice: 60_000, discountValue: 100_000 },
    ])
    expect(await stockOf(product.id)).toEqual({ stock: 20, cost: 45_000 })
    expect(await supplierDebt(supplier.id)).toBe(400_000 + 500_000)

    const r = await call(
      'POST',
      `/purchase-orders/${second.id}/cancel`,
      env.manager.authHeader,
      cancelBody(),
    )
    expect(r.status).toBe(200)
    expect(r.body.data).toMatchObject({
      status: 'cancelled',
      cancelDebtReduction: 500_000,
      cancelSupplierRefund: 0,
    })
    expect(await stockOf(product.id)).toEqual({ stock: 10, cost: 40_000 })
    expect(await supplierDebt(supplier.id)).toBe(400_000)
    expect((await debtSummary()).payable.totalDebt).toBe(400_000)
    expect(await auditCount(second.id, 'purchase_order.cancelled')).toBe(1)

    const list = await call('GET', '/purchase-orders?status=active', env.owner.authHeader)
    expect(list.body.data.map((p: { id: string }) => p.id)).toEqual([first.id])

    const again = await call(
      'POST',
      `/purchase-orders/${second.id}/cancel`,
      env.manager.authHeader,
      cancelBody(),
    )
    expect(again.status).toBe(409)
    expect((await stockOf(product.id)).stock).toBe(10)
  })

  it('phiếu nhập đã trả tiền lúc nhập: phần đã trả ghi thành NCC phải hoàn', async () => {
    const product = await newProduct()
    const supplier = await newSupplier()
    const po = await purchase(
      supplier.id,
      [{ productId: product.id, quantity: 10, unitPrice: 50_000 }],
      { paidAmount: 200_000 },
    )
    expect(await supplierDebt(supplier.id)).toBe(300_000)
    const r = await call(
      'POST',
      `/purchase-orders/${po.id}/cancel`,
      env.owner.authHeader,
      cancelBody(),
    )
    expect(r.status).toBe(200)
    expect(r.body.data).toMatchObject({
      cancelDebtReduction: 300_000,
      cancelSupplierRefund: 200_000,
    })
    expect(await supplierDebt(supplier.id)).toBe(0)
  })

  it('hàng đã bán thì chặn hủy và nêu tên sản phẩm thiếu', async () => {
    const product = await newProduct('Tã Bobby')
    const supplier = await newSupplier()
    const po = await purchase(supplier.id, [
      { productId: product.id, quantity: 10, unitPrice: 50_000 },
    ])
    await sell(product, 8)
    const r = await call(
      'POST',
      `/purchase-orders/${po.id}/cancel`,
      env.owner.authHeader,
      cancelBody(),
    )
    expect(r.status).toBe(422)
    expect(r.body.error.message).toContain('Tã Bobby')
    expect(r.body.error.details.reason).toBe('insufficient_stock')
    expect((await stockOf(product.id)).stock).toBe(2)
    expect(await supplierDebt(supplier.id)).toBe(500_000)
  })

  it('nhân viên không vào được phiếu nhập', async () => {
    const product = await newProduct()
    const supplier = await newSupplier()
    const po = await purchase(supplier.id, [
      { productId: product.id, quantity: 1, unitPrice: 50_000 },
    ])
    const r = await call(
      'POST',
      `/purchase-orders/${po.id}/cancel`,
      env.staff.authHeader,
      cancelBody(),
    )
    expect(r.status).toBe(403)
  })
})

describe('KHO-11: trả hàng nhập', () => {
  it('trả theo giá thực nhập sau chiết khấu, giảm tồn và nợ NCC, chặn trả quá số còn lại', async () => {
    const product = await newProduct()
    const supplier = await newSupplier()
    // 10 x 50.000, chiết khấu dòng 50.000 → giá thực 45.000 / cái
    const po = await purchase(supplier.id, [
      { productId: product.id, quantity: 10, unitPrice: 50_000, discountValue: 50_000 },
    ])
    expect(await supplierDebt(supplier.id)).toBe(450_000)
    const itemId = po.items[0]!.id

    const r = await call('POST', `/purchase-orders/${po.id}/returns`, env.owner.authHeader, {
      items: [{ purchaseOrderItemId: itemId, quantity: 4 }],
    })
    expect(r.status).toBe(201)
    expect(r.body.data).toMatchObject({
      totalAmount: 180_000,
      debtReductionAmount: 180_000,
      supplierRefundAmount: 0,
    })
    expect(r.body.data.code).toMatch(/^THN-\d{8}-\d{4}$/)
    expect(await stockOf(product.id)).toEqual({ stock: 6, cost: 45_000 })
    expect(await supplierDebt(supplier.id)).toBe(270_000)

    const over = await call('POST', `/purchase-orders/${po.id}/returns`, env.owner.authHeader, {
      items: [{ purchaseOrderItemId: itemId, quantity: 7 }],
    })
    expect(over.status).toBe(422)
    expect(over.body.error.details.reason).toBe('return_quantity_exceeded')

    const detail = await call('GET', `/purchase-orders/${po.id}`, env.owner.authHeader)
    expect(detail.body.data.items[0].returnedQuantity).toBe(4)
    expect(detail.body.data.returns).toHaveLength(1)

    // Phiếu nhập đã có trả hàng thì không hủy được nữa
    const cancel = await call(
      'POST',
      `/purchase-orders/${po.id}/cancel`,
      env.owner.authHeader,
      cancelBody(),
    )
    expect(cancel.status).toBe(422)
  })

  it('phiếu nhập đã trả đủ tiền: trả hàng ghi thành NCC phải hoàn', async () => {
    const product = await newProduct()
    const supplier = await newSupplier()
    const po = await purchase(
      supplier.id,
      [{ productId: product.id, quantity: 10, unitPrice: 50_000 }],
      { paidAmount: 500_000 },
    )
    const r = await call('POST', `/purchase-orders/${po.id}/returns`, env.owner.authHeader, {
      items: [{ purchaseOrderItemId: po.items[0]!.id, quantity: 2 }],
    })
    expect(r.status).toBe(201)
    expect(r.body.data).toMatchObject({
      totalAmount: 100_000,
      debtReductionAmount: 0,
      supplierRefundAmount: 100_000,
    })
    expect(await supplierDebt(supplier.id)).toBe(0)
  })
})

describe('TIEN-104: phiếu chi gắn phiếu nhập, hủy phiếu chi', () => {
  it('cập nhật trạng thái thanh toán của phiếu nhập, hủy phiếu chi hoàn lại nợ', async () => {
    const product = await newProduct()
    const supplier = await newSupplier()
    const po = await purchase(supplier.id, [
      { productId: product.id, quantity: 10, unitPrice: 50_000 },
    ])

    const tooMuch = await call('POST', '/supplier-payments', env.owner.authHeader, {
      supplierId: supplier.id,
      amount: 600_000,
      purchaseOrderId: po.id,
    })
    expect(tooMuch.status).toBe(422)

    const pay = await call('POST', '/supplier-payments', env.owner.authHeader, {
      supplierId: supplier.id,
      amount: 200_000,
      purchaseOrderId: po.id,
    })
    expect(pay.status).toBe(201)
    expect(pay.body.data.purchaseOrderId).toBe(po.id)
    let detail = await call('GET', `/purchase-orders/${po.id}`, env.owner.authHeader)
    expect(detail.body.data).toMatchObject({ paymentStatus: 'partial', paidAmount: 200_000 })
    expect(await supplierDebt(supplier.id)).toBe(300_000)

    // Còn phiếu chi gắn thì không hủy được phiếu nhập
    const cancelPo = await call(
      'POST',
      `/purchase-orders/${po.id}/cancel`,
      env.owner.authHeader,
      cancelBody(),
    )
    expect(cancelPo.status).toBe(422)

    // Nhân viên không vào được route phiếu chi; quản lý giữ `documents.cancel` nên hủy được
    const staffTry = await call(
      'POST',
      `/supplier-payments/${pay.body.data.id}/cancel`,
      env.staff.authHeader,
      cancelBody(),
    )
    expect(staffTry.status).toBe(403)

    const cancel = await call(
      'POST',
      `/supplier-payments/${pay.body.data.id}/cancel`,
      env.manager.authHeader,
      cancelBody(),
    )
    expect(cancel.status).toBe(200)
    expect(cancel.body.data.status).toBe('cancelled')
    expect(cancel.body.data.cancelledBy).toBe(env.manager.id)
    expect(await supplierDebt(supplier.id)).toBe(500_000)
    detail = await call('GET', `/purchase-orders/${po.id}`, env.owner.authHeader)
    expect(detail.body.data).toMatchObject({ paymentStatus: 'unpaid', paidAmount: 0 })
    expect((await debtSummary()).payable.totalPaid).toBe(0)

    const again = await call(
      'POST',
      `/supplier-payments/${pay.body.data.id}/cancel`,
      env.owner.authHeader,
      cancelBody(),
    )
    expect(again.status).toBe(409)
    expect(await supplierDebt(supplier.id)).toBe(500_000)

    const cancelPoNow = await call(
      'POST',
      `/purchase-orders/${po.id}/cancel`,
      env.owner.authHeader,
      cancelBody(),
    )
    expect(cancelPoNow.status).toBe(200)
    expect(await supplierDebt(supplier.id)).toBe(0)
  })
})

describe('Review #57: các ca biên của hủy chứng từ', () => {
  it('phiếu trả hàng nhập giá trị 0 (hàng tặng) vẫn chặn hủy phiếu nhập, tồn không bị rút hai lần', async () => {
    const paid = await newProduct('Sữa Ensure')
    const gift = await newProduct('Quà tặng bình nước')
    const supplier = await newSupplier()
    const po = await purchase(supplier.id, [
      { productId: paid.id, quantity: 5, unitPrice: 50_000 },
      { productId: gift.id, quantity: 3, unitPrice: 0 },
    ])
    const giftItem = po.items.find((it) => it.productId === gift.id)!
    const ret = await call('POST', `/purchase-orders/${po.id}/returns`, env.owner.authHeader, {
      items: [{ purchaseOrderItemId: giftItem.id, quantity: 2 }],
    })
    expect(ret.status).toBe(201)
    expect(ret.body.data.totalAmount).toBe(0)
    expect((await stockOf(gift.id)).stock).toBe(1)

    const cancel = await call(
      'POST',
      `/purchase-orders/${po.id}/cancel`,
      env.owner.authHeader,
      cancelBody(),
    )
    expect(cancel.status).toBe(422)
    expect(cancel.body.error.details.reason).toBe('purchase_order_has_returns')
    expect((await stockOf(gift.id)).stock).toBe(1)
    expect((await stockOf(paid.id)).stock).toBe(5)
  })

  it('phiếu nhập đã phát sinh NCC phải hoàn thì không hủy được phiếu chi gắn phiếu', async () => {
    const product = await newProduct()
    const supplier = await newSupplier()
    const po = await purchase(supplier.id, [
      { productId: product.id, quantity: 10, unitPrice: 100_000 },
    ])
    const pay = await call('POST', '/supplier-payments', env.owner.authHeader, {
      supplierId: supplier.id,
      amount: 1_000_000,
      purchaseOrderId: po.id,
    })
    expect(pay.status).toBe(201)
    const ret = await call('POST', `/purchase-orders/${po.id}/returns`, env.owner.authHeader, {
      items: [{ purchaseOrderItemId: po.items[0]!.id, quantity: 4 }],
    })
    expect(ret.body.data).toMatchObject({ debtReductionAmount: 0, supplierRefundAmount: 400_000 })

    const cancel = await call(
      'POST',
      `/supplier-payments/${pay.body.data.id}/cancel`,
      env.owner.authHeader,
      cancelBody(),
    )
    expect(cancel.status).toBe(422)
    expect(cancel.body.error.details.reason).toBe('purchase_order_has_supplier_refund')
    expect(await supplierDebt(supplier.id)).toBe(0)
    const detail = await call('GET', `/purchase-orders/${po.id}`, env.owner.authHeader)
    expect(detail.body.data).toMatchObject({ paidAmount: 600_000, paymentStatus: 'paid' })
  })

  it('phiếu nhập trả bằng phiếu chi chung rồi trả hàng: số đã trả của phiếu không âm', async () => {
    const product = await newProduct()
    const supplier = await newSupplier()
    const po = await purchase(supplier.id, [
      { productId: product.id, quantity: 10, unitPrice: 100_000 },
    ])
    // Phiếu chi không gắn phiếu (như mọi phiếu chi trước TIEN-104) trả hết nợ NCC
    const pay = await call('POST', '/supplier-payments', env.owner.authHeader, {
      supplierId: supplier.id,
      amount: 1_000_000,
    })
    expect(pay.status).toBe(201)
    const ret = await call('POST', `/purchase-orders/${po.id}/returns`, env.owner.authHeader, {
      items: [{ purchaseOrderItemId: po.items[0]!.id, quantity: 4 }],
    })
    expect(ret.body.data).toMatchObject({ debtReductionAmount: 0, supplierRefundAmount: 400_000 })

    const detail = await call('GET', `/purchase-orders/${po.id}`, env.owner.authHeader)
    expect(detail.body.data).toMatchObject({ paidAmount: 0, returnRefundAmount: 400_000 })
    const list = await call(
      'GET',
      `/purchase-orders?supplierId=${supplier.id}`,
      env.owner.authHeader,
    )
    expect(list.body.data[0].paidAmount).toBe(0)
    expect(await supplierDebt(supplier.id)).toBe(0)
  })

  it('PIN người duyệt sai vẫn ghi số lần sai dù request có Idempotency-Key bị rollback', async () => {
    const product = await newProduct()
    const supplier = await newSupplier()
    await purchase(supplier.id, [{ productId: product.id, quantity: 5, unitPrice: 50_000 }])
    const order = await sell(product, 1)

    const wrong = await call(
      'POST',
      `/orders/${order.id}/cancel`,
      env.staff.authHeader,
      cancelBody({ approverId: env.manager.id, approverPin: '000000' }),
      { 'Idempotency-Key': '0190aaaa-bbbb-7ccc-8ddd-000000000001' },
    )
    expect(wrong.status).toBe(401)
    const [manager] = await env.db
      .select({ failed: users.failedPinAttempts })
      .from(users)
      .where(eq(users.id, env.manager.id))
    expect(manager!.failed).toBe(1)

    const ok = await call(
      'POST',
      `/orders/${order.id}/cancel`,
      env.staff.authHeader,
      cancelBody({ approverId: env.manager.id, approverPin: env.manager.pin }),
      { 'Idempotency-Key': '0190aaaa-bbbb-7ccc-8ddd-000000000002' },
    )
    expect(ok.status).toBe(200)
    const logs = await env.db
      .select({ changes: auditLogs.changes })
      .from(auditLogs)
      .where(and(eq(auditLogs.targetId, order.id), eq(auditLogs.action, 'order.cancelled')))
    expect(logs[0]!.changes).toMatchObject({ approvedBy: env.manager.id })
  })

  it('đơn chờ duyệt bị hủy: không còn đếm chờ duyệt, không duyệt được', async () => {
    const product = await newProduct()
    const supplier = await newSupplier()
    await purchase(supplier.id, [{ productId: product.id, quantity: 5, unitPrice: 50_000 }])
    const order = await sell(product, 1)
    await env.db
      .update(orders)
      .set({ reviewStatus: 'pending_review', policyViolations: [] })
      .where(eq(orders.id, order.id))
    expect(await countPendingReview({ db: env.db, storeId: env.storeId })).toBe(1)

    const r = await call('POST', `/orders/${order.id}/cancel`, env.owner.authHeader, cancelBody())
    expect(r.status).toBe(200)
    expect(await countPendingReview({ db: env.db, storeId: env.storeId })).toBe(0)
    const pending = await call('GET', '/orders?reviewStatus=pending_review', env.owner.authHeader)
    expect(pending.body.data).toHaveLength(0)
    await expect(
      reviewOrder({
        db: env.db,
        actor: ownerActor(),
        orderId: order.id,
        input: { decision: 'approved', note: null },
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('hủy đơn hoàn kho theo sổ bán của đơn, không theo cờ theo dõi tồn hiện tại', async () => {
    const product = await newProduct()
    const supplier = await newSupplier()
    await purchase(supplier.id, [{ productId: product.id, quantity: 10, unitPrice: 50_000 }])
    const order = await sell(product, 3)
    expect((await stockOf(product.id)).stock).toBe(7)
    // Tắt theo dõi tồn sau khi bán: số đã trừ lúc bán vẫn phải hoàn đủ
    await env.db.update(products).set({ trackInventory: false }).where(eq(products.id, product.id))

    const r = await call('POST', `/orders/${order.id}/cancel`, env.owner.authHeader, cancelBody())
    expect(r.status).toBe(200)
    expect((await stockOf(product.id)).stock).toBe(10)
  })

  it('sản phẩm đã xóa mềm: chặn hủy phiếu nhập với thông báo rõ', async () => {
    const product = await newProduct('Bánh Cosy')
    const supplier = await newSupplier()
    const po = await purchase(supplier.id, [
      { productId: product.id, quantity: 2, unitPrice: 50_000 },
    ])
    await env.db.update(products).set({ deletedAt: new Date() }).where(eq(products.id, product.id))
    const r = await call(
      'POST',
      `/purchase-orders/${po.id}/cancel`,
      env.owner.authHeader,
      cancelBody(),
    )
    expect(r.status).toBe(422)
    expect(r.body.error.details.reason).toBe('product_deleted')
    expect(r.body.error.message).toContain('Bánh Cosy')
  })

  it('phiếu nhập đã hủy không hiện trong lọc "Chưa thanh toán", lưu người duyệt khi hủy', async () => {
    const product = await newProduct()
    const supplier = await newSupplier()
    const po = await purchase(supplier.id, [
      { productId: product.id, quantity: 2, unitPrice: 50_000 },
    ])
    const r = await call(
      'POST',
      `/purchase-orders/${po.id}/cancel`,
      env.manager.authHeader,
      cancelBody(),
    )
    expect(r.status).toBe(200)
    const unpaid = await call('GET', '/purchase-orders?paymentStatus=unpaid', env.owner.authHeader)
    expect(unpaid.body.data).toHaveLength(0)
    const logs = await env.db
      .select({ changes: auditLogs.changes })
      .from(auditLogs)
      .where(and(eq(auditLogs.targetId, po.id), eq(auditLogs.action, 'purchase_order.cancelled')))
    expect(logs[0]!.changes).toMatchObject({ approvedBy: null })
  })
})

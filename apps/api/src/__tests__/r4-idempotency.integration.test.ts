import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  customers,
  debtAdjustments,
  debts,
  idempotencyKeys,
  inventoryTransactions,
  orderReturns,
  orders,
  products,
  purchaseOrders,
  receipts,
  supplierPayments,
  suppliers,
} from '@kiotviet-lite/shared'

import { createCustomersRoutes } from '../routes/customers.routes.js'
import { createDebtAdjustmentsRoutes } from '../routes/debt-adjustments.routes.js'
import { createOrdersRoutes } from '../routes/orders.routes.js'
import { createPosRoutes } from '../routes/pos.routes.js'
import { createProductsRoutes } from '../routes/products.routes.js'
import { createPurchaseOrdersRoutes } from '../routes/purchase-orders.routes.js'
import { createReceiptsRoutes } from '../routes/receipts.routes.js'
import { createStockChecksRoutes } from '../routes/stock-checks.routes.js'
import { createSupplierPaymentsRoutes } from '../routes/supplier-payments.routes.js'
import { createSyncRoutes } from '../routes/sync.routes.js'
import { formatDateForCode } from '../services/document-codes.service.js'
import { createCompletedOrder, createCustomer, createProduct } from './helpers/factories.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.ACCESS_TOKEN_TTL_SECONDS = '900'
  process.env.REFRESH_TOKEN_TTL_SECONDS = '604800'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

interface App {
  request: (path: string, init?: RequestInit) => Response | Promise<Response>
}

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv()
})

afterEach(async () => {
  await env.close()
})

function post(app: App, path: string, body: unknown, key?: string) {
  return app.request(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...env.owner.authHeader,
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    body: JSON.stringify(body),
  })
}

/** Mất phản hồi: máy khách gửi lần 1, không nhận được kết quả, bấm lưu lại với cùng khóa. */
async function sendTwice(app: App, path: string, body: unknown) {
  const key = randomUUID()
  const first = await post(app, path, body, key)
  const second = await post(app, path, body, key)
  const firstBody = (await first.json()) as { data: { id: string } }
  const secondBody = (await second.json()) as { data: { id: string } }
  return { key, first, second, firstBody, secondBody }
}

function expectReplay(r: Awaited<ReturnType<typeof sendTwice>>) {
  expect(r.first.status).toBe(201)
  expect(r.first.headers.get('Idempotent-Replayed')).toBeNull()
  expect(r.second.status).toBe(201)
  expect(r.second.headers.get('Idempotent-Replayed')).toBe('true')
  expect(r.secondBody).toEqual(r.firstBody)
}

async function stockOf(productId: string) {
  const row = await env.db.query.products.findFirst({ where: eq(products.id, productId) })
  return row!.currentStock
}

function cashOrderPayload(productId: string, quantity = 2) {
  return {
    subtotal: 100_000 * quantity,
    discountAmount: 0,
    total: 100_000 * quantity,
    paymentMethod: 'cash',
    paymentStatus: 'paid',
    cashAmount: 100_000 * quantity,
    items: [
      {
        productId,
        productName: 'SP A',
        unit: 'cái',
        unitPrice: 100_000,
        quantity,
        discountAmount: 0,
        lineTotal: 100_000 * quantity,
      },
    ],
  }
}

async function seedSupplier(currentDebt: number) {
  const [row] = await env.db
    .insert(suppliers)
    .values({
      storeId: env.storeId,
      code: `NCC-R4-${randomUUID().slice(0, 8)}`,
      name: 'NCC R4',
      currentDebt,
    })
    .returning()
  return row!
}

describe('R4 POS-02, TIEN-04, KHO-08: gửi lại cùng Idempotency-Key ra đúng một chứng từ', () => {
  it('POS: 2 lần POST /orders cùng khóa, 1 đơn, tồn kho trừ 1 lần', async () => {
    const product = await createProduct(env, { currentStock: 10 })
    const app = createPosRoutes({ db: env.db })

    const r = await sendTwice(app, '/orders', cashOrderPayload(product.id))

    expectReplay(r)
    const rows = await env.db.select().from(orders).where(eq(orders.storeId, env.storeId))
    expect(rows).toHaveLength(1)
    expect(await stockOf(product.id)).toBe(8)
  })

  it('Phiếu thu: 2 lần cùng khóa, 1 phiếu, nợ khách giảm 1 lần', async () => {
    const customer = await createCustomer(env, { currentDebt: 500_000 })
    const debt = await env.db.query.debts.findFirst({ where: eq(debts.customerId, customer.id) })
    const app = createReceiptsRoutes({ db: env.db })

    const r = await sendTwice(app, '/', {
      customerId: customer.id,
      amount: 200_000,
      paymentMethod: 'cash',
      allocationMode: 'manual',
      allocations: [{ debtId: debt!.id, amount: 200_000 }],
    })

    expectReplay(r)
    const rows = await env.db.select().from(receipts).where(eq(receipts.storeId, env.storeId))
    expect(rows).toHaveLength(1)
    const after = await env.db.query.customers.findFirst({ where: eq(customers.id, customer.id) })
    expect(after!.currentDebt).toBe(300_000)
  })

  it('Phiếu chi: 2 lần cùng khóa, 1 phiếu, nợ nhà cung cấp giảm 1 lần', async () => {
    const supplier = await seedSupplier(1_000_000)
    const app = createSupplierPaymentsRoutes({ db: env.db })

    const r = await sendTwice(app, '/', {
      supplierId: supplier.id,
      amount: 300_000,
      paymentMethod: 'cash',
    })

    expectReplay(r)
    const rows = await env.db
      .select()
      .from(supplierPayments)
      .where(eq(supplierPayments.storeId, env.storeId))
    expect(rows).toHaveLength(1)
    const after = await env.db.query.suppliers.findFirst({ where: eq(suppliers.id, supplier.id) })
    expect(after!.currentDebt).toBe(700_000)
  })

  it('Phiếu nhập: 2 lần cùng khóa, 1 phiếu, tồn kho và nợ nhà cung cấp tăng 1 lần', async () => {
    const product = await createProduct(env, { currentStock: 10 })
    const supplier = await seedSupplier(0)
    const app = createPurchaseOrdersRoutes({ db: env.db })

    const r = await sendTwice(app, '/', {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: 5, unitPrice: 40_000 }],
      paidAmount: 50_000,
    })

    expectReplay(r)
    const rows = await env.db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.storeId, env.storeId))
    expect(rows).toHaveLength(1)
    expect(await stockOf(product.id)).toBe(15)
    const after = await env.db.query.suppliers.findFirst({ where: eq(suppliers.id, supplier.id) })
    expect(after!.currentDebt).toBe(150_000)
  })

  it('Phiếu trả: 2 lần cùng khóa, 1 phiếu, tồn kho cộng lại 1 lần', async () => {
    const product = await createProduct(env, { currentStock: 10 })
    const { order, items } = await createCompletedOrder(env, product.id, {
      items: [{ productId: product.id, quantity: 3 }],
    })
    const app = createOrdersRoutes({ db: env.db })

    const r = await sendTwice(app, `/${order.id}/returns`, {
      items: [{ orderItemId: items[0]!.id, quantity: 1, reason: 'defective' }],
    })

    expectReplay(r)
    const rows = await env.db.select().from(orderReturns).where(eq(orderReturns.orderId, order.id))
    expect(rows).toHaveLength(1)
    expect(await stockOf(product.id)).toBe(11)
  })
})

describe('R4: các thao tác ghi nợ và tồn kho khác cũng chống gửi đôi', () => {
  it('Điều chỉnh nợ khách: 2 lần cùng khóa, 1 phiếu, nợ tăng 1 lần', async () => {
    const customer = await createCustomer(env, { currentDebt: 100_000 })
    const app = createDebtAdjustmentsRoutes({ db: env.db })

    const r = await sendTwice(app, '/', {
      customerId: customer.id,
      direction: 'increase',
      amount: 50_000,
      expectedCurrentDebt: 100_000,
      reason: 'Bù chênh lệch',
    })

    expectReplay(r)
    const rows = await env.db
      .select()
      .from(debtAdjustments)
      .where(eq(debtAdjustments.customerId, customer.id))
    expect(rows).toHaveLength(1)
    const after = await env.db.query.customers.findFirst({ where: eq(customers.id, customer.id) })
    expect(Number(after!.currentDebt)).toBe(150_000)
  })

  it('Nợ đầu kỳ khách: 2 lần cùng khóa, nạp 1 lần', async () => {
    const customer = await createCustomer(env)
    const app = createCustomersRoutes({ db: env.db })

    const r = await sendTwice(app, `/${customer.id}/opening-debt`, {
      amount: 300_000,
      incurredAt: '2026-01-15',
    })

    expectReplay(r)
    const after = await env.db.query.customers.findFirst({ where: eq(customers.id, customer.id) })
    expect(Number(after!.currentDebt)).toBe(300_000)
  })

  it('Điều chỉnh tồn tay: 2 lần cùng khóa, tồn đổi 1 lần', async () => {
    const product = await createProduct(env, { currentStock: 10 })
    const app = createProductsRoutes({ db: env.db })
    const key = randomUUID()
    const body = { delta: -3, reason: 'Hỏng' }

    const first = await post(app, `/${product.id}/inventory/adjust`, body, key)
    const second = await post(app, `/${product.id}/inventory/adjust`, body, key)

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(second.headers.get('Idempotent-Replayed')).toBe('true')
    const txs = await env.db
      .select()
      .from(inventoryTransactions)
      .where(eq(inventoryTransactions.productId, product.id))
    expect(txs.filter((t) => t.type === 'manual_adjustment')).toHaveLength(1)
    expect(await stockOf(product.id)).toBe(7)
  })

  it('Xác nhận kiểm kho: gửi lại cùng khóa nhận lại kết quả, không báo "đã xác nhận"', async () => {
    const product = await createProduct(env, { currentStock: 100 })
    const app = createStockChecksRoutes({ db: env.db })
    const created = await post(app, '/', { items: [{ productId: product.id, actualQty: 95 }] })
    const { data } = (await created.json()) as { data: { id: string } }
    const key = randomUUID()

    const first = await post(app, `/${data.id}/confirm`, undefined, key)
    const second = await post(app, `/${data.id}/confirm`, undefined, key)

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(second.headers.get('Idempotent-Replayed')).toBe('true')
    expect(await second.json()).toEqual(await first.json())
    expect(await stockOf(product.id)).toBe(95)
  })
})

describe('R4: quy tắc của Idempotency-Key', () => {
  it('cùng khóa nhưng khác nội dung thì 422, không tạo thêm chứng từ', async () => {
    const supplier = await seedSupplier(1_000_000)
    const app = createSupplierPaymentsRoutes({ db: env.db })
    const key = randomUUID()

    const first = await post(
      app,
      '/',
      { supplierId: supplier.id, amount: 100_000, paymentMethod: 'cash' },
      key,
    )
    const second = await post(
      app,
      '/',
      { supplierId: supplier.id, amount: 200_000, paymentMethod: 'cash' },
      key,
    )

    expect(first.status).toBe(201)
    expect(second.status).toBe(422)
    const body = (await second.json()) as { error: { details?: { reason?: string } } }
    expect(body.error.details?.reason).toBe('idempotency_key_reused')
    const after = await env.db.query.suppliers.findFirst({ where: eq(suppliers.id, supplier.id) })
    expect(after!.currentDebt).toBe(900_000)
  })

  it('thứ tự khóa trong JSON không làm lệch nội dung', async () => {
    const supplier = await seedSupplier(1_000_000)
    const app = createSupplierPaymentsRoutes({ db: env.db })
    const key = randomUUID()

    const first = await post(
      app,
      '/',
      { supplierId: supplier.id, amount: 100_000, paymentMethod: 'cash' },
      key,
    )
    const second = await post(
      app,
      '/',
      { amount: 100_000, paymentMethod: 'cash', supplierId: supplier.id },
      key,
    )

    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(second.headers.get('Idempotent-Replayed')).toBe('true')
  })

  it('lỗi nghiệp vụ không giữ khóa: lần gửi sau được xử lý như mới', async () => {
    const supplier = await seedSupplier(100_000)
    const app = createSupplierPaymentsRoutes({ db: env.db })
    const key = randomUUID()

    const failed = await post(
      app,
      '/',
      { supplierId: supplier.id, amount: 500_000, paymentMethod: 'cash' },
      key,
    )
    expect(failed.status).toBe(422)
    const stored = await env.db.select().from(idempotencyKeys)
    expect(stored).toHaveLength(0)

    const ok = await post(
      app,
      '/',
      { supplierId: supplier.id, amount: 50_000, paymentMethod: 'cash' },
      key,
    )
    expect(ok.status).toBe(201)
    expect(ok.headers.get('Idempotent-Replayed')).toBeNull()
  })

  it('khóa sai định dạng thì 400', async () => {
    const supplier = await seedSupplier(1_000_000)
    const app = createSupplierPaymentsRoutes({ db: env.db })

    const res = await post(
      app,
      '/',
      { supplierId: supplier.id, amount: 100_000, paymentMethod: 'cash' },
      'short',
    )

    expect(res.status).toBe(400)
    const rows = await env.db.select().from(supplierPayments)
    expect(rows).toHaveLength(0)
  })

  it('không có header thì chạy như cũ (mỗi lần gửi một chứng từ)', async () => {
    const supplier = await seedSupplier(1_000_000)
    const app = createSupplierPaymentsRoutes({ db: env.db })

    await post(app, '/', { supplierId: supplier.id, amount: 100_000, paymentMethod: 'cash' })
    await post(app, '/', { supplierId: supplier.id, amount: 100_000, paymentMethod: 'cash' })

    const rows = await env.db.select().from(supplierPayments)
    expect(rows).toHaveLength(2)
  })

  it('khóa là duy nhất theo cửa hàng: cửa hàng khác dùng cùng khóa vẫn tạo chứng từ riêng', async () => {
    const other = await createTestEnv()
    try {
      const key = randomUUID()
      const productA = await createProduct(env, { currentStock: 10 })
      const productB = await createProduct(other, { currentStock: 10 })

      const resA = await post(
        createPosRoutes({ db: env.db }),
        '/orders',
        cashOrderPayload(productA.id),
        key,
      )
      const resB = await createPosRoutes({ db: other.db }).request('/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...other.owner.authHeader,
          'Idempotency-Key': key,
        },
        body: JSON.stringify(cashOrderPayload(productB.id)),
      })

      expect(resA.status).toBe(201)
      expect(resB.status).toBe(201)
      expect(resB.headers.get('Idempotent-Replayed')).toBeNull()
    } finally {
      await other.close()
    }
  })
})

describe('R4 OFF-07: đơn trực tuyến và hàng chờ ngoại tuyến dùng chung clientId', () => {
  it('đơn trực tuyến lưu clientId; /sync/push cùng clientId trả duplicate, không tạo đơn thứ hai', async () => {
    const product = await createProduct(env, { currentStock: 10 })
    const clientId = randomUUID()

    const online = await post(
      createPosRoutes({ db: env.db }),
      '/orders',
      { ...cashOrderPayload(product.id), clientId },
      clientId,
    )
    expect(online.status).toBe(201)
    const created = (await online.json()) as { data: { id: string } }

    const push = await post(createSyncRoutes({ db: env.db }), '/push', {
      orders: [
        {
          clientId,
          createdAt: new Date().toISOString(),
          orderData: { ...cashOrderPayload(product.id), clientId },
        },
      ],
    })
    expect(push.status).toBe(200)
    const pushed = (await push.json()) as {
      data: { results: Array<{ status: string; serverId?: string }> }
    }
    expect(pushed.data.results[0]).toMatchObject({ status: 'duplicate', serverId: created.data.id })

    const rows = await env.db.select().from(orders).where(eq(orders.storeId, env.storeId))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.clientId).toBe(clientId)
    expect(await stockOf(product.id)).toBe(8)
  })

  it('cùng khóa nhưng trả tiền khác: 422, POS tra được đơn đã lưu theo clientId', async () => {
    const product = await createProduct(env, { currentStock: 10 })
    const clientId = randomUUID()
    const pos = createPosRoutes({ db: env.db })

    const first = await post(
      pos,
      '/orders',
      { ...cashOrderPayload(product.id), clientId },
      clientId,
    )
    expect(first.status).toBe(201)
    const created = (await first.json()) as { data: { id: string; orderNumber: string } }
    // Mở lại hộp thanh toán, chọn mệnh giá khác
    const again = await post(
      pos,
      '/orders',
      { ...cashOrderPayload(product.id), cashAmount: 500_000, clientId },
      clientId,
    )
    expect(again.status).toBe(422)
    expect(((await again.json()) as { error: { details: unknown } }).error.details).toEqual({
      reason: 'idempotency_key_reused',
    })

    const lookup = await createOrdersRoutes({ db: env.db }).request(`/?clientId=${clientId}`, {
      headers: env.owner.authHeader,
    })
    expect(lookup.status).toBe(200)
    const listed = (await lookup.json()) as { data: Array<{ id: string; orderNumber: string }> }
    expect(listed.data).toEqual([
      expect.objectContaining({ id: created.data.id, orderNumber: created.data.orderNumber }),
    ])
    expect(await stockOf(product.id)).toBe(8)
  })

  it('schema đơn là strict: trường lạ bị từ chối', async () => {
    const product = await createProduct(env)
    const res = await post(createPosRoutes({ db: env.db }), '/orders', {
      ...cashOrderPayload(product.id),
      clientID: randomUUID(),
    })
    expect(res.status).toBe(400)
  })
})

describe('R4 OFF-08: mã chứng từ cấp từ bộ đếm theo cửa hàng', () => {
  it('lần đầu trong ngày tiếp nối mã lớn nhất đã có (dữ liệu có trước bộ đếm), sau đó tăng dần', async () => {
    const product = await createProduct(env, { currentStock: 100 })
    const prefix = `HD-${formatDateForCode(new Date()).slice(2)}-`
    await createCompletedOrder(env, product.id, {
      orderOverrides: { orderNumber: `${prefix}0007` },
    })
    const app = createPosRoutes({ db: env.db })

    const numbers: string[] = []
    for (let i = 0; i < 2; i++) {
      const res = await post(app, '/orders', cashOrderPayload(product.id, 1))
      expect(res.status).toBe(201)
      numbers.push(((await res.json()) as { data: { orderNumber: string } }).data.orderNumber)
    }

    expect(numbers).toEqual([`${prefix}0008`, `${prefix}0009`])
  })
})

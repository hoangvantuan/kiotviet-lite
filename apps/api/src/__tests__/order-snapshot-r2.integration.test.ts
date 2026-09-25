import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  categories,
  customers,
  inventoryTransactions,
  orderItems,
  orderReturns,
  orders,
  products,
  productVariants,
} from '@kiotviet-lite/shared'

import { createOrdersRoutes } from '../routes/orders.routes.js'
import { createPosRoutes } from '../routes/pos.routes.js'
import { createSyncRoutes } from '../routes/sync.routes.js'
import { getDashboardMetrics } from '../services/dashboard.service.js'
import { getProfitReport } from '../services/profit-report.service.js'
import {
  getRevenueByCustomer,
  getRevenueByDimension,
  getRevenueByEmployee,
  getRevenueByProduct,
  getRevenueByTime,
} from '../services/revenue-report.service.js'
import {
  createCustomer,
  createProduct,
  createUnitConversion,
  createVariant,
} from './helpers/factories.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

// Hồi quy nhóm R2 (chứng từ bán không chụp số liệu lúc bán): POS-03, BC-01, TIEN-101, BC-10, BC-08.
// Mỗi ca dựng lại bước tái hiện trong báo cáo kiểm toán qua đúng đường tạo đơn POS và trả hàng.

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.ACCESS_TOKEN_TTL_SECONDS = '900'
  process.env.REFRESH_TOKEN_TTL_SECONDS = '604800'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

function buildApp(env: TestEnv) {
  const app = new Hono()
  app.route('/api/v1/pos', createPosRoutes({ db: env.db }))
  app.route('/api/v1/sync', createSyncRoutes({ db: env.db }))
  app.route('/api/v1/orders', createOrdersRoutes({ db: env.db }))
  return app
}

type App = ReturnType<typeof buildApp>

interface Resp {
  status: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
}

async function call(app: App, method: string, path: string, env: TestEnv, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: { ...env.owner.authHeader, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : undefined } as Resp
}

interface LineOpts {
  productId: string
  unitPrice: number
  quantity?: number
  variantId?: string | null
  unit?: string
  unitConversionId?: string | null
}

function line(o: LineOpts) {
  const quantity = o.quantity ?? 1
  return {
    productId: o.productId,
    variantId: o.variantId ?? null,
    productName: 'Hàng thử',
    variantName: null,
    unit: o.unit ?? 'cái',
    unitPrice: o.unitPrice,
    quantity,
    discountType: null,
    discountValue: 0,
    discountAmount: 0,
    lineTotal: o.unitPrice * quantity,
    note: null,
    unitConversionId: o.unitConversionId ?? null,
    originalPrice: null,
    priceOverride: false,
    priceOverrideReason: null,
    priceOverridePinUsed: false,
  }
}

interface OrderOpts {
  items: ReturnType<typeof line>[]
  /** Chiết khấu đơn theo phần trăm */
  discountPercent?: number
  customerId?: string | null
  debtAmount?: number
}

function orderBody(o: OrderOpts) {
  const subtotal = o.items.reduce((sum, i) => sum + i.lineTotal, 0)
  const discountAmount = o.discountPercent ? Math.round((subtotal * o.discountPercent) / 100) : 0
  const total = subtotal - discountAmount
  const debt = o.debtAmount ?? 0
  const paymentMethod = debt > 0 ? 'debt' : 'cash'
  return {
    customerId: o.customerId ?? null,
    subtotal,
    discountType: o.discountPercent ? 'percent' : null,
    discountValue: o.discountPercent ?? 0,
    discountAmount,
    total,
    paymentMethod,
    paymentStatus: debt === 0 ? 'paid' : debt === total ? 'unpaid' : 'partial',
    cashAmount: total - debt,
    ...(debt > 0 ? { debtAmount: debt } : {}),
    debtLimitOverridden: false,
    note: null,
    items: o.items,
  }
}

async function sell(app: App, env: TestEnv, o: OrderOpts): Promise<string> {
  const res = await call(app, 'POST', '/api/v1/pos/orders', env, orderBody(o))
  expect(res.status, JSON.stringify(res.body)).toBe(201)
  return res.body.data.id as string
}

async function itemsOf(env: TestEnv, orderId: string) {
  return env.db.select().from(orderItems).where(eq(orderItems.orderId, orderId))
}

async function returnItems(
  app: App,
  env: TestEnv,
  orderId: string,
  items: Array<{ orderItemId: string; quantity: number }>,
) {
  const res = await call(app, 'POST', `/api/v1/orders/${orderId}/returns`, env, {
    items: items.map((it) => ({ ...it, reason: 'customer_changed_mind' })),
    note: null,
  })
  expect(res.status, JSON.stringify(res.body)).toBe(201)
  return res.body.data as { totalAmount: number; refundAmount: number; debtReductionAmount: number }
}

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())

// ---------------------------------------------------------------------------
// POS-03, BC-01: hệ số quy đổi và giá vốn chụp trên dòng đơn
// ---------------------------------------------------------------------------

describe('POS-03, BC-01: dòng đơn chụp hệ số quy đổi và giá vốn lúc bán', () => {
  let env: TestEnv
  let app: App
  let noodleId: string
  let cartonId: string
  let shirtId: string
  let shirtVariantId: string

  beforeAll(async () => {
    env = await createTestEnv()
    app = buildApp(env)
    const noodle = await createProduct(env, {
      name: 'Mì gói',
      unit: 'gói',
      sellingPrice: 7_000,
      costPrice: 5_000,
      currentStock: 240,
    })
    noodleId = noodle.id
    const carton = await createUnitConversion(env, noodleId, {
      unit: 'thùng',
      conversionFactor: 24,
      sellingPrice: 150_000,
    })
    cartonId = carton.id

    const shirt = await createProduct(env, {
      name: 'Áo',
      sellingPrice: 100_000,
      costPrice: 50_000,
      withVariants: true,
    })
    shirtId = shirt.id
    const variant = await createVariant(env, shirtId, {
      sellingPrice: 120_000,
      costPrice: 70_000,
      stockQuantity: 50,
    })
    shirtVariantId = variant.id
  })

  afterAll(async () => {
    await env.close()
  })

  it('bán 1 thùng 24 gói: dòng đơn lưu hệ số 24 và giá vốn một gói lúc bán', async () => {
    const orderId = await sell(app, env, {
      items: [
        line({
          productId: noodleId,
          unitPrice: 150_000,
          unit: 'thùng',
          unitConversionId: cartonId,
        }),
      ],
    })
    const [item] = await itemsOf(env, orderId)
    expect(item!.conversionFactor).toBe(24)
    expect(item!.unitCost).toBe(5_000)
    expect(item!.unitCostEstimated).toBe(false)
  })

  it('trả 1 thùng hoàn đủ 24 gói vào kho', async () => {
    const orderId = await sell(app, env, {
      items: [
        line({
          productId: noodleId,
          unitPrice: 150_000,
          unit: 'thùng',
          unitConversionId: cartonId,
        }),
      ],
    })
    const [before] = await env.db
      .select({ stock: products.currentStock })
      .from(products)
      .where(eq(products.id, noodleId))
    const [item] = await itemsOf(env, orderId)
    await returnItems(app, env, orderId, [{ orderItemId: item!.id, quantity: 1 }])

    const [after] = await env.db
      .select({ stock: products.currentStock })
      .from(products)
      .where(eq(products.id, noodleId))
    expect(after!.stock - before!.stock).toBe(24)

    const txs = await env.db
      .select({ quantity: inventoryTransactions.quantity })
      .from(inventoryTransactions)
      .where(
        and(
          eq(inventoryTransactions.productId, noodleId),
          eq(inventoryTransactions.type, 'return'),
        ),
      )
    expect(txs.at(-1)!.quantity).toBe(24)
  })

  it('biến thể chụp giá vốn biến thể, không lấy giá vốn sản phẩm cha', async () => {
    const orderId = await sell(app, env, {
      items: [line({ productId: shirtId, variantId: shirtVariantId, unitPrice: 120_000 })],
    })
    const [item] = await itemsOf(env, orderId)
    expect(item!.unitCost).toBe(70_000)
  })

  it('lợi nhuận đơn cũ không đổi khi giá vốn thay đổi sau phiếu nhập mới', async () => {
    const profitBefore = await getProfitReport(env.db, env.storeId, today, today)
    const dashboardBefore = await getDashboardMetrics(env.db, env.storeId, 'today')
    // Hai thùng đã bán còn 1 thùng (1 thùng trả): giá vốn 24 × 5.000; áo biến thể 70.000
    expect(profitBefore.summary.totalCogs).toBe(24 * 5_000 + 70_000)

    // Phiếu nhập mới làm giá vốn bình quân tăng
    await env.db.update(products).set({ costPrice: 9_000 }).where(eq(products.id, noodleId))
    await env.db
      .update(productVariants)
      .set({ costPrice: 99_000 })
      .where(eq(productVariants.id, shirtVariantId))

    const profitAfter = await getProfitReport(env.db, env.storeId, today, today)
    const dashboardAfter = await getDashboardMetrics(env.db, env.storeId, 'today')
    expect(profitAfter.summary).toEqual(profitBefore.summary)
    expect(dashboardAfter.profit.value).toBe(dashboardBefore.profit.value)
    expect(dashboardAfter.profit.sparkline).toEqual(dashboardBefore.profit.sparkline)
  })

  it('đơn đồng bộ ngoại tuyến cũng chụp hệ số và giá vốn', async () => {
    await env.db.update(products).set({ costPrice: 5_000 }).where(eq(products.id, noodleId))
    const res = await call(app, 'POST', '/api/v1/sync/push', env, {
      clientId: 'aaaaaaaa-2222-4444-8888-000000000001',
      orders: [
        {
          clientId: 'bbbbbbbb-2222-4444-8888-000000000001',
          createdAt: new Date().toISOString(),
          orderData: orderBody({
            items: [
              line({
                productId: noodleId,
                unitPrice: 150_000,
                unit: 'thùng',
                unitConversionId: cartonId,
              }),
            ],
          }),
        },
      ],
    })
    expect(res.status).toBe(200)
    const serverId = res.body.data.results[0].serverId as string
    const [item] = await itemsOf(env, serverId)
    expect(item!.conversionFactor).toBe(24)
    expect(item!.unitCost).toBe(5_000)
  })
})

// ---------------------------------------------------------------------------
// TIEN-101, TIEN-108: trả nhiều lần bằng trả một lần
// ---------------------------------------------------------------------------

describe('TIEN-101: trả N lần trên đơn có chiết khấu đơn bằng trả một lần', () => {
  let env: TestEnv
  let app: App
  let productId: string
  let bigId: string
  let keptId: string
  let customerId: string

  beforeAll(async () => {
    env = await createTestEnv()
    app = buildApp(env)
    const p = await createProduct(env, {
      sellingPrice: 45_000,
      costPrice: 20_000,
      currentStock: 1_000,
    })
    productId = p.id
    const big = await createProduct(env, {
      sellingPrice: 1_000_000,
      costPrice: 600_000,
      currentStock: 100,
    })
    bigId = big.id
    // Dòng khách giữ lại, không trả: không để nhánh "trả hết cả đơn" che lỗi
    const kept = await createProduct(env, { sellingPrice: 45_000, currentStock: 1_000 })
    keptId = kept.id
    const customer = await createCustomer(env, { debtLimit: 10_000_000 })
    customerId = customer.id
  })

  afterAll(async () => {
    await env.close()
  })

  /** Dòng 3 × 45.000 = 135.000 cộng dòng giữ lại 45.000, chiết khấu đơn 20% */
  function discountedOrder(extra: Partial<OrderOpts> = {}): OrderOpts {
    return {
      items: [
        line({ productId, unitPrice: 45_000, quantity: 3 }),
        line({ productId: keptId, unitPrice: 45_000 }),
      ],
      discountPercent: 20,
      ...extra,
    }
  }

  async function lineOf(orderId: string, pid: string) {
    const [item] = (await itemsOf(env, orderId)).filter((i) => i.productId === pid)
    return item!
  }

  it('135.000 chiết khấu đơn 20%, trả 3 lần hoàn đúng 108.000 như trả một lần', async () => {
    const splitId = await sell(app, env, discountedOrder())
    const splitItem = await lineOf(splitId, productId)
    expect(splitItem.orderDiscountAllocated).toBe(27_000)
    let splitTotal = 0
    for (let i = 0; i < 3; i++) {
      const r = await returnItems(app, env, splitId, [{ orderItemId: splitItem.id, quantity: 1 }])
      splitTotal += r.totalAmount
    }

    const onceId = await sell(app, env, discountedOrder())
    const onceItem = await lineOf(onceId, productId)
    const once = await returnItems(app, env, onceId, [{ orderItemId: onceItem.id, quantity: 3 }])

    expect(splitTotal).toBe(108_000)
    expect(once.totalAmount).toBe(108_000)
  })

  it('trả một phần rồi trả phần còn lại: 2.000.000 chiết khấu 50% hoàn tổng 1.000.000', async () => {
    const orderId = await sell(app, env, {
      items: [
        line({ productId: bigId, unitPrice: 1_000_000, quantity: 2 }),
        line({ productId: keptId, unitPrice: 45_000 }),
      ],
      discountPercent: 50,
    })
    const item = await lineOf(orderId, bigId)
    const first = await returnItems(app, env, orderId, [{ orderItemId: item.id, quantity: 1 }])
    const second = await returnItems(app, env, orderId, [{ orderItemId: item.id, quantity: 1 }])
    expect(first.totalAmount).toBe(500_000)
    expect(second.totalAmount).toBe(500_000)
  })

  it('đơn nợ một phần: cấn hết nợ trước, tiền mặt hoàn không vượt phần khách đã trả', async () => {
    // Đơn 180.000, chiết khấu 20% còn 144.000; khách trả 94.000, nợ 50.000.
    // Trả hết dòng 3 cái (giá trị ròng 108.000) trong 3 phiếu: cấn 50.000, hoàn tiền mặt 58.000.
    const orderId = await sell(app, env, discountedOrder({ customerId, debtAmount: 50_000 }))
    const item = await lineOf(orderId, productId)
    let reduced = 0
    let refunded = 0
    for (let i = 0; i < 3; i++) {
      const r = await returnItems(app, env, orderId, [{ orderItemId: item.id, quantity: 1 }])
      reduced += r.debtReductionAmount
      refunded += r.refundAmount
    }
    expect(reduced).toBe(50_000)
    expect(refunded).toBe(58_000)
    const [c] = await env.db
      .select({ currentDebt: customers.currentDebt })
      .from(customers)
      .where(eq(customers.id, customerId))
    expect(c!.currentDebt).toBe(0)
  })

  it('danh sách hàng có thể trả mang đủ ảnh chụp để web xem trước đúng số máy chủ', async () => {
    const orderId = await sell(app, env, discountedOrder())
    const res = await call(app, 'GET', `/api/v1/orders/${orderId}/returnable-items`, env)
    expect(res.status).toBe(200)
    expect(res.body.data[0]).toMatchObject({
      lineTotal: 135_000,
      orderDiscountAllocated: 27_000,
      conversionFactor: 1,
    })
  })
})

// ---------------------------------------------------------------------------
// BC-10: doanh thu theo sản phẩm và lợi nhuận trừ chiết khấu đơn đã phân bổ
// ---------------------------------------------------------------------------

describe('BC-10: tổng doanh thu mọi chiều khớp nhau khi đơn có chiết khấu đơn', () => {
  let env: TestEnv
  let app: App

  beforeAll(async () => {
    env = await createTestEnv()
    app = buildApp(env)
    const [cat] = await env.db
      .insert(categories)
      .values({ storeId: env.storeId, name: 'Đồ uống' })
      .returning()
    const a = await createProduct(env, {
      sellingPrice: 33_333,
      costPrice: 10_000,
      categoryId: cat!.id,
    })
    const b = await createProduct(env, { sellingPrice: 70_001, costPrice: 20_000 })
    const customer = await createCustomer(env)

    const orderId = await sell(app, env, {
      items: [
        line({ productId: a.id, unitPrice: 33_333, quantity: 3 }),
        line({ productId: b.id, unitPrice: 70_001, quantity: 1 }),
      ],
      discountPercent: 15,
      customerId: customer.id,
    })
    await sell(app, env, { items: [line({ productId: b.id, unitPrice: 70_001 })] })
    const [first] = (await itemsOf(env, orderId)).filter((i) => i.productId === a.id)
    await returnItems(app, env, orderId, [{ orderItemId: first!.id, quantity: 1 }])
  })

  afterAll(async () => {
    await env.close()
  })

  it('theo sản phẩm, lợi nhuận, thời gian, khách, nhân viên, danh mục cùng một tổng', async () => {
    const [byTime, byProduct, byCustomer, byEmployee, byCategory, byBrand, profit] =
      await Promise.all([
        getRevenueByTime(env.db, env.storeId, today, today, 'day'),
        getRevenueByProduct(env.db, env.storeId, today, today),
        getRevenueByCustomer(env.db, env.storeId, today, today),
        getRevenueByEmployee(env.db, env.storeId, today, today),
        getRevenueByDimension(env.db, env.storeId, today, today, 'danh-muc'),
        getRevenueByDimension(env.db, env.storeId, today, today, 'thuong-hieu'),
        getProfitReport(env.db, env.storeId, today, today),
      ])
    const expected = byTime.summary.totalRevenue
    const [orderRows, returnRows] = await Promise.all([
      env.db.select({ total: orders.total }).from(orders).where(eq(orders.storeId, env.storeId)),
      env.db
        .select({ total: orderReturns.totalAmount })
        .from(orderReturns)
        .where(eq(orderReturns.storeId, env.storeId)),
    ])
    const sum = (rows: Array<{ total: number }>) => rows.reduce((s, r) => s + Number(r.total), 0)
    expect(expected).toBe(sum(orderRows) - sum(returnRows))
    expect(byProduct.summary.totalRevenue).toBe(expected)
    expect(profit.summary.totalRevenue).toBe(expected)
    expect(byCustomer.summary.totalRevenue).toBe(expected)
    expect(byEmployee.summary.totalRevenue).toBe(expected)
    expect(byCategory.summary.totalRevenue).toBe(expected)
    expect(byBrand.summary.totalRevenue).toBe(expected)
  })
})

// ---------------------------------------------------------------------------
// BC-08: in lại hóa đơn cũ dùng số liệu chụp lúc bán
// ---------------------------------------------------------------------------

describe('BC-08: chi tiết đơn để in lại giữ số liệu lúc bán', () => {
  let env: TestEnv
  let app: App
  let productId: string
  let customerId: string

  beforeAll(async () => {
    env = await createTestEnv()
    app = buildApp(env)
    const p = await createProduct(env, {
      sellingPrice: 100_000,
      costPrice: 40_000,
      currentStock: 100,
    })
    productId = p.id
    const customer = await createCustomer(env, { debtLimit: 10_000_000 })
    customerId = customer.id
  })

  afterAll(async () => {
    await env.close()
  })

  it('nợ trước đơn, đã trả, còn nợ và giá vốn không đổi theo phát sinh sau', async () => {
    // Nợ trước đó 30.000 từ một đơn khác
    await sell(app, env, {
      items: [line({ productId, unitPrice: 100_000 })],
      customerId,
      debtAmount: 30_000,
    })
    // Đơn cần in lại: 200.000, trả 120.000, nợ 80.000
    const orderId = await sell(app, env, {
      items: [line({ productId, unitPrice: 100_000, quantity: 2 })],
      customerId,
      debtAmount: 80_000,
    })

    const snapshot = await call(app, 'GET', `/api/v1/orders/${orderId}`, env)
    expect(snapshot.body.data).toMatchObject({
      oldDebt: 30_000,
      customerDebtBefore: 30_000,
      paidAmountAtSale: 120_000,
      debtAmountAtSale: 80_000,
    })

    // Phát sinh sau: đơn nợ mới, trả 1 sản phẩm (cấn nợ), giá vốn đổi
    await sell(app, env, {
      items: [line({ productId, unitPrice: 100_000 })],
      customerId,
      debtAmount: 100_000,
    })
    const [item] = await itemsOf(env, orderId)
    await returnItems(app, env, orderId, [{ orderItemId: item!.id, quantity: 1 }])
    await env.db.update(products).set({ costPrice: 90_000 }).where(eq(products.id, productId))

    const reprint = await call(app, 'GET', `/api/v1/orders/${orderId}`, env)
    expect(reprint.body.data).toMatchObject({
      oldDebt: 30_000,
      customerDebtBefore: 30_000,
      paidAmountAtSale: 120_000,
      debtAmountAtSale: 80_000,
    })
    expect(reprint.body.data.items[0].costPrice).toBe(40_000)
  })
})

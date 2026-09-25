/**
 * BM-02: cô lập cửa hàng qua khóa ngoại trong payload ghi (POST/PUT/PATCH).
 *
 * File này thay cho script dò `probe2.py` của đợt audit w6b-baomat
 * (.audit/tmp/w6b-baomat/probe2.py, isolation-results.csv). Khác với script cũ,
 * mọi payload ở đây là payload HỢP LỆ theo đúng Zod schema hiện tại (đọc từ
 * packages/shared/src/schema) để request thật sự chạy tới bước kiểm khóa ngoại,
 * thay vì bị chặn sớm bởi lỗi 400 không liên quan.
 *
 * Phương pháp mỗi dòng bảng dưới đây: gọi API với payload dùng ID của chính cửa
 * hàng B (control, kỳ vọng thành công 2xx) rồi đổi ĐÚNG MỘT khóa ngoại sang ID
 * thuộc cửa hàng A (violate, kỳ vọng bị từ chối 404/400/422, KHÔNG BAO GIỜ 2xx
 * hay 500). Với đơn hàng/đồng bộ, còn kiểm tra thêm bằng DB rằng không có bản ghi
 * mới nào của cửa hàng B được tạo ra khi bị từ chối.
 *
 * Bảng route ghi có khóa ngoại được bao phủ (X = có test ở file này):
 *  - POST /pos/orders                     customerId, productId, variantId, unitConversionId, priceListId
 *  - POST /sync/push                      customerId (đơn tiền mặt + đơn ghi nợ), productId
 *  - POST /category-discounts             categoryId, customerGroupId
 *  - POST /customer-prices                customerId, productId
 *  - POST /debt-adjustments               customerId
 *  - POST /orders/:id/returns             orderItemId (của đơn thuộc cửa hàng khác)
 *  - POST /price-lists                    items[].productId
 *  - POST /price-lists/:id/items          productId, và chính priceListId trên URL
 *  - POST /products, PATCH /products/:id  categoryId, brandId
 *  - POST /customers, PATCH /customers/:id groupId
 *  - POST /customer-groups                defaultPriceListId
 *  - POST /categories                     parentId
 *  - POST /purchase-orders                supplierId, items[].productId
 *  - POST /receipts                       customerId, allocations[].debtId
 *  - POST /stock-checks, PATCH /stock-checks/:id  items[].productId
 *  - POST /supplier-debt-adjustments      supplierId
 *  - POST /supplier-payments              supplierId
 *  - PUT /volume-prices/products/:productId  productId (trên URL)
 */
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  brands,
  categories,
  customerGroups,
  customers,
  debts,
  orders,
  priceLists,
  suppliers,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { createCategoriesRoutes } from '../routes/categories.routes.js'
import { createCategoryDiscountsRoutes } from '../routes/category-discounts.routes.js'
import { createCustomerGroupsRoutes } from '../routes/customer-groups.routes.js'
import { createCustomerPricesRoutes } from '../routes/customer-prices.routes.js'
import { createCustomersRoutes } from '../routes/customers.routes.js'
import { createDebtAdjustmentsRoutes } from '../routes/debt-adjustments.routes.js'
import { createOrdersRoutes } from '../routes/orders.routes.js'
import { createPosRoutes } from '../routes/pos.routes.js'
import { createPriceListsRoutes } from '../routes/price-lists.routes.js'
import { createProductsRoutes } from '../routes/products.routes.js'
import { createPurchaseOrdersRoutes } from '../routes/purchase-orders.routes.js'
import { createReceiptsRoutes } from '../routes/receipts.routes.js'
import { createStockChecksRoutes } from '../routes/stock-checks.routes.js'
import { createSupplierDebtAdjustmentsRoutes } from '../routes/supplier-debt-adjustments.routes.js'
import { createSupplierPaymentsRoutes } from '../routes/supplier-payments.routes.js'
import { createSyncRoutes } from '../routes/sync.routes.js'
import { createVolumePricesRoutes } from '../routes/volume-prices.routes.js'
import {
  createCompletedOrder,
  createCustomer,
  createDebtOrder,
  createProduct,
  createStore,
  createUnitConversion,
  createUser,
  createVariant,
  type FactoryUser,
} from './helpers/factories.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.ACCESS_TOKEN_TTL_SECONDS = '900'
  process.env.REFRESH_TOKEN_TTL_SECONDS = '604800'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

// ---------------------------------------------------------------------------
// App gộp: chỉ mount các route ghi có khóa ngoại cần kiểm, dùng chung 1 db.
// KHÔNG import apps/api/src/index.ts để tránh phụ thuộc DATABASE_URL thật.
// ---------------------------------------------------------------------------
function buildApp(db: Db) {
  const app = new Hono()
  app.route('/api/v1/pos', createPosRoutes({ db }))
  app.route('/api/v1/sync', createSyncRoutes({ db }))
  app.route('/api/v1/category-discounts', createCategoryDiscountsRoutes({ db }))
  app.route('/api/v1/customer-prices', createCustomerPricesRoutes({ db }))
  app.route('/api/v1/debt-adjustments', createDebtAdjustmentsRoutes({ db }))
  app.route('/api/v1/orders', createOrdersRoutes({ db }))
  app.route('/api/v1/price-lists', createPriceListsRoutes({ db }))
  app.route('/api/v1/products', createProductsRoutes({ db }))
  app.route('/api/v1/customers', createCustomersRoutes({ db }))
  app.route('/api/v1/customer-groups', createCustomerGroupsRoutes({ db }))
  app.route('/api/v1/categories', createCategoriesRoutes({ db }))
  app.route('/api/v1/purchase-orders', createPurchaseOrdersRoutes({ db }))
  app.route('/api/v1/receipts', createReceiptsRoutes({ db }))
  app.route('/api/v1/stock-checks', createStockChecksRoutes({ db }))
  app.route('/api/v1/supplier-debt-adjustments', createSupplierDebtAdjustmentsRoutes({ db }))
  app.route('/api/v1/supplier-payments', createSupplierPaymentsRoutes({ db }))
  app.route('/api/v1/volume-prices', createVolumePricesRoutes({ db }))
  return app
}

type App = ReturnType<typeof buildApp>

interface ApiEnvelope {
  data?: unknown
  error?: { code: string; message: string }
}

interface SyncPushResult {
  clientId: string
  serverId?: string
  status: 'synced' | 'error' | 'duplicate'
  error?: { code: string; message: string }
}

interface SyncPushEnvelope {
  data: { results: SyncPushResult[]; syncedAt: string }
}

async function call(
  app: App,
  method: string,
  path: string,
  authHeader: Record<string, string>,
  body?: unknown,
): Promise<Response> {
  return app.request(path, {
    method,
    headers: { ...authHeader, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function expectSuccess(status: number): void {
  expect(status).toBeGreaterThanOrEqual(200)
  expect(status).toBeLessThan(300)
}

function expectRejected(status: number, allowed: number[]): void {
  expect(allowed).toContain(status)
  expect(status).not.toBe(500)
}

/** Payload hợp lệ cho POST /pos/orders: mặc định 1 sản phẩm, giá = sellingPrice gốc (không có phụ phí). */
function posOrderBody(opts: {
  productId: string
  unitPrice: number
  quantity?: number
  customerId?: string | null
  variantId?: string | null
  unitConversionId?: string | null
  priceListId?: string | null
  paymentMethod?: 'cash' | 'transfer' | 'combined' | 'debt'
}): Record<string, unknown> {
  const quantity = opts.quantity ?? 1
  const lineTotal = opts.unitPrice * quantity
  const paymentMethod = opts.paymentMethod ?? 'cash'
  const body: Record<string, unknown> = {
    customerId: opts.customerId ?? null,
    subtotal: lineTotal,
    discountAmount: 0,
    total: lineTotal,
    priceListId: opts.priceListId ?? null,
    paymentMethod,
    items: [
      {
        productId: opts.productId,
        variantId: opts.variantId ?? null,
        productName: 'SP kiểm cô lập',
        unitPrice: opts.unitPrice,
        quantity,
        lineTotal,
        unitConversionId: opts.unitConversionId ?? null,
      },
    ],
  }
  if (paymentMethod === 'cash') {
    body.paymentStatus = 'paid'
    body.cashAmount = lineTotal
  } else if (paymentMethod === 'transfer') {
    body.paymentStatus = 'paid'
    body.transferAmount = lineTotal
  } else if (paymentMethod === 'combined') {
    body.paymentStatus = 'paid'
    const cash = Math.ceil(lineTotal / 2)
    body.cashAmount = cash
    body.transferAmount = lineTotal - cash
  } else {
    body.paymentStatus = 'unpaid'
    body.cashAmount = 0
    body.debtAmount = lineTotal
  }
  return body
}

function syncPushBody(orderData: Record<string, unknown>): Record<string, unknown> {
  return {
    orders: [
      {
        clientId: randomUUID(),
        createdAt: new Date().toISOString(),
        orderData,
      },
    ],
  }
}

async function countOrdersForStore(db: Db, storeId: string): Promise<number> {
  const rows = await db.select({ id: orders.id }).from(orders).where(eq(orders.storeId, storeId))
  return rows.length
}

// ---------------------------------------------------------------------------
// Fixture dùng chung cho toàn file: 1 createTestEnv() duy nhất để test nhanh.
// Cửa hàng A = env.storeId (chủ env.owner), cửa hàng B = tạo thêm bên dưới.
// ---------------------------------------------------------------------------
interface Fixtures {
  base: TestEnv
  app: App
  storeB: { id: string }
  ownerB: FactoryUser
  productA: { id: string }
  productB: { id: string; sellingPrice: number }
  variantA: { id: string }
  variantB: { id: string; sellingPrice: number }
  unitConvA: { id: string }
  unitConvB: { id: string; sellingPrice: number }
  customerA: { id: string }
  customerB: { id: string }
  categoryA: { id: string }
  categoryB: { id: string }
  brandA: { id: string }
  brandB: { id: string }
  customerGroupA: { id: string }
  customerGroupB: { id: string }
  supplierA: { id: string }
  supplierB: { id: string }
  supplierPayB: { id: string }
  priceListA: { id: string }
  priceListB: { id: string }
  debtA: { id: string }
  debtB: { id: string; remaining: number }
  customerReceiptB: { id: string }
  debtReceiptB: { id: string; remaining: number }
  orderAItemId: string
  orderB: { id: string }
  orderBItemId: string
}

let fx: Fixtures

beforeAll(async () => {
  const base = await createTestEnv()
  const app = buildApp(base.db)

  const storeB = await createStore(base)
  const ownerB = await createUser(base, { storeId: storeB.id, role: 'owner', pin: '222333' })

  const productA = await createProduct(base)
  const productB = await createProduct(base, { storeId: storeB.id })

  const variantA = await createVariant(base, productA.id)
  const variantB = await createVariant(base, productB.id, { storeId: storeB.id })

  const unitConvA = await createUnitConversion(base, productA.id)
  const unitConvB = await createUnitConversion(base, productB.id, {
    storeId: storeB.id,
    sellingPrice: 1_200_000,
  })

  const customerA = await createCustomer(base)
  const customerB = await createCustomer(base, { storeId: storeB.id })

  const [categoryA] = await base.db
    .insert(categories)
    .values({ storeId: base.storeId, name: 'Danh mục gốc A' })
    .returning()
  const [categoryB] = await base.db
    .insert(categories)
    .values({ storeId: storeB.id, name: 'Danh mục gốc B' })
    .returning()
  if (!categoryA || !categoryB) throw new Error('seed category failed')

  const [brandA] = await base.db
    .insert(brands)
    .values({ storeId: base.storeId, name: 'Thương hiệu A' })
    .returning()
  const [brandB] = await base.db
    .insert(brands)
    .values({ storeId: storeB.id, name: 'Thương hiệu B' })
    .returning()
  if (!brandA || !brandB) throw new Error('seed brand failed')

  const [priceListA] = await base.db
    .insert(priceLists)
    .values({ storeId: base.storeId, name: 'Bảng giá A', method: 'direct' })
    .returning()
  const [priceListB] = await base.db
    .insert(priceLists)
    .values({ storeId: storeB.id, name: 'Bảng giá B', method: 'direct' })
    .returning()
  if (!priceListA || !priceListB) throw new Error('seed price list failed')

  const [customerGroupA] = await base.db
    .insert(customerGroups)
    .values({ storeId: base.storeId, name: 'Nhóm KH A' })
    .returning()
  const [customerGroupB] = await base.db
    .insert(customerGroups)
    .values({ storeId: storeB.id, name: 'Nhóm KH B' })
    .returning()
  if (!customerGroupA || !customerGroupB) throw new Error('seed customer group failed')

  const [supplierA] = await base.db
    .insert(suppliers)
    .values({ storeId: base.storeId, name: 'NCC A', code: 'NCC-A' })
    .returning()
  const [supplierB] = await base.db
    .insert(suppliers)
    .values({ storeId: storeB.id, name: 'NCC B', code: 'NCC-B' })
    .returning()
  const [supplierPayB] = await base.db
    .insert(suppliers)
    .values({
      storeId: storeB.id,
      name: 'NCC B (có công nợ)',
      code: 'NCC-B-PAY',
      currentDebt: 500_000,
    })
    .returning()
  if (!supplierA || !supplierB || !supplierPayB) throw new Error('seed supplier failed')

  // Khoản nợ thuộc cửa hàng A (dùng làm debtId ngoại lai trong test /receipts)
  const debtOrderA = await createDebtOrder(base, productA.id, customerA.id)

  // Khoản nợ thuộc cửa hàng B: createDebtOrder() hardcode storeId=env.storeId (A) ở bảng
  // debts nên không tái dùng được cho B, phải tạo tay: đơn ghi nợ B rồi insert debts thủ công.
  const debtOrderB = await createCompletedOrder(base, productB.id, {
    customerId: customerB.id,
    orderOverrides: {
      storeId: storeB.id,
      userId: ownerB.id,
      paymentMethod: 'debt',
      paymentStatus: 'unpaid',
      cashAmount: 0,
    },
  })
  const [debtB] = await base.db
    .insert(debts)
    .values({
      storeId: storeB.id,
      orderId: debtOrderB.order.id,
      customerId: customerB.id,
      amount: debtOrderB.order.total,
      paid: 0,
      remaining: debtOrderB.order.total,
    })
    .returning()
  if (!debtB) throw new Error('seed debt B failed')
  await base.db
    .update(customers)
    .set({ currentDebt: debtOrderB.order.total })
    .where(eq(customers.id, customerB.id))

  // Khách hàng + khoản nợ RIÊNG cho nhóm test /receipts: customerB/debtB ở trên bị các
  // describe khác (debt-adjustments, đơn ghi nợ POS) chạy trước làm đổi currentDebt của
  // customerB, nên không dùng lại được cho case "thành công" cần số dư khớp đúng debtReceiptB.remaining.
  const customerReceiptB = await createCustomer(base, { storeId: storeB.id })
  const debtOrderReceiptB = await createCompletedOrder(base, productB.id, {
    customerId: customerReceiptB.id,
    orderOverrides: {
      storeId: storeB.id,
      userId: ownerB.id,
      paymentMethod: 'debt',
      paymentStatus: 'unpaid',
      cashAmount: 0,
    },
  })
  const [debtReceiptB] = await base.db
    .insert(debts)
    .values({
      storeId: storeB.id,
      orderId: debtOrderReceiptB.order.id,
      customerId: customerReceiptB.id,
      amount: debtOrderReceiptB.order.total,
      paid: 0,
      remaining: debtOrderReceiptB.order.total,
    })
    .returning()
  if (!debtReceiptB) throw new Error('seed debt receipt B failed')
  await base.db
    .update(customers)
    .set({ currentDebt: debtOrderReceiptB.order.total })
    .where(eq(customers.id, customerReceiptB.id))

  // Đơn hàng cửa hàng A: chỉ cần 1 orderItemId "ngoại lai" cho test trả hàng.
  const orderAResult = await createCompletedOrder(base, productA.id)

  // Đơn hàng cửa hàng B: mua số lượng 3 để test trả hàng control (trả 1) không làm đơn
  // full_return, tránh chặn nhầm test violate chạy sau.
  const orderBResult = await createCompletedOrder(base, productB.id, {
    items: [{ productId: productB.id, productName: 'SP factory', unitPrice: 100_000, quantity: 3 }],
    orderOverrides: { storeId: storeB.id, userId: ownerB.id },
  })
  const orderBItem = orderBResult.items[0]
  if (!orderBItem) throw new Error('seed order B item failed')

  fx = {
    base,
    app,
    storeB,
    ownerB,
    productA,
    productB,
    variantA,
    variantB,
    unitConvA,
    unitConvB,
    customerA,
    customerB,
    categoryA,
    categoryB,
    brandA,
    brandB,
    customerGroupA,
    customerGroupB,
    supplierA,
    supplierB,
    supplierPayB,
    priceListA,
    priceListB,
    debtA: { id: debtOrderA.debt.id },
    debtB: { id: debtB.id, remaining: debtB.remaining },
    customerReceiptB,
    debtReceiptB: { id: debtReceiptB.id, remaining: debtReceiptB.remaining },
    orderAItemId: (() => {
      const item = orderAResult.items[0]
      if (!item) throw new Error('seed order A item failed')
      return item.id
    })(),
    orderB: { id: orderBResult.order.id },
    orderBItemId: orderBItem.id,
  }
})

afterAll(async () => {
  await fx.base.close()
})

// ---------------------------------------------------------------------------
// POST /pos/orders
// ---------------------------------------------------------------------------
describe('POST /pos/orders: khóa ngoại: customerId, productId, variantId, unitConversionId, priceListId', () => {
  it('control: customerId + productId đều thuộc B, thanh toán tiền mặt -> thành công', async () => {
    const res = await call(
      fx.app,
      'POST',
      '/api/v1/pos/orders',
      fx.ownerB.authHeader,
      posOrderBody({
        productId: fx.productB.id,
        unitPrice: fx.productB.sellingPrice,
        customerId: fx.customerB.id,
        paymentMethod: 'cash',
      }),
    )
    expectSuccess(res.status)
  })

  it('control: đơn ghi nợ cho khách B -> thành công', async () => {
    const res = await call(
      fx.app,
      'POST',
      '/api/v1/pos/orders',
      fx.ownerB.authHeader,
      posOrderBody({
        productId: fx.productB.id,
        unitPrice: fx.productB.sellingPrice,
        customerId: fx.customerB.id,
        paymentMethod: 'debt',
      }),
    )
    expectSuccess(res.status)
  })

  it.each(['cash', 'transfer', 'combined', 'debt'] as const)(
    'customerId thuộc cửa hàng A, paymentMethod=%s -> bị từ chối, không tạo đơn cho B',
    async (paymentMethod) => {
      const before = await countOrdersForStore(fx.base.db, fx.storeB.id)
      const res = await call(
        fx.app,
        'POST',
        '/api/v1/pos/orders',
        fx.ownerB.authHeader,
        posOrderBody({
          productId: fx.productB.id,
          unitPrice: fx.productB.sellingPrice,
          customerId: fx.customerA.id,
          paymentMethod,
        }),
      )
      expectRejected(res.status, [404])
      const after = await countOrdersForStore(fx.base.db, fx.storeB.id)
      expect(after).toBe(before)
    },
  )

  it('customerId ngẫu nhiên không tồn tại -> 404, KHÔNG phải 500', async () => {
    const res = await call(
      fx.app,
      'POST',
      '/api/v1/pos/orders',
      fx.ownerB.authHeader,
      posOrderBody({
        productId: fx.productB.id,
        unitPrice: fx.productB.sellingPrice,
        customerId: randomUUID(),
        paymentMethod: 'cash',
      }),
    )
    expectRejected(res.status, [404])
  })

  it('productId thuộc cửa hàng A -> 404, không tạo đơn cho B', async () => {
    const before = await countOrdersForStore(fx.base.db, fx.storeB.id)
    const res = await call(
      fx.app,
      'POST',
      '/api/v1/pos/orders',
      fx.ownerB.authHeader,
      posOrderBody({ productId: fx.productA.id, unitPrice: 100_000, paymentMethod: 'cash' }),
    )
    expectRejected(res.status, [404])
    const after = await countOrdersForStore(fx.base.db, fx.storeB.id)
    expect(after).toBe(before)
  })

  it('control: variantId thuộc B -> thành công', async () => {
    const res = await call(
      fx.app,
      'POST',
      '/api/v1/pos/orders',
      fx.ownerB.authHeader,
      posOrderBody({
        productId: fx.productB.id,
        variantId: fx.variantB.id,
        unitPrice: fx.variantB.sellingPrice,
        paymentMethod: 'cash',
      }),
    )
    expectSuccess(res.status)
  })

  it('variantId thuộc cửa hàng A (productId vẫn là B) -> 404', async () => {
    const res = await call(
      fx.app,
      'POST',
      '/api/v1/pos/orders',
      fx.ownerB.authHeader,
      posOrderBody({
        productId: fx.productB.id,
        variantId: fx.variantA.id,
        unitPrice: 100_000,
        paymentMethod: 'cash',
      }),
    )
    expectRejected(res.status, [404])
  })

  it('control: unitConversionId thuộc B -> thành công', async () => {
    const res = await call(
      fx.app,
      'POST',
      '/api/v1/pos/orders',
      fx.ownerB.authHeader,
      posOrderBody({
        productId: fx.productB.id,
        unitConversionId: fx.unitConvB.id,
        unitPrice: fx.unitConvB.sellingPrice,
        paymentMethod: 'cash',
      }),
    )
    expectSuccess(res.status)
  })

  it('unitConversionId thuộc cửa hàng A (productId vẫn là B) -> 400, không tạo đơn', async () => {
    const before = await countOrdersForStore(fx.base.db, fx.storeB.id)
    const res = await call(
      fx.app,
      'POST',
      '/api/v1/pos/orders',
      fx.ownerB.authHeader,
      posOrderBody({
        productId: fx.productB.id,
        unitConversionId: fx.unitConvA.id,
        unitPrice: 100_000,
        paymentMethod: 'cash',
      }),
    )
    expectRejected(res.status, [400])
    const after = await countOrdersForStore(fx.base.db, fx.storeB.id)
    expect(after).toBe(before)
  })

  it('control: priceListId thuộc B -> thành công', async () => {
    const res = await call(
      fx.app,
      'POST',
      '/api/v1/pos/orders',
      fx.ownerB.authHeader,
      posOrderBody({
        productId: fx.productB.id,
        unitPrice: fx.productB.sellingPrice,
        priceListId: fx.priceListB.id,
        paymentMethod: 'cash',
      }),
    )
    expectSuccess(res.status)
  })

  it('priceListId thuộc cửa hàng A -> 400', async () => {
    const res = await call(
      fx.app,
      'POST',
      '/api/v1/pos/orders',
      fx.ownerB.authHeader,
      posOrderBody({
        productId: fx.productB.id,
        unitPrice: 100_000,
        priceListId: fx.priceListA.id,
        paymentMethod: 'cash',
      }),
    )
    expectRejected(res.status, [400])
  })
})

// ---------------------------------------------------------------------------
// POST /sync/push
// ---------------------------------------------------------------------------
describe('POST /sync/push: khóa ngoại: customerId, productId (luôn trả HTTP 200, lỗi nằm trong results[])', () => {
  it('control: đơn tiền mặt hợp lệ -> results[0].status = synced', async () => {
    const res = await call(
      fx.app,
      'POST',
      '/api/v1/sync/push',
      fx.ownerB.authHeader,
      syncPushBody(
        posOrderBody({
          productId: fx.productB.id,
          unitPrice: fx.productB.sellingPrice,
          customerId: fx.customerB.id,
          paymentMethod: 'cash',
        }),
      ),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as SyncPushEnvelope
    expect(body.data.results[0]?.status).toBe('synced')
  })

  it('customerId thuộc A, đơn tiền mặt -> results[0].status=error, code NOT_FOUND, không tạo đơn cho B', async () => {
    const before = await countOrdersForStore(fx.base.db, fx.storeB.id)
    const res = await call(
      fx.app,
      'POST',
      '/api/v1/sync/push',
      fx.ownerB.authHeader,
      syncPushBody(
        posOrderBody({
          productId: fx.productB.id,
          unitPrice: fx.productB.sellingPrice,
          customerId: fx.customerA.id,
          paymentMethod: 'cash',
        }),
      ),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as SyncPushEnvelope
    expect(body.data.results[0]?.status).toBe('error')
    expect(body.data.results[0]?.error?.code).toBe('NOT_FOUND')
    const after = await countOrdersForStore(fx.base.db, fx.storeB.id)
    expect(after).toBe(before)
  })

  it('customerId thuộc A, đơn ghi nợ -> results[0].status=error, code NOT_FOUND', async () => {
    const res = await call(
      fx.app,
      'POST',
      '/api/v1/sync/push',
      fx.ownerB.authHeader,
      syncPushBody(
        posOrderBody({
          productId: fx.productB.id,
          unitPrice: fx.productB.sellingPrice,
          customerId: fx.customerA.id,
          paymentMethod: 'debt',
        }),
      ),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as SyncPushEnvelope
    expect(body.data.results[0]?.status).toBe('error')
    expect(body.data.results[0]?.error?.code).toBe('NOT_FOUND')
  })

  it('productId thuộc A -> results[0].status=error, code NOT_FOUND', async () => {
    const res = await call(
      fx.app,
      'POST',
      '/api/v1/sync/push',
      fx.ownerB.authHeader,
      syncPushBody(
        posOrderBody({ productId: fx.productA.id, unitPrice: 100_000, paymentMethod: 'cash' }),
      ),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as SyncPushEnvelope
    expect(body.data.results[0]?.status).toBe('error')
    expect(body.data.results[0]?.error?.code).toBe('NOT_FOUND')
  })
})

// ---------------------------------------------------------------------------
// POST /category-discounts
// ---------------------------------------------------------------------------
describe('POST /category-discounts: khóa ngoại: categoryId, customerGroupId', () => {
  it('control: categoryId + customerGroupId đều thuộc B -> thành công', async () => {
    const res = await call(fx.app, 'POST', '/api/v1/category-discounts', fx.ownerB.authHeader, {
      categoryId: fx.categoryB.id,
      customerGroupId: fx.customerGroupB.id,
      discountType: 'percent',
      discountValue: 10,
    })
    expectSuccess(res.status)
  })

  it('categoryId thuộc A -> 404', async () => {
    const res = await call(fx.app, 'POST', '/api/v1/category-discounts', fx.ownerB.authHeader, {
      categoryId: fx.categoryA.id,
      customerGroupId: fx.customerGroupB.id,
      discountType: 'percent',
      discountValue: 10,
    })
    expectRejected(res.status, [404])
  })

  it('customerGroupId thuộc A -> 404', async () => {
    const res = await call(fx.app, 'POST', '/api/v1/category-discounts', fx.ownerB.authHeader, {
      categoryId: fx.categoryB.id,
      customerGroupId: fx.customerGroupA.id,
      discountType: 'percent',
      discountValue: 10,
    })
    expectRejected(res.status, [404])
  })
})

// ---------------------------------------------------------------------------
// POST /customer-prices
// ---------------------------------------------------------------------------
describe('POST /customer-prices: khóa ngoại: customerId, productId', () => {
  it('control: customerId + productId đều thuộc B -> thành công', async () => {
    const res = await call(fx.app, 'POST', '/api/v1/customer-prices', fx.ownerB.authHeader, {
      customerId: fx.customerB.id,
      productId: fx.productB.id,
      price: 90_000,
    })
    expectSuccess(res.status)
  })

  it('customerId thuộc A -> 404', async () => {
    const res = await call(fx.app, 'POST', '/api/v1/customer-prices', fx.ownerB.authHeader, {
      customerId: fx.customerA.id,
      productId: fx.productB.id,
      price: 90_000,
    })
    expectRejected(res.status, [404])
  })

  it('productId thuộc A -> 404', async () => {
    const res = await call(fx.app, 'POST', '/api/v1/customer-prices', fx.ownerB.authHeader, {
      customerId: fx.customerB.id,
      productId: fx.productA.id,
      price: 90_000,
    })
    expectRejected(res.status, [404])
  })
})

// ---------------------------------------------------------------------------
// POST /debt-adjustments (chỉ owner)
// ---------------------------------------------------------------------------
describe('POST /debt-adjustments: khóa ngoại: customerId', () => {
  it('control: customerId thuộc B -> thành công', async () => {
    const res = await call(fx.app, 'POST', '/api/v1/debt-adjustments', fx.ownerB.authHeader, {
      customerId: fx.customerB.id,
      newAmount: 50_000,
      reason: 'Điều chỉnh test',
    })
    expectSuccess(res.status)
  })

  it('customerId thuộc A -> 404', async () => {
    const res = await call(fx.app, 'POST', '/api/v1/debt-adjustments', fx.ownerB.authHeader, {
      customerId: fx.customerA.id,
      newAmount: 50_000,
      reason: 'Điều chỉnh test',
    })
    expectRejected(res.status, [404])
  })
})

// ---------------------------------------------------------------------------
// POST /orders/:id/returns
// ---------------------------------------------------------------------------
describe('POST /orders/:id/returns: khóa ngoại: orderItemId', () => {
  it('control: trả hàng dòng thuộc chính đơn của B -> thành công', async () => {
    const res = await call(
      fx.app,
      'POST',
      `/api/v1/orders/${fx.orderB.id}/returns`,
      fx.ownerB.authHeader,
      { items: [{ orderItemId: fx.orderBItemId, quantity: 1, reason: 'defective' }] },
    )
    expectSuccess(res.status)
  })

  it('orderItemId thuộc đơn hàng của cửa hàng A, gắn vào đơn của B -> 400 (không thuộc đơn này)', async () => {
    const res = await call(
      fx.app,
      'POST',
      `/api/v1/orders/${fx.orderB.id}/returns`,
      fx.ownerB.authHeader,
      { items: [{ orderItemId: fx.orderAItemId, quantity: 1, reason: 'defective' }] },
    )
    expectRejected(res.status, [400, 404])
  })
})

// ---------------------------------------------------------------------------
// POST /price-lists: items[].productId
// ---------------------------------------------------------------------------
describe('POST /price-lists: khóa ngoại: items[].productId', () => {
  it('control: items[].productId thuộc B -> thành công', async () => {
    const res = await call(fx.app, 'POST', '/api/v1/price-lists', fx.ownerB.authHeader, {
      method: 'direct',
      name: `BG control ${randomUUID().slice(0, 8)}`,
      items: [{ productId: fx.productB.id, price: 90_000 }],
    })
    expectSuccess(res.status)
  })

  it('items[].productId thuộc A -> 400', async () => {
    const res = await call(fx.app, 'POST', '/api/v1/price-lists', fx.ownerB.authHeader, {
      method: 'direct',
      name: `BG violate ${randomUUID().slice(0, 8)}`,
      items: [{ productId: fx.productA.id, price: 90_000 }],
    })
    expectRejected(res.status, [400])
  })
})

// ---------------------------------------------------------------------------
// POST /price-lists/:id/items
// ---------------------------------------------------------------------------
describe('POST /price-lists/:id/items: khóa ngoại: productId, và priceListId trên URL', () => {
  it('control: bảng giá B + productId B -> thành công', async () => {
    const res = await call(
      fx.app,
      'POST',
      `/api/v1/price-lists/${fx.priceListB.id}/items`,
      fx.ownerB.authHeader,
      { productId: fx.productB.id, price: 95_000 },
    )
    expectSuccess(res.status)
  })

  it('productId thuộc A (bảng giá vẫn là B) -> 404', async () => {
    const res = await call(
      fx.app,
      'POST',
      `/api/v1/price-lists/${fx.priceListB.id}/items`,
      fx.ownerB.authHeader,
      { productId: fx.productA.id, price: 95_000 },
    )
    expectRejected(res.status, [404])
  })

  it('priceListId trên URL thuộc A -> 404', async () => {
    const res = await call(
      fx.app,
      'POST',
      `/api/v1/price-lists/${fx.priceListA.id}/items`,
      fx.ownerB.authHeader,
      { productId: fx.productB.id, price: 95_000 },
    )
    expectRejected(res.status, [404])
  })
})

// ---------------------------------------------------------------------------
// POST /products, PATCH /products/:id: categoryId, brandId
// ---------------------------------------------------------------------------
describe('POST/PATCH /products: khóa ngoại: categoryId, brandId', () => {
  it('control: categoryId + brandId đều thuộc B -> thành công', async () => {
    const res = await call(fx.app, 'POST', '/api/v1/products', fx.ownerB.authHeader, {
      name: `SP control ${randomUUID().slice(0, 8)}`,
      sku: `SKU-CTRL-${randomUUID().slice(0, 8)}`,
      unit: 'Cái',
      sellingPrice: 100_000,
      categoryId: fx.categoryB.id,
      brandId: fx.brandB.id,
    })
    expectSuccess(res.status)
  })

  it('categoryId thuộc A -> 404', async () => {
    const res = await call(fx.app, 'POST', '/api/v1/products', fx.ownerB.authHeader, {
      name: `SP violate cat ${randomUUID().slice(0, 8)}`,
      sku: `SKU-VC-${randomUUID().slice(0, 8)}`,
      unit: 'Cái',
      sellingPrice: 100_000,
      categoryId: fx.categoryA.id,
      brandId: fx.brandB.id,
    })
    expectRejected(res.status, [404])
  })

  it('brandId thuộc A -> 404', async () => {
    const res = await call(fx.app, 'POST', '/api/v1/products', fx.ownerB.authHeader, {
      name: `SP violate brand ${randomUUID().slice(0, 8)}`,
      sku: `SKU-VB-${randomUUID().slice(0, 8)}`,
      unit: 'Cái',
      sellingPrice: 100_000,
      categoryId: fx.categoryB.id,
      brandId: fx.brandA.id,
    })
    expectRejected(res.status, [404])
  })

  it('control PATCH: đổi categoryId sang B -> thành công', async () => {
    const res = await call(
      fx.app,
      'PATCH',
      `/api/v1/products/${fx.productB.id}`,
      fx.ownerB.authHeader,
      { categoryId: fx.categoryB.id },
    )
    expectSuccess(res.status)
  })

  it('PATCH categoryId sang A -> 404', async () => {
    const res = await call(
      fx.app,
      'PATCH',
      `/api/v1/products/${fx.productB.id}`,
      fx.ownerB.authHeader,
      { categoryId: fx.categoryA.id },
    )
    expectRejected(res.status, [404])
  })
})

// ---------------------------------------------------------------------------
// POST /customers, PATCH /customers/:id: groupId
// ---------------------------------------------------------------------------
describe('POST/PATCH /customers: khóa ngoại: groupId', () => {
  it('control: groupId thuộc B -> thành công', async () => {
    const res = await call(fx.app, 'POST', '/api/v1/customers', fx.ownerB.authHeader, {
      name: 'KH control',
      phone: `090${Math.floor(1_000_000 + Math.random() * 8_000_000)}`,
      groupId: fx.customerGroupB.id,
    })
    expectSuccess(res.status)
  })

  it('groupId thuộc A -> 404', async () => {
    const res = await call(fx.app, 'POST', '/api/v1/customers', fx.ownerB.authHeader, {
      name: 'KH violate',
      phone: `090${Math.floor(1_000_000 + Math.random() * 8_000_000)}`,
      groupId: fx.customerGroupA.id,
    })
    expectRejected(res.status, [404])
  })

  it('PATCH groupId sang A -> 404', async () => {
    const res = await call(
      fx.app,
      'PATCH',
      `/api/v1/customers/${fx.customerB.id}`,
      fx.ownerB.authHeader,
      { groupId: fx.customerGroupA.id },
    )
    expectRejected(res.status, [404])
  })
})

// ---------------------------------------------------------------------------
// POST /customer-groups: defaultPriceListId
// ---------------------------------------------------------------------------
describe('POST /customer-groups: khóa ngoại: defaultPriceListId', () => {
  it('control: defaultPriceListId thuộc B -> thành công', async () => {
    const res = await call(fx.app, 'POST', '/api/v1/customer-groups', fx.ownerB.authHeader, {
      name: `Nhóm control ${randomUUID().slice(0, 8)}`,
      defaultPriceListId: fx.priceListB.id,
    })
    expectSuccess(res.status)
  })

  it('defaultPriceListId thuộc A -> 404', async () => {
    const res = await call(fx.app, 'POST', '/api/v1/customer-groups', fx.ownerB.authHeader, {
      name: `Nhóm violate ${randomUUID().slice(0, 8)}`,
      defaultPriceListId: fx.priceListA.id,
    })
    expectRejected(res.status, [404])
  })
})

// ---------------------------------------------------------------------------
// POST /categories: parentId
// ---------------------------------------------------------------------------
describe('POST /categories: khóa ngoại: parentId', () => {
  it('control: parentId thuộc B -> thành công', async () => {
    const res = await call(fx.app, 'POST', '/api/v1/categories', fx.ownerB.authHeader, {
      name: `Danh mục con B ${randomUUID().slice(0, 8)}`,
      parentId: fx.categoryB.id,
    })
    expectSuccess(res.status)
  })

  it('parentId thuộc A -> 404', async () => {
    const res = await call(fx.app, 'POST', '/api/v1/categories', fx.ownerB.authHeader, {
      name: `Danh mục con violate ${randomUUID().slice(0, 8)}`,
      parentId: fx.categoryA.id,
    })
    expectRejected(res.status, [404])
  })
})

// ---------------------------------------------------------------------------
// POST /purchase-orders: supplierId, items[].productId
// ---------------------------------------------------------------------------
describe('POST /purchase-orders: khóa ngoại: supplierId, items[].productId', () => {
  it('control: supplierId + productId đều thuộc B -> thành công', async () => {
    const res = await call(fx.app, 'POST', '/api/v1/purchase-orders', fx.ownerB.authHeader, {
      supplierId: fx.supplierB.id,
      items: [{ productId: fx.productB.id, quantity: 1, unitPrice: 50_000 }],
    })
    expectSuccess(res.status)
  })

  it('supplierId thuộc A -> 404', async () => {
    const res = await call(fx.app, 'POST', '/api/v1/purchase-orders', fx.ownerB.authHeader, {
      supplierId: fx.supplierA.id,
      items: [{ productId: fx.productB.id, quantity: 1, unitPrice: 50_000 }],
    })
    expectRejected(res.status, [404])
  })

  it('items[].productId thuộc A -> 404', async () => {
    const res = await call(fx.app, 'POST', '/api/v1/purchase-orders', fx.ownerB.authHeader, {
      supplierId: fx.supplierB.id,
      items: [{ productId: fx.productA.id, quantity: 1, unitPrice: 50_000 }],
    })
    expectRejected(res.status, [404])
  })
})

// ---------------------------------------------------------------------------
// POST /receipts: customerId, allocations[].debtId
// ---------------------------------------------------------------------------
describe('POST /receipts: khóa ngoại: customerId, allocations[].debtId', () => {
  it('control: customerId + debtId đều thuộc B -> thành công', async () => {
    const res = await call(fx.app, 'POST', '/api/v1/receipts', fx.ownerB.authHeader, {
      customerId: fx.customerReceiptB.id,
      amount: fx.debtReceiptB.remaining,
      allocationMode: 'manual',
      allocations: [{ debtId: fx.debtReceiptB.id, amount: fx.debtReceiptB.remaining }],
    })
    expectSuccess(res.status)
  })

  it('customerId thuộc A -> 404', async () => {
    const res = await call(fx.app, 'POST', '/api/v1/receipts', fx.ownerB.authHeader, {
      customerId: fx.customerA.id,
      amount: 1_000,
      allocationMode: 'manual',
      allocations: [{ debtId: fx.debtA.id, amount: 1_000 }],
    })
    expectRejected(res.status, [404])
  })

  it('allocations[].debtId thuộc A (customerId vẫn là B) -> 422 (khoản nợ không hợp lệ)', async () => {
    // Dùng customerB (không phải customerReceiptB) vì case control ở trên đã trả hết nợ của
    // customerReceiptB; customerB vẫn còn dư nợ 50_000 từ case control của /debt-adjustments.
    const res = await call(fx.app, 'POST', '/api/v1/receipts', fx.ownerB.authHeader, {
      customerId: fx.customerB.id,
      amount: 1_000,
      allocationMode: 'manual',
      allocations: [{ debtId: fx.debtA.id, amount: 1_000 }],
    })
    expectRejected(res.status, [422])
  })
})

// ---------------------------------------------------------------------------
// POST /stock-checks, PATCH /stock-checks/:id: items[].productId
// ---------------------------------------------------------------------------
describe('POST/PATCH /stock-checks: khóa ngoại: items[].productId', () => {
  it('control: items[].productId thuộc B -> thành công', async () => {
    const res = await call(fx.app, 'POST', '/api/v1/stock-checks', fx.ownerB.authHeader, {
      items: [{ productId: fx.productB.id, actualQty: 5 }],
    })
    expectSuccess(res.status)
  })

  it('items[].productId thuộc A -> 404', async () => {
    const res = await call(fx.app, 'POST', '/api/v1/stock-checks', fx.ownerB.authHeader, {
      items: [{ productId: fx.productA.id, actualQty: 5 }],
    })
    expectRejected(res.status, [404])
  })

  it('PATCH items[].productId thuộc A trên phiếu draft của B -> 404', async () => {
    const createRes = await call(fx.app, 'POST', '/api/v1/stock-checks', fx.ownerB.authHeader, {
      items: [{ productId: fx.productB.id, actualQty: 5 }],
    })
    expectSuccess(createRes.status)
    const created = (await createRes.json()) as ApiEnvelope
    const stockCheckId = (created.data as { id: string }).id

    const res = await call(
      fx.app,
      'PATCH',
      `/api/v1/stock-checks/${stockCheckId}`,
      fx.ownerB.authHeader,
      { items: [{ productId: fx.productA.id, actualQty: 7 }] },
    )
    expectRejected(res.status, [404])
  })
})

// ---------------------------------------------------------------------------
// POST /supplier-debt-adjustments (chỉ owner): supplierId
// ---------------------------------------------------------------------------
describe('POST /supplier-debt-adjustments: khóa ngoại: supplierId', () => {
  it('control: supplierId thuộc B -> thành công', async () => {
    const res = await call(
      fx.app,
      'POST',
      '/api/v1/supplier-debt-adjustments',
      fx.ownerB.authHeader,
      { supplierId: fx.supplierB.id, newAmount: 20_000, reason: 'Điều chỉnh test' },
    )
    expectSuccess(res.status)
  })

  it('supplierId thuộc A -> 404', async () => {
    const res = await call(
      fx.app,
      'POST',
      '/api/v1/supplier-debt-adjustments',
      fx.ownerB.authHeader,
      { supplierId: fx.supplierA.id, newAmount: 20_000, reason: 'Điều chỉnh test' },
    )
    expectRejected(res.status, [404])
  })
})

// ---------------------------------------------------------------------------
// POST /supplier-payments (chỉ owner): supplierId
// ---------------------------------------------------------------------------
describe('POST /supplier-payments: khóa ngoại: supplierId', () => {
  it('control: supplierId thuộc B (có công nợ) -> thành công', async () => {
    const res = await call(fx.app, 'POST', '/api/v1/supplier-payments', fx.ownerB.authHeader, {
      supplierId: fx.supplierPayB.id,
      amount: 100_000,
    })
    expectSuccess(res.status)
  })

  it('supplierId thuộc A -> 404', async () => {
    const res = await call(fx.app, 'POST', '/api/v1/supplier-payments', fx.ownerB.authHeader, {
      supplierId: fx.supplierA.id,
      amount: 100_000,
    })
    expectRejected(res.status, [404])
  })
})

// ---------------------------------------------------------------------------
// PUT /volume-prices/products/:productId: productId trên URL
// ---------------------------------------------------------------------------
describe('PUT /volume-prices/products/:productId: khóa ngoại: productId trên URL', () => {
  it('control: productId thuộc B -> thành công', async () => {
    const res = await call(
      fx.app,
      'PUT',
      `/api/v1/volume-prices/products/${fx.productB.id}`,
      fx.ownerB.authHeader,
      { tiers: [] },
    )
    expectSuccess(res.status)
  })

  it('productId thuộc A -> 404', async () => {
    const res = await call(
      fx.app,
      'PUT',
      `/api/v1/volume-prices/products/${fx.productA.id}`,
      fx.ownerB.authHeader,
      { tiers: [] },
    )
    expectRejected(res.status, [404])
  })
})

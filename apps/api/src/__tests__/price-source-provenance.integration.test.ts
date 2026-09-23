/**
 * Issue #32: Price Source Provenance — Integration Tests
 *
 * Covers all 6 price source types plus:
 * - Forgery protection (server ignores client labels)
 * - Offline sync (server-determined source persisted)
 * - Order detail API returns persisted source
 * - Snapshot immutability after rule change
 * - Variant and unit conversion price source paths
 * - Precedence (higher tier wins)
 */
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@kiotviet-lite/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kiotviet-lite/notifications')>()),
  notify: vi.fn().mockResolvedValue([{ ok: true }]),
}))

import {
  categories,
  categoryDiscounts,
  customerGroups,
  customerPrices,
  orderItems,
  priceListItems,
  priceLists,
  volumePrices,
} from '@kiotviet-lite/shared'

import { createOrdersRoutes } from '../routes/orders.routes.js'
import { createPosRoutes } from '../routes/pos.routes.js'
import { createSyncRoutes } from '../routes/sync.routes.js'
import {
  createCustomer,
  createProduct,
  createUnitConversion,
  createVariant,
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

interface Env {
  base: TestEnv
  posApp: ReturnType<typeof createPosRoutes>
  ordersApp: ReturnType<typeof createOrdersRoutes>
  syncApp: ReturnType<typeof createSyncRoutes>
}

async function setup(): Promise<Env> {
  const base = await createTestEnv()
  const posApp = createPosRoutes({ db: base.db })
  const ordersApp = createOrdersRoutes({ db: base.db })
  const syncApp = createSyncRoutes({ db: base.db })
  return { base, posApp, ordersApp, syncApp }
}

interface OrderResponse {
  data: {
    id: string
    items: Array<{ priceSource: string | null; priceSourceDetail: string | null }>
  }
}

interface DetailResponse {
  data: {
    items: Array<{
      priceSource: string | null
      priceSourceDetail: string | null
      unitPrice: number
    }>
  }
}

interface SyncResponse {
  data: {
    results: Array<{ clientId: string; serverId: string; status: string }>
  }
}

async function createOrder(
  app: ReturnType<typeof createPosRoutes>,
  body: Record<string, unknown>,
  authHeader: { Authorization: string },
): Promise<{ status: number; body: OrderResponse }> {
  const res = await app.request('/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, body: JSON.parse(text) as OrderResponse }
}

async function getOrderDetail(
  app: ReturnType<typeof createOrdersRoutes>,
  orderId: string,
  authHeader: { Authorization: string },
): Promise<{ status: number; body: DetailResponse }> {
  const res = await app.request(`/${orderId}`, {
    method: 'GET',
    headers: authHeader,
  })
  const text = await res.text()
  return { status: res.status, body: JSON.parse(text) as DetailResponse }
}

describe('#32 Price Source Provenance', () => {
  let env: Env

  beforeAll(async () => {
    env = await setup()
  })

  it('PS-1: POS retail_price => priceSource persisted', async () => {
    const p1 = await createProduct(env.base, { sellingPrice: 100_000 })

    const res = await createOrder(
      env.posApp,
      {
        subtotal: 100_000,
        discountValue: 0,
        discountAmount: 0,
        total: 100_000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 100_000,
        transferAmount: 0,
        debtLimitOverridden: false,
        items: [
          {
            productId: p1.id,
            productName: p1.name,
            unitPrice: 100_000,
            quantity: 1,
            lineTotal: 100_000,
            originalPrice: null,
            priceOverride: false,
          },
        ],
      },
      env.base.owner.authHeader,
    )

    expect(res.status).toBe(201)
    const dbItems = await env.base.db
      .select({
        priceSource: orderItems.priceSource,
        priceSourceDetail: orderItems.priceSourceDetail,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, res.body.data.id))

    expect(dbItems[0]!.priceSource).toBe('retail_price')
    expect(dbItems[0]!.priceSourceDetail).toBeNull()
    expect(res.body.data.items[0]!.priceSource).toBe('retail_price')
  })

  it('PS-2: manual_override + PIN => priceSource = "manual_override"', async () => {
    const p1 = await createProduct(env.base, { sellingPrice: 100_000 })

    const res = await createOrder(
      env.posApp,
      {
        subtotal: 80_000,
        discountValue: 0,
        discountAmount: 0,
        total: 80_000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 80_000,
        transferAmount: 0,
        debtLimitOverridden: false,
        priceOverridePin: env.base.owner.pin,
        items: [
          {
            productId: p1.id,
            productName: p1.name,
            unitPrice: 80_000,
            quantity: 1,
            lineTotal: 80_000,
            originalPrice: 100_000,
            priceOverride: true,
            priceOverrideReason: 'Khách quen',
          },
        ],
      },
      env.base.owner.authHeader,
    )

    expect(res.status).toBe(201)
    const dbItems = await env.base.db
      .select({
        priceSource: orderItems.priceSource,
        priceSourceDetail: orderItems.priceSourceDetail,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, res.body.data.id))

    expect(dbItems[0]!.priceSource).toBe('manual_override')
    expect(dbItems[0]!.priceSourceDetail).toBe('Khách quen')
  })

  it('PS-3: volume_price => priceSource persisted', async () => {
    const p1 = await createProduct(env.base, { sellingPrice: 100_000 })
    await env.base.db.insert(volumePrices).values({
      storeId: env.base.storeId,
      productId: p1.id,
      minQty: 5,
      price: 80_000,
    })

    const res = await createOrder(
      env.posApp,
      {
        subtotal: 400_000,
        discountValue: 0,
        discountAmount: 0,
        total: 400_000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 400_000,
        transferAmount: 0,
        debtLimitOverridden: false,
        items: [
          {
            productId: p1.id,
            productName: p1.name,
            unitPrice: 80_000,
            quantity: 5,
            lineTotal: 400_000,
            originalPrice: null,
            priceOverride: false,
          },
        ],
      },
      env.base.owner.authHeader,
    )

    expect(res.status).toBe(201)
    const dbItems = await env.base.db
      .select({
        priceSource: orderItems.priceSource,
        priceSourceDetail: orderItems.priceSourceDetail,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, res.body.data.id))

    expect(dbItems[0]!.priceSource).toBe('volume_price')
    expect(dbItems[0]!.priceSourceDetail).toContain('SL >= 5')
  })

  it('PS-4: customer_price => priceSource persisted', async () => {
    const p1 = await createProduct(env.base, { sellingPrice: 100_000 })
    const cust = await createCustomer(env.base)
    await env.base.db.insert(customerPrices).values({
      storeId: env.base.storeId,
      customerId: cust.id,
      productId: p1.id,
      price: 75_000,
    })

    const res = await createOrder(
      env.posApp,
      {
        customerId: cust.id,
        subtotal: 75_000,
        discountValue: 0,
        discountAmount: 0,
        total: 75_000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 75_000,
        transferAmount: 0,
        debtLimitOverridden: false,
        items: [
          {
            productId: p1.id,
            productName: p1.name,
            unitPrice: 75_000,
            quantity: 1,
            lineTotal: 75_000,
            originalPrice: null,
            priceOverride: false,
          },
        ],
      },
      env.base.owner.authHeader,
    )

    expect(res.status).toBe(201)
    const dbItems = await env.base.db
      .select({ priceSource: orderItems.priceSource })
      .from(orderItems)
      .where(eq(orderItems.orderId, res.body.data.id))

    expect(dbItems[0]!.priceSource).toBe('customer_price')
  })

  it('PS-5: offline sync persists server-determined source', async () => {
    const p1 = await createProduct(env.base, { sellingPrice: 100_000 })

    const res = await env.syncApp.request('/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...env.base.owner.authHeader },
      body: JSON.stringify({
        clientId: '55555555-5555-5555-5555-555555555555',
        orders: [
          {
            clientId: '66666666-6666-6666-6666-666666666666',
            createdAt: new Date().toISOString(),
            orderData: {
              subtotal: 50_000,
              discountValue: 0,
              discountAmount: 0,
              total: 50_000,
              paymentMethod: 'cash',
              paymentStatus: 'paid',
              cashAmount: 50_000,
              debtLimitOverridden: false,
              items: [
                {
                  productId: p1.id,
                  productName: p1.name,
                  unitPrice: 50_000,
                  quantity: 1,
                  lineTotal: 50_000,
                  originalPrice: 100_000,
                  priceOverride: false,
                },
              ],
            },
          },
        ],
      }),
    })
    const syncBody = (await res.json()) as SyncResponse
    expect(res.status).toBe(200)
    expect(syncBody.data.results[0]!.status).toBe('synced')

    const dbItems = await env.base.db
      .select({ priceSource: orderItems.priceSource, unitPrice: orderItems.unitPrice })
      .from(orderItems)
      .where(eq(orderItems.orderId, syncBody.data.results[0]!.serverId))

    expect(dbItems[0]!.priceSource).toBe('retail_price')
    expect(dbItems[0]!.unitPrice).toBe(100_000)
  })

  it('PS-6: server ignores client-declared priceSource (forgery)', async () => {
    const p1 = await createProduct(env.base, { sellingPrice: 100_000 })

    const res = await createOrder(
      env.posApp,
      {
        subtotal: 100_000,
        discountValue: 0,
        discountAmount: 0,
        total: 100_000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 100_000,
        transferAmount: 0,
        debtLimitOverridden: false,
        items: [
          {
            productId: p1.id,
            productName: p1.name,
            unitPrice: 100_000,
            quantity: 1,
            lineTotal: 100_000,
            originalPrice: null,
            priceOverride: false,
            priceSource: 'customer_price',
            priceSourceDetail: 'Fake',
          },
        ],
      },
      env.base.owner.authHeader,
    )

    expect(res.status).toBe(201)
    const dbItems = await env.base.db
      .select({
        priceSource: orderItems.priceSource,
        priceSourceDetail: orderItems.priceSourceDetail,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, res.body.data.id))

    expect(dbItems[0]!.priceSource).toBe('retail_price')
    expect(dbItems[0]!.priceSourceDetail).toBeNull()
  })

  it('PS-7: order detail API returns persisted priceSource', async () => {
    const p1 = await createProduct(env.base, { sellingPrice: 100_000 })
    const createRes = await createOrder(
      env.posApp,
      {
        subtotal: 100_000,
        discountValue: 0,
        discountAmount: 0,
        total: 100_000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 100_000,
        transferAmount: 0,
        debtLimitOverridden: false,
        items: [
          {
            productId: p1.id,
            productName: p1.name,
            unitPrice: 100_000,
            quantity: 1,
            lineTotal: 100_000,
            originalPrice: null,
            priceOverride: false,
          },
        ],
      },
      env.base.owner.authHeader,
    )
    expect(createRes.status).toBe(201)

    const detailRes = await getOrderDetail(
      env.ordersApp,
      createRes.body.data.id,
      env.base.owner.authHeader,
    )
    expect(detailRes.status).toBe(200)
    expect(detailRes.body.data.items[0]!.priceSource).toBe('retail_price')
  })

  it('PS-8: category_discount => priceSource persisted', async () => {
    // Create category, product in that category, customer, and a category discount
    const [cat] = await env.base.db
      .insert(categories)
      .values({ storeId: env.base.storeId, name: 'Danh mục test PS8' })
      .returning()
    const p1 = await createProduct(env.base, {
      sellingPrice: 100_000,
      categoryId: cat!.id,
    })
    const cust = await createCustomer(env.base)

    // Create a category discount: 20% for this customer on this category
    await env.base.db.insert(categoryDiscounts).values({
      storeId: env.base.storeId,
      categoryId: cat!.id,
      customerId: cust.id,
      discountType: 'percent',
      discountValue: 20,
      minQty: 1,
    })

    const expectedPrice = 80_000 // 100k - 20%
    const res = await createOrder(
      env.posApp,
      {
        customerId: cust.id,
        subtotal: expectedPrice,
        discountValue: 0,
        discountAmount: 0,
        total: expectedPrice,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: expectedPrice,
        transferAmount: 0,
        debtLimitOverridden: false,
        items: [
          {
            productId: p1.id,
            productName: p1.name,
            unitPrice: expectedPrice,
            quantity: 1,
            lineTotal: expectedPrice,
            originalPrice: null,
            priceOverride: false,
          },
        ],
      },
      env.base.owner.authHeader,
    )

    expect(res.status).toBe(201)
    const dbItems = await env.base.db
      .select({
        priceSource: orderItems.priceSource,
        priceSourceDetail: orderItems.priceSourceDetail,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, res.body.data.id))

    expect(dbItems[0]!.priceSource).toBe('category_discount')
    expect(dbItems[0]!.priceSourceDetail).toContain('20%')
  })

  it('PS-9: price_list (group) => priceSource persisted', async () => {
    const p1 = await createProduct(env.base, { sellingPrice: 100_000 })

    // Create price list
    const [pl] = await env.base.db
      .insert(priceLists)
      .values({
        storeId: env.base.storeId,
        name: 'Bảng giá sỉ PS9',
        method: 'direct',
        isActive: true,
      })
      .returning()

    // Create price list item
    await env.base.db.insert(priceListItems).values({
      priceListId: pl!.id,
      productId: p1.id,
      price: 85_000,
    })

    // Create customer group with this price list
    const [group] = await env.base.db
      .insert(customerGroups)
      .values({
        storeId: env.base.storeId,
        name: 'Nhóm sỉ PS9',
        defaultPriceListId: pl!.id,
      })
      .returning()

    // Create customer in that group
    const cust = await createCustomer(env.base, { groupId: group!.id })

    const res = await createOrder(
      env.posApp,
      {
        customerId: cust.id,
        subtotal: 85_000,
        discountValue: 0,
        discountAmount: 0,
        total: 85_000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 85_000,
        transferAmount: 0,
        debtLimitOverridden: false,
        items: [
          {
            productId: p1.id,
            productName: p1.name,
            unitPrice: 85_000,
            quantity: 1,
            lineTotal: 85_000,
            originalPrice: null,
            priceOverride: false,
          },
        ],
      },
      env.base.owner.authHeader,
    )

    expect(res.status).toBe(201)
    const dbItems = await env.base.db
      .select({
        priceSource: orderItems.priceSource,
        priceSourceDetail: orderItems.priceSourceDetail,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, res.body.data.id))

    expect(dbItems[0]!.priceSource).toBe('price_list')
    expect(dbItems[0]!.priceSourceDetail).toContain('Bảng giá sỉ PS9')
  })

  it('PS-10: snapshot immutable after pricing rule deleted', async () => {
    const p1 = await createProduct(env.base, { sellingPrice: 100_000 })
    const cust = await createCustomer(env.base)
    const [cpRow] = await env.base.db
      .insert(customerPrices)
      .values({ storeId: env.base.storeId, customerId: cust.id, productId: p1.id, price: 70_000 })
      .returning()

    // Create order at customer_price
    const res = await createOrder(
      env.posApp,
      {
        customerId: cust.id,
        subtotal: 70_000,
        discountValue: 0,
        discountAmount: 0,
        total: 70_000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 70_000,
        transferAmount: 0,
        debtLimitOverridden: false,
        items: [
          {
            productId: p1.id,
            productName: p1.name,
            unitPrice: 70_000,
            quantity: 1,
            lineTotal: 70_000,
            originalPrice: null,
            priceOverride: false,
          },
        ],
      },
      env.base.owner.authHeader,
    )
    expect(res.status).toBe(201)
    const orderId = res.body.data.id

    // Delete the customer price rule
    await env.base.db.delete(customerPrices).where(eq(customerPrices.id, cpRow!.id))

    // Verify snapshot is unchanged
    const detailRes = await getOrderDetail(env.ordersApp, orderId, env.base.owner.authHeader)
    expect(detailRes.status).toBe(200)
    expect(detailRes.body.data.items[0]!.priceSource).toBe('customer_price')
    expect(detailRes.body.data.items[0]!.unitPrice).toBe(70_000)
  })

  it('PS-11: variant price => priceSource persisted with correct source', async () => {
    const p1 = await createProduct(env.base, { sellingPrice: 100_000, withVariants: true })
    const v1 = await createVariant(env.base, p1.id, { sellingPrice: 120_000 })

    const res = await createOrder(
      env.posApp,
      {
        subtotal: 120_000,
        discountValue: 0,
        discountAmount: 0,
        total: 120_000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 120_000,
        transferAmount: 0,
        debtLimitOverridden: false,
        items: [
          {
            productId: p1.id,
            variantId: v1.id,
            productName: p1.name,
            variantName: v1.attribute1Value,
            unitPrice: 120_000,
            quantity: 1,
            lineTotal: 120_000,
            originalPrice: null,
            priceOverride: false,
          },
        ],
      },
      env.base.owner.authHeader,
    )

    expect(res.status).toBe(201)
    const dbItems = await env.base.db
      .select({ priceSource: orderItems.priceSource })
      .from(orderItems)
      .where(eq(orderItems.orderId, res.body.data.id))

    expect(dbItems[0]!.priceSource).toBe('retail_price')
  })

  it('PS-12: unit conversion price => priceSource persisted', async () => {
    const p1 = await createProduct(env.base, { sellingPrice: 100_000 })
    const uc = await createUnitConversion(env.base, p1.id, {
      unit: 'thùng',
      conversionFactor: 12,
      sellingPrice: 1_100_000,
    })

    const res = await createOrder(
      env.posApp,
      {
        subtotal: 1_100_000,
        discountValue: 0,
        discountAmount: 0,
        total: 1_100_000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 1_100_000,
        transferAmount: 0,
        debtLimitOverridden: false,
        items: [
          {
            productId: p1.id,
            productName: p1.name,
            unitPrice: 1_100_000,
            quantity: 1,
            lineTotal: 1_100_000,
            originalPrice: null,
            priceOverride: false,
            unitConversionId: uc.id,
            unit: 'thùng',
          },
        ],
      },
      env.base.owner.authHeader,
    )

    expect(res.status).toBe(201)
    const dbItems = await env.base.db
      .select({ priceSource: orderItems.priceSource })
      .from(orderItems)
      .where(eq(orderItems.orderId, res.body.data.id))

    // Unit conversion with explicit sellingPrice resolves to retail_price
    expect(dbItems[0]!.priceSource).toBe('retail_price')
  })

  it('PS-13: customer_price beats volume_price (tier precedence)', async () => {
    const p1 = await createProduct(env.base, { sellingPrice: 100_000 })
    const cust = await createCustomer(env.base)

    // Tier 1: customer_price = 60_000
    await env.base.db.insert(customerPrices).values({
      storeId: env.base.storeId,
      customerId: cust.id,
      productId: p1.id,
      price: 60_000,
    })

    // Tier 4: volume_price qty>=5 = 80_000
    await env.base.db.insert(volumePrices).values({
      storeId: env.base.storeId,
      productId: p1.id,
      minQty: 5,
      price: 80_000,
    })

    // Order with qty=5: customer_price (tier 1) should win over volume_price (tier 4)
    const res = await createOrder(
      env.posApp,
      {
        customerId: cust.id,
        subtotal: 300_000,
        discountValue: 0,
        discountAmount: 0,
        total: 300_000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 300_000,
        transferAmount: 0,
        debtLimitOverridden: false,
        items: [
          {
            productId: p1.id,
            productName: p1.name,
            unitPrice: 60_000,
            quantity: 5,
            lineTotal: 300_000,
            originalPrice: null,
            priceOverride: false,
          },
        ],
      },
      env.base.owner.authHeader,
    )

    expect(res.status).toBe(201)
    const dbItems = await env.base.db
      .select({ priceSource: orderItems.priceSource })
      .from(orderItems)
      .where(eq(orderItems.orderId, res.body.data.id))

    expect(dbItems[0]!.priceSource).toBe('customer_price')
  })
})

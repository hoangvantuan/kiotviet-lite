import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@kiotviet-lite/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kiotviet-lite/notifications')>()),
  notify: vi.fn().mockResolvedValue([{ ok: true }]),
}))

import {
  customerPrices,
  orderItems,
  orders,
  priceListItems,
  priceLists,
  products,
  stores,
  volumePrices,
} from '@kiotviet-lite/shared'

import { toIsoDate } from '../lib/date.js'
import { createOrdersRoutes } from '../routes/orders.routes.js'
import { createPosRoutes } from '../routes/pos.routes.js'
import { createSyncRoutes } from '../routes/sync.routes.js'
import { createCustomer, createProduct, createUnitConversion } from './helpers/factories.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.ACCESS_TOKEN_TTL_SECONDS = '900'
  process.env.REFRESH_TOKEN_TTL_SECONDS = '604800'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

interface ApiDataResponse<T> {
  data: T
  error?: { message?: string }
}

interface PriceListSummary {
  id: string
  name: string
}

interface ResolvedItem {
  productId: string
  price: number
  source: string
  sourceDetail: string | null
  isFallback?: boolean
}

interface OrderDetailResult {
  id: string
  orderNumber: string
  priceListId: string | null
  priceListName: string | null
  items: Array<{
    priceSource: string | null
    priceSourceDetail: string | null
    unitPrice: number
  }>
}

interface SyncOrderResult {
  results: Array<{
    clientId: string
    serverId: string
    status: string
  }>
}

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

describe('Issue #35: Price List Selection & Order Snapshot', () => {
  let env: Env

  beforeAll(async () => {
    env = await setup()
  })

  describe('1. POS Price List Listing & Role Access', () => {
    it('allows owner, manager, and staff to list active valid price lists', async () => {
      // Active valid list
      await env.base.db.insert(priceLists).values({
        storeId: env.base.storeId,
        name: 'Bảng giá hợp lệ',
        method: 'direct',
        isActive: true,
        effectiveFrom: '2020-01-01',
        effectiveTo: '2099-12-31',
      })

      // Inactive list
      await env.base.db.insert(priceLists).values({
        storeId: env.base.storeId,
        name: 'Bảng giá ngừng hoạt động',
        method: 'direct',
        isActive: false,
      })

      // Expired list
      await env.base.db.insert(priceLists).values({
        storeId: env.base.storeId,
        name: 'Bảng giá đã hết hạn',
        method: 'direct',
        isActive: true,
        effectiveTo: '2020-01-01',
      })

      // Future list
      await env.base.db.insert(priceLists).values({
        storeId: env.base.storeId,
        name: 'Bảng giá tương lai',
        method: 'direct',
        isActive: true,
        effectiveFrom: '2099-01-01',
      })

      // Soft deleted list
      await env.base.db.insert(priceLists).values({
        storeId: env.base.storeId,
        name: 'Bảng giá đã xóa',
        method: 'direct',
        isActive: true,
        deletedAt: new Date(),
      })

      // Another store's list
      const [otherStore] = await env.base.db
        .insert(stores)
        .values({ name: 'Cửa hàng khác' })
        .returning()
      await env.base.db.insert(priceLists).values({
        storeId: otherStore!.id,
        name: 'Bảng giá cửa hàng khác',
        method: 'direct',
        isActive: true,
      })

      for (const actor of [env.base.owner, env.base.manager, env.base.staff]) {
        const res = await env.posApp.request('/price-lists', {
          headers: actor.authHeader,
        })
        expect(res.status).toBe(200)
        const json = (await res.json()) as ApiDataResponse<PriceListSummary[]>
        const names = json.data.map((l) => l.name)
        expect(names).toContain('Bảng giá hợp lệ')
        expect(names).not.toContain('Bảng giá ngừng hoạt động')
        expect(names).not.toContain('Bảng giá đã hết hạn')
        expect(names).not.toContain('Bảng giá tương lai')
        expect(names).not.toContain('Bảng giá đã xóa')
        expect(names).not.toContain('Bảng giá cửa hàng khác')
      }
    })
  })

  describe('2. Pricing Engine Precedence & Fallback', () => {
    it('manual price list item beats customer price, category discount, volume price, group price list', async () => {
      const p1 = await createProduct(env.base, { sellingPrice: 100_000 })
      const cust = await createCustomer(env.base)

      // Customer price: 90_000
      await env.base.db.insert(customerPrices).values({
        storeId: env.base.storeId,
        customerId: cust.id,
        productId: p1.id,
        price: 90_000,
      })

      // Volume price: 85_000
      await env.base.db.insert(volumePrices).values({
        storeId: env.base.storeId,
        productId: p1.id,
        minQty: 1,
        price: 85_000,
      })

      // Manual price list: 70_000
      const [pl] = await env.base.db
        .insert(priceLists)
        .values({
          storeId: env.base.storeId,
          name: 'Bảng giá đại lý',
          method: 'direct',
          isActive: true,
        })
        .returning()
      await env.base.db.insert(priceListItems).values({
        priceListId: pl!.id,
        productId: p1.id,
        price: 70_000,
      })

      const res = await env.posApp.request('/resolve-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...env.base.staff.authHeader },
        body: JSON.stringify({
          customerId: cust.id,
          priceListId: pl!.id,
          items: [{ productId: p1.id, quantity: 1 }],
        }),
      })

      expect(res.status).toBe(200)
      const json = (await res.json()) as ApiDataResponse<ResolvedItem[]>
      expect(json.data[0]!.price).toBe(70_000)
      expect(json.data[0]!.source).toBe('price_list')
      expect(json.data[0]!.sourceDetail).toContain('Bảng giá đại lý')
      expect(json.data[0]!.isFallback).toBe(false)
    })

    it('falls back to automatic rules when product is missing in manual price list', async () => {
      // Product in price list
      const p1 = await createProduct(env.base, { sellingPrice: 100_000 })
      // Product missing in price list, has customer price
      const p2 = await createProduct(env.base, { sellingPrice: 120_000 })
      // Product missing in price list, only retail price
      const p3 = await createProduct(env.base, { sellingPrice: 50_000 })

      const cust = await createCustomer(env.base)
      await env.base.db.insert(customerPrices).values({
        storeId: env.base.storeId,
        customerId: cust.id,
        productId: p2.id,
        price: 99_000,
      })

      const [pl] = await env.base.db
        .insert(priceLists)
        .values({
          storeId: env.base.storeId,
          name: 'Bảng giá VIP',
          method: 'direct',
          isActive: true,
        })
        .returning()
      await env.base.db.insert(priceListItems).values({
        priceListId: pl!.id,
        productId: p1.id,
        price: 60_000,
      })

      const res = await env.posApp.request('/resolve-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...env.base.staff.authHeader },
        body: JSON.stringify({
          customerId: cust.id,
          priceListId: pl!.id,
          items: [
            { productId: p1.id, quantity: 1 },
            { productId: p2.id, quantity: 1 },
            { productId: p3.id, quantity: 1 },
          ],
        }),
      })

      expect(res.status).toBe(200)
      const json = (await res.json()) as ApiDataResponse<ResolvedItem[]>
      // p1 is in manual list
      expect(json.data[0]!.price).toBe(60_000)
      expect(json.data[0]!.source).toBe('price_list')
      expect(json.data[0]!.isFallback).toBe(false)

      // p2 falls back to customer price
      expect(json.data[1]!.price).toBe(99_000)
      expect(json.data[1]!.source).toBe('customer_price')
      expect(json.data[1]!.isFallback).toBe(true)
      expect(json.data[1]!.sourceDetail).toContain('dự phòng')

      // p3 falls back to retail price
      expect(json.data[2]!.price).toBe(50_000)
      expect(json.data[2]!.source).toBe('retail_price')
      expect(json.data[2]!.isFallback).toBe(true)
      expect(json.data[2]!.sourceDetail).toContain('dự phòng')
    })
  })

  describe('3. Online Order Creation, Snapshot & Validation', () => {
    it('creates order with manual price list, persists snapshot and ignores client labels', async () => {
      const p1 = await createProduct(env.base, { sellingPrice: 100_000 })
      const [pl] = await env.base.db
        .insert(priceLists)
        .values({
          storeId: env.base.storeId,
          name: 'Bảng giá bán buôn 2026',
          method: 'direct',
          isActive: true,
        })
        .returning()
      await env.base.db.insert(priceListItems).values({
        priceListId: pl!.id,
        productId: p1.id,
        price: 80_000,
      })

      const createRes = await env.posApp.request('/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...env.base.staff.authHeader },
        body: JSON.stringify({
          subtotal: 80_000,
          discountValue: 0,
          discountAmount: 0,
          total: 80_000,
          paymentMethod: 'cash',
          paymentStatus: 'paid',
          cashAmount: 80_000,
          debtLimitOverridden: false,
          priceListId: pl!.id,
          priceListName: 'Tên giả mạo từ client',
          items: [
            {
              productId: p1.id,
              productName: p1.name,
              unitPrice: 80_000,
              quantity: 1,
              lineTotal: 80_000,
              originalPrice: null,
              priceOverride: false,
              priceSource: 'retail_price',
              priceSourceDetail: 'Nhãn giả mạo',
            },
          ],
        }),
      })

      expect(createRes.status).toBe(201)
      const orderJson = (await createRes.json()) as ApiDataResponse<OrderDetailResult>
      const orderId = orderJson.data.id

      // Verify DB order snapshot
      const [dbOrder] = await env.base.db
        .select({
          priceListId: orders.priceListId,
          priceListName: orders.priceListName,
        })
        .from(orders)
        .where(eq(orders.id, orderId))

      expect(dbOrder!.priceListId).toBe(pl!.id)
      expect(dbOrder!.priceListName).toBe('Bảng giá bán buôn 2026') // Server snapshot, not client label!

      // Verify order items price source in DB
      const [dbItem] = await env.base.db
        .select({
          priceSource: orderItems.priceSource,
          priceSourceDetail: orderItems.priceSourceDetail,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId))

      expect(dbItem!.priceSource).toBe('price_list')
      expect(dbItem!.priceSourceDetail).toBe('Bảng giá bán buôn 2026')

      // Verify getOrderDetail returns the snapshot
      const detailRes = await env.ordersApp.request(`/${orderId}`, {
        headers: env.base.owner.authHeader,
      })
      expect(detailRes.status).toBe(200)
      const detailJson = (await detailRes.json()) as ApiDataResponse<OrderDetailResult>
      expect(detailJson.data.priceListId).toBe(pl!.id)
      expect(detailJson.data.priceListName).toBe('Bảng giá bán buôn 2026')

      // Mutate price list: rename and soft-delete it
      await env.base.db
        .update(priceLists)
        .set({ name: 'Tên mới sau này', deletedAt: new Date() })
        .where(eq(priceLists.id, pl!.id))

      // Verify snapshot remains immutable
      const detailRes2 = await env.ordersApp.request(`/${orderId}`, {
        headers: env.base.owner.authHeader,
      })
      const detailJson2 = (await detailRes2.json()) as ApiDataResponse<OrderDetailResult>
      expect(detailJson2.data.priceListName).toBe('Bảng giá bán buôn 2026')
    })

    it('rejects order when price does not match price list price', async () => {
      const p1 = await createProduct(env.base, { sellingPrice: 100_000 })
      const [pl] = await env.base.db
        .insert(priceLists)
        .values({
          storeId: env.base.storeId,
          name: 'Bảng giá kiểm tra lệch giá',
          method: 'direct',
          isActive: true,
        })
        .returning()
      await env.base.db.insert(priceListItems).values({
        priceListId: pl!.id,
        productId: p1.id,
        price: 75_000,
      })

      // Client sends 70_000 instead of 75_000 without price override
      const res = await env.posApp.request('/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...env.base.staff.authHeader },
        body: JSON.stringify({
          subtotal: 70_000,
          discountValue: 0,
          discountAmount: 0,
          total: 70_000,
          paymentMethod: 'cash',
          paymentStatus: 'paid',
          cashAmount: 70_000,
          debtLimitOverridden: false,
          priceListId: pl!.id,
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
        }),
      })

      expect(res.status).toBe(400)
      const err = (await res.json()) as { error: { message: string } }
      expect(err.error.message).toContain('Đơn giá không khớp giá hệ thống')
    })

    it('rejects order with expired or inactive price list instead of silently downgrading to retail price', async () => {
      const p1 = await createProduct(env.base, { sellingPrice: 100_000 })
      const [plExpired] = await env.base.db
        .insert(priceLists)
        .values({
          storeId: env.base.storeId,
          name: 'Bảng giá hết hạn test',
          method: 'direct',
          isActive: true,
          effectiveTo: '2020-01-01',
        })
        .returning()
      await env.base.db.insert(priceListItems).values({
        priceListId: plExpired!.id,
        productId: p1.id,
        price: 50_000,
      })

      const res = await env.posApp.request('/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...env.base.staff.authHeader },
        body: JSON.stringify({
          subtotal: 50_000,
          discountValue: 0,
          discountAmount: 0,
          total: 50_000,
          paymentMethod: 'cash',
          paymentStatus: 'paid',
          cashAmount: 50_000,
          debtLimitOverridden: false,
          priceListId: plExpired!.id,
          items: [
            {
              productId: p1.id,
              productName: p1.name,
              unitPrice: 50_000,
              quantity: 1,
              lineTotal: 50_000,
              originalPrice: null,
              priceOverride: false,
            },
          ],
        }),
      })

      expect(res.status).toBe(400)
      const err = (await res.json()) as { error: { message: string } }
      expect(err.error.message).toContain('hết hiệu lực')
    })

    it('rejects price list belonging to another store (store isolation)', async () => {
      const p1 = await createProduct(env.base, { sellingPrice: 100_000 })
      const [otherStore] = await env.base.db
        .insert(stores)
        .values({ name: 'Cửa hàng cô lập' })
        .returning()
      const [otherPl] = await env.base.db
        .insert(priceLists)
        .values({
          storeId: otherStore!.id,
          name: 'Bảng giá store khác',
          method: 'direct',
          isActive: true,
        })
        .returning()

      const res = await env.posApp.request('/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...env.base.staff.authHeader },
        body: JSON.stringify({
          subtotal: 100_000,
          discountValue: 0,
          discountAmount: 0,
          total: 100_000,
          paymentMethod: 'cash',
          paymentStatus: 'paid',
          cashAmount: 100_000,
          debtLimitOverridden: false,
          priceListId: otherPl!.id,
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
        }),
      })

      expect(res.status).toBe(400)
      const err = (await res.json()) as { error: { message: string } }
      expect(err.error.message).toContain('không thuộc cửa hàng')
    })

    it('manual line override is not overridden by manual price list and keeps PIN verification', async () => {
      const p1 = await createProduct(env.base, { sellingPrice: 100_000 })
      const [pl] = await env.base.db
        .insert(priceLists)
        .values({
          storeId: env.base.storeId,
          name: 'Bảng giá override test',
          method: 'direct',
          isActive: true,
        })
        .returning()
      await env.base.db.insert(priceListItems).values({
        priceListId: pl!.id,
        productId: p1.id,
        price: 80_000,
      })

      // Sửa giá tay xuống 50_000 với mã PIN
      const res = await env.posApp.request('/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...env.base.owner.authHeader },
        body: JSON.stringify({
          subtotal: 50_000,
          discountValue: 0,
          discountAmount: 0,
          total: 50_000,
          paymentMethod: 'cash',
          paymentStatus: 'paid',
          cashAmount: 50_000,
          debtLimitOverridden: false,
          priceOverridePin: env.base.owner.pin,
          priceListId: pl!.id,
          items: [
            {
              productId: p1.id,
              productName: p1.name,
              unitPrice: 50_000,
              quantity: 1,
              lineTotal: 50_000,
              originalPrice: 80_000,
              priceOverride: true,
              priceOverrideReason: 'Giảm đặc biệt',
            },
          ],
        }),
      })

      expect(res.status).toBe(201)
      const json = (await res.json()) as ApiDataResponse<OrderDetailResult>
      const [dbItem] = await env.base.db
        .select({
          priceSource: orderItems.priceSource,
          priceOverride: orderItems.priceOverride,
          unitPrice: orderItems.unitPrice,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, json.data.id))

      expect(dbItem!.unitPrice).toBe(50_000)
      expect(dbItem!.priceOverride).toBe(true)
      expect(dbItem!.priceSource).toBe('manual_override')
    })

    it('creates an order with 200 lines under a manual price list successfully', async () => {
      // Create 200 products
      const productValues = Array.from({ length: 200 }, (_, i) => ({
        storeId: env.base.storeId,
        name: `SP 200 Dòng ${i + 1}`,
        sku: `SKU-200-${String(i + 1).padStart(3, '0')}`,
        sellingPrice: 100_000,
        costPrice: 50_000,
        currentStock: 1000,
        trackInventory: false,
      }))
      const insertedProducts = await env.base.db.insert(products).values(productValues).returning()

      const [pl] = await env.base.db
        .insert(priceLists)
        .values({
          storeId: env.base.storeId,
          name: 'Bảng giá 200 dòng',
          method: 'direct',
          isActive: true,
        })
        .returning()

      // Put first 150 products in price list at 75_000, remaining 50 fall back to retail 100_000
      const plItemValues = insertedProducts.slice(0, 150).map((p) => ({
        priceListId: pl!.id,
        productId: p.id,
        price: 75_000,
      }))
      await env.base.db.insert(priceListItems).values(plItemValues)

      const orderItemsInput = insertedProducts.map((p, idx) => {
        const unitPrice = idx < 150 ? 75_000 : 100_000
        return {
          productId: p.id,
          productName: p.name,
          unitPrice,
          quantity: 1,
          lineTotal: unitPrice,
          originalPrice: null,
          priceOverride: false,
        }
      })

      const expectedSubtotal = 150 * 75_000 + 50 * 100_000 // 11_250_000 + 5_000_000 = 16_250_000

      const res = await env.posApp.request('/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...env.base.staff.authHeader },
        body: JSON.stringify({
          subtotal: expectedSubtotal,
          discountValue: 0,
          discountAmount: 0,
          total: expectedSubtotal,
          paymentMethod: 'cash',
          paymentStatus: 'paid',
          cashAmount: expectedSubtotal,
          debtLimitOverridden: false,
          priceListId: pl!.id,
          items: orderItemsInput,
        }),
      })

      expect(res.status).toBe(201)
      const orderJson = (await res.json()) as ApiDataResponse<OrderDetailResult>
      expect(orderJson.data.items.length).toBe(200)

      // Verify in DB that all 200 lines were inserted
      const dbLines = await env.base.db
        .select({
          priceSource: orderItems.priceSource,
          unitPrice: orderItems.unitPrice,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderJson.data.id))

      expect(dbLines.length).toBe(200)
      const plLines = dbLines.filter((l) => l.priceSource === 'price_list')
      const retailLines = dbLines.filter((l) => l.priceSource === 'retail_price')
      expect(plLines.length).toBe(150)
      expect(retailLines.length).toBe(50)
    })
  })

  describe('4. Offline Sync with Price List', () => {
    it('persists price list ID and snapshot name from offline sync', async () => {
      const p1 = await createProduct(env.base, { sellingPrice: 100_000 })
      const [pl] = await env.base.db
        .insert(priceLists)
        .values({
          storeId: env.base.storeId,
          name: 'Bảng giá ngoại tuyến 2026',
          method: 'direct',
          isActive: true,
        })
        .returning()

      const res = await env.syncApp.request('/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...env.base.owner.authHeader },
        body: JSON.stringify({
          orders: [
            {
              clientId: '88888888-8888-8888-8888-888888888888',
              createdAt: new Date().toISOString(),
              orderData: {
                subtotal: 60_000,
                discountValue: 0,
                discountAmount: 0,
                total: 60_000,
                paymentMethod: 'cash',
                paymentStatus: 'paid',
                cashAmount: 60_000,
                debtLimitOverridden: false,
                priceListId: pl!.id,
                priceListName: 'Bảng giá ngoại tuyến 2026',
                items: [
                  {
                    productId: p1.id,
                    productName: p1.name,
                    unitPrice: 60_000,
                    quantity: 1,
                    lineTotal: 60_000,
                    originalPrice: null,
                    priceOverride: false,
                    priceSource: 'price_list',
                    priceSourceDetail: 'Bảng giá ngoại tuyến 2026',
                  },
                ],
              },
            },
          ],
        }),
      })

      expect(res.status).toBe(200)
      const json = (await res.json()) as ApiDataResponse<SyncOrderResult>
      const serverId = json.data.results[0]!.serverId

      const [dbOrder] = await env.base.db
        .select({
          priceListId: orders.priceListId,
          priceListName: orders.priceListName,
        })
        .from(orders)
        .where(eq(orders.id, serverId))

      expect(dbOrder!.priceListId).toBe(pl!.id)
      expect(dbOrder!.priceListName).toBe('Bảng giá ngoại tuyến 2026')
    })

    it('handles missing non-existent priceListId in offline sync without FK 500 error, persists null ID and untrusted device name', async () => {
      const p1 = await createProduct(env.base, { sellingPrice: 100_000 })
      const nonExistentId = '99999999-9999-9999-9999-999999999999'

      const res = await env.syncApp.request('/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...env.base.owner.authHeader },
        body: JSON.stringify({
          orders: [
            {
              clientId: '11111111-1111-1111-1111-111111111111',
              createdAt: new Date().toISOString(),
              orderData: {
                subtotal: 55_000,
                discountValue: 0,
                discountAmount: 0,
                total: 55_000,
                paymentMethod: 'cash',
                paymentStatus: 'paid',
                cashAmount: 55_000,
                debtLimitOverridden: false,
                priceListId: nonExistentId,
                priceListName: 'Bảng giá ảo không tồn tại',
                items: [
                  {
                    productId: p1.id,
                    productName: p1.name,
                    unitPrice: 55_000,
                    quantity: 1,
                    lineTotal: 55_000,
                    originalPrice: null,
                    priceOverride: false,
                    priceSource: 'price_list',
                    priceSourceDetail: 'Bảng giá ảo không tồn tại',
                  },
                ],
              },
            },
          ],
        }),
      })

      expect(res.status).toBe(200)
      const json = (await res.json()) as ApiDataResponse<SyncOrderResult>
      expect(json.data.results[0]!.status).toBe('synced')
      const serverId = json.data.results[0]!.serverId

      const [dbOrder] = await env.base.db
        .select({
          priceListId: orders.priceListId,
          priceListName: orders.priceListName,
          total: orders.total,
        })
        .from(orders)
        .where(eq(orders.id, serverId))

      expect(dbOrder!.priceListId).toBeNull()
      expect(dbOrder!.priceListName).toBe('Bảng giá ảo không tồn tại')
      expect(dbOrder!.total).toBe(55_000)
    })

    it('handles foreign-store priceListId in offline sync by persisting null ID instead of cross-store pointer', async () => {
      const p1 = await createProduct(env.base, { sellingPrice: 100_000 })
      const [otherStore] = await env.base.db
        .insert(stores)
        .values({ name: 'Cửa hàng khác offline' })
        .returning()
      const [otherPl] = await env.base.db
        .insert(priceLists)
        .values({
          storeId: otherStore!.id,
          name: 'Bảng giá store khác',
          method: 'direct',
          isActive: true,
        })
        .returning()

      const res = await env.syncApp.request('/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...env.base.owner.authHeader },
        body: JSON.stringify({
          orders: [
            {
              clientId: '22222222-2222-2222-2222-222222222222',
              createdAt: new Date().toISOString(),
              orderData: {
                subtotal: 75_000,
                discountValue: 0,
                discountAmount: 0,
                total: 75_000,
                paymentMethod: 'cash',
                paymentStatus: 'paid',
                cashAmount: 75_000,
                debtLimitOverridden: false,
                priceListId: otherPl!.id,
                priceListName: 'Bảng giá cửa hàng khác',
                items: [
                  {
                    productId: p1.id,
                    productName: p1.name,
                    unitPrice: 75_000,
                    quantity: 1,
                    lineTotal: 75_000,
                    originalPrice: null,
                    priceOverride: false,
                    priceSource: 'price_list',
                    priceSourceDetail: 'Bảng giá cửa hàng khác',
                  },
                ],
              },
            },
          ],
        }),
      })

      expect(res.status).toBe(200)
      const json = (await res.json()) as ApiDataResponse<SyncOrderResult>
      expect(json.data.results[0]!.status).toBe('synced')
      const serverId = json.data.results[0]!.serverId

      const [dbOrder] = await env.base.db
        .select({
          priceListId: orders.priceListId,
          priceListName: orders.priceListName,
          total: orders.total,
        })
        .from(orders)
        .where(eq(orders.id, serverId))

      expect(dbOrder!.priceListId).toBeNull()
      expect(dbOrder!.priceListName).toBe('Bảng giá cửa hàng khác')
      expect(dbOrder!.total).toBe(75_000)
    })
  })

  describe('5. Date Boundary Consistency across List, Preview, Checkout', () => {
    it('rejects preview and checkout for expired price list (effectiveTo < today) and hides it from POS list', async () => {
      const p1 = await createProduct(env.base, { sellingPrice: 100_000 })
      const yesterday = new Date(Date.now() - 86_400_000)
      const yesterdayStr = toIsoDate(yesterday)

      const [plExpired] = await env.base.db
        .insert(priceLists)
        .values({
          storeId: env.base.storeId,
          name: `Bảng giá hết hạn hôm qua ${Date.now()}`,
          method: 'direct',
          isActive: true,
          effectiveTo: yesterdayStr,
        })
        .returning()
      await env.base.db.insert(priceListItems).values({
        priceListId: plExpired!.id,
        productId: p1.id,
        price: 50_000,
      })

      // 1. Must NOT appear in GET /pos/price-lists
      const listRes = await env.posApp.request('/price-lists', {
        headers: env.base.staff.authHeader,
      })
      expect(listRes.status).toBe(200)
      const listJson = (await listRes.json()) as ApiDataResponse<PriceListSummary[]>
      const ids = listJson.data.map((l) => l.id)
      expect(ids).not.toContain(plExpired!.id)

      // 2. Preview POST /resolve-prices must throw 400
      const previewRes = await env.posApp.request('/resolve-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...env.base.staff.authHeader },
        body: JSON.stringify({
          priceListId: plExpired!.id,
          items: [{ productId: p1.id, quantity: 1 }],
        }),
      })
      expect(previewRes.status).toBe(400)
      const previewErr = (await previewRes.json()) as { error: { message: string } }
      expect(previewErr.error.message).toContain('hết hiệu lực')

      // 3. Checkout POST /orders must throw 400
      const orderRes = await env.posApp.request('/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...env.base.staff.authHeader },
        body: JSON.stringify({
          subtotal: 50_000,
          discountValue: 0,
          discountAmount: 0,
          total: 50_000,
          paymentMethod: 'cash',
          paymentStatus: 'paid',
          cashAmount: 50_000,
          debtLimitOverridden: false,
          priceListId: plExpired!.id,
          items: [
            {
              productId: p1.id,
              productName: p1.name,
              unitPrice: 50_000,
              quantity: 1,
              lineTotal: 50_000,
              originalPrice: null,
              priceOverride: false,
            },
          ],
        }),
      })
      expect(orderRes.status).toBe(400)
      const orderErr = (await orderRes.json()) as { error: { message: string } }
      expect(orderErr.error.message).toContain('hết hiệu lực')
    })

    it('rejects preview and checkout for future price list (effectiveFrom > today) and hides it from POS list', async () => {
      const p1 = await createProduct(env.base, { sellingPrice: 100_000 })
      const tomorrow = new Date(Date.now() + 86_400_000)
      const tomorrowStr = toIsoDate(tomorrow)

      const [plFuture] = await env.base.db
        .insert(priceLists)
        .values({
          storeId: env.base.storeId,
          name: `Bảng giá tương lai mai mới bắt đầu ${Date.now()}`,
          method: 'direct',
          isActive: true,
          effectiveFrom: tomorrowStr,
        })
        .returning()
      await env.base.db.insert(priceListItems).values({
        priceListId: plFuture!.id,
        productId: p1.id,
        price: 50_000,
      })

      // 1. Must NOT appear in GET /pos/price-lists
      const listRes = await env.posApp.request('/price-lists', {
        headers: env.base.staff.authHeader,
      })
      expect(listRes.status).toBe(200)
      const listJson = (await listRes.json()) as ApiDataResponse<PriceListSummary[]>
      const ids = listJson.data.map((l) => l.id)
      expect(ids).not.toContain(plFuture!.id)

      // 2. Preview POST /resolve-prices must throw 400
      const previewRes = await env.posApp.request('/resolve-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...env.base.staff.authHeader },
        body: JSON.stringify({
          priceListId: plFuture!.id,
          items: [{ productId: p1.id, quantity: 1 }],
        }),
      })
      expect(previewRes.status).toBe(400)
      const previewErr = (await previewRes.json()) as { error: { message: string } }
      expect(previewErr.error.message).toContain('chưa đến ngày hiệu lực')

      // 3. Checkout POST /orders must throw 400
      const orderRes = await env.posApp.request('/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...env.base.staff.authHeader },
        body: JSON.stringify({
          subtotal: 50_000,
          discountValue: 0,
          discountAmount: 0,
          total: 50_000,
          paymentMethod: 'cash',
          paymentStatus: 'paid',
          cashAmount: 50_000,
          debtLimitOverridden: false,
          priceListId: plFuture!.id,
          items: [
            {
              productId: p1.id,
              productName: p1.name,
              unitPrice: 50_000,
              quantity: 1,
              lineTotal: 50_000,
              originalPrice: null,
              priceOverride: false,
            },
          ],
        }),
      })
      expect(orderRes.status).toBe(400)
      const orderErr = (await orderRes.json()) as { error: { message: string } }
      expect(orderErr.error.message).toContain('chưa đến ngày hiệu lực')
    })
  })

  describe('6. Unit Conversion Precedence with Manual Price List', () => {
    it('manual price list price wins unitConversion.sellingPrice (scales base price by conversionFactor) with preview and checkout agreement', async () => {
      // Product base price: 10,000 (Cái). Giá vốn 5.000: bảng giá 80.000/thùng vẫn trên giá vốn,
      // không vướng duyệt dưới giá vốn cho giá đặc biệt (POS-08, R1)
      const p1 = await createProduct(env.base, { sellingPrice: 10_000, costPrice: 5_000 })
      // Unit conversion: Thùng = 10 Cái, sellingPrice = 120,000 (cao hơn 10 * 10,000)
      const uc = await createUnitConversion(env.base, p1.id, {
        conversionFactor: 10,
        sellingPrice: 120_000,
      })

      // Manual price list sets base price: 8,000 (Cái)
      const [pl] = await env.base.db
        .insert(priceLists)
        .values({
          storeId: env.base.storeId,
          name: 'Bảng giá sỉ quy đổi',
          method: 'direct',
          isActive: true,
        })
        .returning()
      await env.base.db.insert(priceListItems).values({
        priceListId: pl!.id,
        productId: p1.id,
        price: 8_000,
      })

      // Expected: Manual price list base price 8,000 * factor 10 = 80,000 (WINS over uc.sellingPrice 120,000!)
      // 1. Preview agreement
      const previewRes = await env.posApp.request('/resolve-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...env.base.staff.authHeader },
        body: JSON.stringify({
          priceListId: pl!.id,
          items: [
            {
              productId: p1.id,
              unitConversionId: uc.id,
              quantity: 2,
            },
          ],
        }),
      })

      expect(previewRes.status).toBe(200)
      const previewJson = (await previewRes.json()) as ApiDataResponse<ResolvedItem[]>
      expect(previewJson.data[0]!.price).toBe(80_000)
      expect(previewJson.data[0]!.source).toBe('price_list')
      expect(previewJson.data[0]!.sourceDetail).toBe('Bảng giá sỉ quy đổi')

      // 2. Checkout agreement
      const orderRes = await env.posApp.request('/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...env.base.staff.authHeader },
        body: JSON.stringify({
          subtotal: 160_000,
          discountValue: 0,
          discountAmount: 0,
          total: 160_000,
          paymentMethod: 'cash',
          paymentStatus: 'paid',
          cashAmount: 160_000,
          debtLimitOverridden: false,
          priceListId: pl!.id,
          items: [
            {
              productId: p1.id,
              productName: p1.name,
              unitConversionId: uc.id,
              unitPrice: 80_000,
              quantity: 2,
              lineTotal: 160_000,
              originalPrice: null,
              priceOverride: false,
            },
          ],
        }),
      })

      expect(orderRes.status).toBe(201)
      const orderJson = (await orderRes.json()) as ApiDataResponse<OrderDetailResult>
      expect(orderJson.data.items[0]!.unitPrice).toBe(80_000)
      expect(orderJson.data.items[0]!.priceSource).toBe('price_list')
      expect(orderJson.data.priceListId).toBe(pl!.id)
      expect(orderJson.data.priceListName).toBe('Bảng giá sỉ quy đổi')
    })
  })
})

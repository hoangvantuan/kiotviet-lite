import { beforeAll, describe, expect, it } from 'vitest'

import {
  categories,
  categoryDiscounts,
  customerGroups,
  customerPrices,
  priceListItems,
  priceLists,
  volumePrices,
} from '@kiotviet-lite/shared'

import { createPosRoutes } from '../routes/pos.routes.js'
import { createStoreRoutes } from '../routes/store.routes.js'
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

interface Env {
  base: TestEnv
  posApp: ReturnType<typeof createPosRoutes>
  storeApp: ReturnType<typeof createStoreRoutes>
}

async function setup(): Promise<Env> {
  const base = await createTestEnv()
  const posApp = createPosRoutes({ db: base.db })
  const storeApp = createStoreRoutes({ db: base.db })
  return { base, posApp, storeApp }
}

describe('PHA 4 POS Integration Tests (M13, M16, M21, M23)', () => {
  // ---------------------------------------------------------------------------
  // M13: Giá 0đ hợp lệ không bị bỏ qua
  // ---------------------------------------------------------------------------
  describe('M13: Giá 0đ hợp lệ được tôn trọng trong engine pricing', () => {
    it('Tier 1: Giá riêng KH = 0đ được match, không bị fallback về giá bán lẻ', async () => {
      const { base, posApp } = await setup()
      const product = await createProduct(base, { sellingPrice: 50_000 })
      const customer = await createCustomer(base)

      // Insert customer price = 0
      await base.db.insert(customerPrices).values({
        storeId: base.storeId,
        customerId: customer.id,
        productId: product.id,
        price: 0,
      })

      const res = await posApp.request('/resolve-prices', {
        method: 'POST',
        headers: {
          ...base.owner.authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId: customer.id,
          items: [{ productId: product.id, quantity: 1 }],
        }),
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        data: Array<{
          price: number
          source: string
          breakdown?: Array<{ tier: number; matched: boolean }>
        }>
      }
      expect(body.data[0]?.price).toBe(0)
      expect(body.data[0]?.source).toBe('customer_price')
      expect(body.data[0]?.breakdown?.[0]?.matched).toBe(true)
    })

    it('Tier 2: Chiết khấu danh mục 100% ra giá 0đ được match', async () => {
      const { base, posApp } = await setup()
      const [category] = await base.db
        .insert(categories)
        .values({ storeId: base.storeId, name: 'Danh mục quà tặng' })
        .returning()
      const product = await createProduct(base, {
        sellingPrice: 80_000,
        categoryId: category!.id,
      })
      const customer = await createCustomer(base)

      // Insert category discount 100% cho customer
      await base.db.insert(categoryDiscounts).values({
        storeId: base.storeId,
        categoryId: category!.id,
        customerId: customer.id,
        discountType: 'percent',
        discountValue: 100,
        minQty: 1,
        isActive: true,
      })

      const res = await posApp.request('/resolve-prices', {
        method: 'POST',
        headers: {
          ...base.owner.authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId: customer.id,
          items: [{ productId: product.id, quantity: 1 }],
        }),
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        data: Array<{ price: number; source: string }>
      }
      expect(body.data[0]?.price).toBe(0)
      expect(body.data[0]?.source).toBe('category_discount')
    })

    it('Tier 4: Giá theo số lượng = 0đ được match', async () => {
      const { base, posApp } = await setup()
      const product = await createProduct(base, { sellingPrice: 60_000 })

      await base.db.insert(volumePrices).values({
        storeId: base.storeId,
        productId: product.id,
        minQty: 5,
        price: 0,
      })

      const res = await posApp.request('/resolve-prices', {
        method: 'POST',
        headers: {
          ...base.owner.authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [{ productId: product.id, quantity: 5 }],
        }),
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        data: Array<{ price: number; source: string }>
      }
      expect(body.data[0]?.price).toBe(0)
      expect(body.data[0]?.source).toBe('volume_price')
    })

    it('Tier 5: Bảng giá nhóm = 0đ được match', async () => {
      const { base, posApp } = await setup()
      const [priceList] = await base.db
        .insert(priceLists)
        .values({
          storeId: base.storeId,
          name: 'Bảng giá miễn phí',
          method: 'direct',
          isActive: true,
        })
        .returning()
      const [group] = await base.db
        .insert(customerGroups)
        .values({
          storeId: base.storeId,
          name: 'Nhóm đối tác',
          defaultPriceListId: priceList!.id,
        })
        .returning()
      const customer = await createCustomer(base, { groupId: group!.id })
      const product = await createProduct(base, { sellingPrice: 150_000 })

      await base.db.insert(priceListItems).values({
        priceListId: priceList!.id,
        productId: product.id,
        price: 0,
      })

      const res = await posApp.request('/resolve-prices', {
        method: 'POST',
        headers: {
          ...base.owner.authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId: customer.id,
          items: [{ productId: product.id, quantity: 1 }],
        }),
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        data: Array<{ price: number; source: string }>
      }
      expect(body.data[0]?.price).toBe(0)
      expect(body.data[0]?.source).toBe('price_list')
    })
  })

  // ---------------------------------------------------------------------------
  // M16: Đơn vị quy đổi có giá 0 dẫn tới bán 0đ -> BE tự tính lại
  // ---------------------------------------------------------------------------
  describe('M16: Đơn vị quy đổi không để bán 0đ và BE tự tính lại giá', () => {
    it('POS products search trả về sellingPrice: null khi DB sellingPrice = 0', async () => {
      const { base, posApp } = await setup()
      const product = await createProduct(base, {
        name: 'Nước ngọt lon',
        sellingPrice: 10_000,
      })
      await createUnitConversion(base, product.id, {
        unit: 'Thùng 24',
        conversionFactor: 24,
        sellingPrice: 0,
      })

      const res = await posApp.request(`/products/search?q=${encodeURIComponent('Nước ngọt')}`, {
        method: 'GET',
        headers: base.owner.authHeader,
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        data: Array<{
          unitConversions: Array<{
            unit: string
            conversionFactor: number
            sellingPrice: number | null
          }>
        }>
      }
      expect(body.data[0]?.unitConversions[0]?.sellingPrice).toBeNull()
    })

    it('resolve-prices với unitConversionId tính đúng basePrice * conversionFactor khi sellingPrice = 0', async () => {
      const { base, posApp } = await setup()
      const product = await createProduct(base, {
        sellingPrice: 10_000,
      })
      const conv = await createUnitConversion(base, product.id, {
        unit: 'Thùng 24',
        conversionFactor: 24,
        sellingPrice: 0,
      })

      const res = await posApp.request('/resolve-prices', {
        method: 'POST',
        headers: {
          ...base.owner.authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [{ productId: product.id, unitConversionId: conv.id, quantity: 1 }],
        }),
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        data: Array<{ price: number; unitConversionId?: string }>
      }
      expect(body.data[0]?.price).toBe(240_000)
      expect(body.data[0]?.unitConversionId).toBe(conv.id)
    })

    it('Tạo đơn hàng với đơn vị quy đổi: BE tự sửa giá nếu client gửi unitPrice: 0', async () => {
      const { base, posApp } = await setup()
      const product = await createProduct(base, {
        sellingPrice: 10_000,
        currentStock: 100,
      })
      const conv = await createUnitConversion(base, product.id, {
        unit: 'Thùng 24',
        conversionFactor: 24,
        sellingPrice: 0,
      })

      const res = await posApp.request('/orders', {
        method: 'POST',
        headers: {
          ...base.owner.authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subtotal: 0,
          discountValue: 0,
          discountAmount: 0,
          total: 0,
          paymentMethod: 'cash',
          paymentStatus: 'paid',
          cashAmount: 0,
          items: [
            {
              productId: product.id,
              productName: product.name,
              unit: conv.unit,
              unitConversionId: conv.id,
              unitPrice: 0,
              quantity: 1,
              discountValue: 0,
              discountAmount: 0,
              lineTotal: 0,
              priceOverride: false,
            },
          ],
        }),
      })

      expect(res.status).toBe(201)
      const body = (await res.json()) as {
        data: {
          items: Array<{ unitPrice: number; lineTotal: number }>
        }
      }
      // BE đã tự tính lại unitPrice = 10.000 * 24 = 240.000đ
      expect(body.data.items[0]?.unitPrice).toBe(240_000)
      expect(body.data.items[0]?.lineTotal).toBe(240_000)
    })
  })

  // ---------------------------------------------------------------------------
  // M21: Ngưỡng cảnh báo nợ đọc từ cài đặt công nợ
  // ---------------------------------------------------------------------------
  describe('M21: Cài đặt debtWarningPercent', () => {
    it('Cập nhật và đọc debtWarningPercent per-store', async () => {
      const { base, storeApp } = await setup()

      const updateRes = await storeApp.request('/', {
        method: 'PATCH',
        headers: {
          ...base.owner.authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          debtWarningPercent: 65,
        }),
      })

      expect(updateRes.status).toBe(200)
      const updateBody = (await updateRes.json()) as { data: { debtWarningPercent: number } }
      expect(updateBody.data.debtWarningPercent).toBe(65)

      const getRes = await storeApp.request('/', {
        method: 'GET',
        headers: base.owner.authHeader,
      })
      expect(getRes.status).toBe(200)
      const getBody = (await getRes.json()) as { data: { debtWarningPercent: number } }
      expect(getBody.data.debtWarningPercent).toBe(65)
    })
  })

  // ---------------------------------------------------------------------------
  // M23: Tab ghi nợ gửi debtAmount = 0 làm backend trả 400
  // ---------------------------------------------------------------------------
  describe('M23: Backend báo lỗi rõ ràng khi paymentMethod=debt không hợp lệ', () => {
    it('paymentMethod=debt nhưng debtAmount=0 bị từ chối với lỗi rõ ràng', async () => {
      const { base, posApp } = await setup()
      const product = await createProduct(base, { sellingPrice: 100_000 })
      const customer = await createCustomer(base)

      const res = await posApp.request('/orders', {
        method: 'POST',
        headers: {
          ...base.owner.authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId: customer.id,
          subtotal: 100_000,
          discountValue: 0,
          discountAmount: 0,
          total: 100_000,
          paymentMethod: 'debt',
          paymentStatus: 'paid',
          cashAmount: 100_000,
          debtAmount: 0,
          items: [
            {
              productId: product.id,
              productName: product.name,
              unitPrice: 100_000,
              quantity: 1,
              discountValue: 0,
              discountAmount: 0,
              lineTotal: 100_000,
              priceOverride: false,
            },
          ],
        }),
      })

      expect(res.status).toBe(400)
      const body = (await res.json()) as {
        error: { code: string; message: string; details?: Array<{ path: string; message: string }> }
      }
      expect(body.error.code).toBe('VALIDATION_ERROR')
      const debtIssue = body.error.details?.find((d) => d.path === 'debtAmount')
      expect(debtIssue?.message).toContain('ghi nợ')
    })

    it('paymentMethod=debt và debtAmount > 0 nhưng không có customerId bị từ chối', async () => {
      const { base, posApp } = await setup()
      const product = await createProduct(base, { sellingPrice: 100_000 })

      const res = await posApp.request('/orders', {
        method: 'POST',
        headers: {
          ...base.owner.authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId: null,
          subtotal: 100_000,
          discountValue: 0,
          discountAmount: 0,
          total: 100_000,
          paymentMethod: 'debt',
          paymentStatus: 'unpaid',
          debtAmount: 100_000,
          items: [
            {
              productId: product.id,
              productName: product.name,
              unitPrice: 100_000,
              quantity: 1,
              discountValue: 0,
              discountAmount: 0,
              lineTotal: 100_000,
              priceOverride: false,
            },
          ],
        }),
      })

      expect(res.status).toBe(400)
      const body = (await res.json()) as {
        error: { code: string; message: string; details?: Array<{ path: string; message: string }> }
      }
      expect(body.error.code).toBe('VALIDATION_ERROR')
      const customerIssue = body.error.details?.find((d) => d.path === 'customerId')
      expect(customerIssue?.message).toContain('khách hàng')
    })
  })
})

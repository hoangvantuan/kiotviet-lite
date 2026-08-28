import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { PGLITE_SCHEMA_VERSION } from '@kiotviet-lite/shared'

import { createSyncRoutes } from '../routes/sync.routes.js'
import {
  createCustomer,
  createProduct,
  createStore,
  createUser,
  createVariant,
  resetFactorySeq,
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

describe('Sync API Integration Tests', () => {
  let env: TestEnv
  let app: ReturnType<typeof createSyncRoutes>

  beforeEach(async () => {
    resetFactorySeq()
    env = await createTestEnv()
    app = createSyncRoutes({ db: env.db })
  })

  afterEach(async () => {
    await env.close()
  })

  describe('GET /schema-version', () => {
    it('trả về đúng phiên bản lược đồ PGLite', async () => {
      const res = await app.request('/schema-version', {
        method: 'GET',
        headers: env.owner.authHeader,
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as { data: { version: number } }
      expect(body.data.version).toBe(PGLITE_SCHEMA_VERSION)
    })
  })

  describe('GET /initial (Đồng bộ khởi tạo ban đầu)', () => {
    it('trả về đầy đủ các danh mục, sản phẩm, khách hàng của cửa hàng', async () => {
      const prod = await createProduct(env, { name: 'Sản phẩm đồng bộ', sellingPrice: 50_000 })
      await createVariant(env, prod.id, { attribute1Name: 'Màu', attribute1Value: 'Đỏ' })
      const cust = await createCustomer(env, { name: 'Khách đồng bộ' })

      const res = await app.request('/initial', {
        method: 'GET',
        headers: env.owner.authHeader,
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        data: {
          products: Array<{ id: string; name: string }>
          variants: Array<{ id: string; productId: string }>
          customers: Array<{ id: string; name: string }>
        }
        meta: { syncedAt: string }
      }

      expect(body.data.products.some((p) => p.id === prod.id)).toBe(true)
      expect(body.data.variants.some((v) => v.productId === prod.id)).toBe(true)
      expect(body.data.customers.some((c) => c.id === cust.id)).toBe(true)
      expect(body.meta.syncedAt).toBeTruthy()
    })

    it('cách ly đa cửa hàng: không trả về dữ liệu của cửa hàng khác', async () => {
      const prodA = await createProduct(env, { name: 'Sản phẩm Store A' })

      // Tạo Store B
      const storeB = await createStore(env, { name: 'Store B' })
      const userB = await createUser(env, { storeId: storeB.id, role: 'owner' })
      const prodB = await createProduct(env, { storeId: storeB.id, name: 'Sản phẩm Store B' })

      const resA = await app.request('/initial', {
        method: 'GET',
        headers: env.owner.authHeader,
      })
      const bodyA = (await resA.json()) as {
        data: { products: Array<{ id: string }> }
      }
      expect(bodyA.data.products.some((p) => p.id === prodA.id)).toBe(true)
      expect(bodyA.data.products.some((p) => p.id === prodB.id)).toBe(false)

      const resB = await app.request('/initial', {
        method: 'GET',
        headers: userB.authHeader,
      })
      const bodyB = (await resB.json()) as {
        data: { products: Array<{ id: string }> }
      }
      expect(bodyB.data.products.some((p) => p.id === prodB.id)).toBe(true)
      expect(bodyB.data.products.some((p) => p.id === prodA.id)).toBe(false)
    })
  })

  describe('GET /incremental (Đồng bộ tăng dần)', () => {
    it('chỉ trả về các bản ghi cập nhật sau thời điểm since', async () => {
      const pastDate = new Date(Date.now() - 60_000).toISOString()
      const prod = await createProduct(env, { name: 'Sản phẩm mới sửa', sellingPrice: 90_000 })

      const res = await app.request(`/incremental?since=${encodeURIComponent(pastDate)}`, {
        method: 'GET',
        headers: env.owner.authHeader,
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        data: { products: Array<{ id: string; name: string }> }
        meta: { syncedAt: string }
      }

      expect(body.data.products.some((p) => p.id === prod.id)).toBe(true)
    })
  })

  describe('POST /push (Đồng bộ đơn hàng từ ngoại tuyến lên máy chủ)', () => {
    it('Staff có quyền push đơn ngoại tuyến và đơn được tạo thành công', async () => {
      const prod = await createProduct(env, { currentStock: 50, sellingPrice: 40_000 })
      const clientId = 'c1234567-89ab-cdef-0123-456789abcdef'

      const res = await app.request('/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...env.staff.authHeader },
        body: JSON.stringify({
          orders: [
            {
              clientId,
              createdAt: new Date().toISOString(),
              orderData: {
                subtotal: 80_000,
                discountAmount: 0,
                total: 80_000,
                paymentMethod: 'cash',
                paymentStatus: 'paid',
                cashAmount: 80_000,
                items: [
                  {
                    productId: prod.id,
                    productName: prod.name,
                    unit: 'cái',
                    unitPrice: 40_000,
                    quantity: 2,
                    discountAmount: 0,
                    lineTotal: 80_000,
                  },
                ],
              },
            },
          ],
        }),
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        data: { results: Array<{ clientId: string; serverId: string; status: string }> }
      }
      expect(body.data.results[0]!.status).toBe('synced')
      expect(body.data.results[0]!.clientId).toBe(clientId)
      expect(body.data.results[0]!.serverId).toBeTruthy()
    })

    it('Push nhiều đơn ngoại tuyến (Batch push) và chống trùng lặp theo clientId', async () => {
      const prod = await createProduct(env, { currentStock: 100, sellingPrice: 50_000 })
      const clientId1 = 'c0000001-0000-0000-0000-000000000001'
      const clientId2 = 'c0000002-0000-0000-0000-000000000002'

      const payload = {
        orders: [
          {
            clientId: clientId1,
            createdAt: new Date().toISOString(),
            orderData: {
              subtotal: 50_000,
              discountAmount: 0,
              total: 50_000,
              paymentMethod: 'cash',
              paymentStatus: 'paid',
              cashAmount: 50_000,
              items: [
                {
                  productId: prod.id,
                  productName: prod.name,
                  unit: 'cái',
                  unitPrice: 50_000,
                  quantity: 1,
                  discountAmount: 0,
                  lineTotal: 50_000,
                },
              ],
            },
          },
          {
            clientId: clientId2,
            createdAt: new Date().toISOString(),
            orderData: {
              subtotal: 100_000,
              discountAmount: 0,
              total: 100_000,
              paymentMethod: 'cash',
              paymentStatus: 'paid',
              cashAmount: 100_000,
              items: [
                {
                  productId: prod.id,
                  productName: prod.name,
                  unit: 'cái',
                  unitPrice: 50_000,
                  quantity: 2,
                  discountAmount: 0,
                  lineTotal: 100_000,
                },
              ],
            },
          },
        ],
      }

      // Push đợt 1
      const res1 = await app.request('/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...env.owner.authHeader },
        body: JSON.stringify(payload),
      })
      expect(res1.status).toBe(200)
      const body1 = (await res1.json()) as {
        data: { results: Array<{ clientId: string; status: string }> }
      }
      expect(body1.data.results).toHaveLength(2)
      expect(body1.data.results[0]!.status).toBe('synced')
      expect(body1.data.results[1]!.status).toBe('synced')

      // Push đợt 2 lặp lại clientId1
      const res2 = await app.request('/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...env.owner.authHeader },
        body: JSON.stringify({ orders: [payload.orders[0]] }),
      })
      expect(res2.status).toBe(200)
      const body2 = (await res2.json()) as {
        data: { results: Array<{ clientId: string; status: string }> }
      }
      expect(body2.data.results[0]!.status).toBe('duplicate')
    })

    it('trả về 401 khi không truyền Authorization header', async () => {
      const res = await app.request('/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: [] }),
      })
      expect(res.status).toBe(401)
    })
  })
})

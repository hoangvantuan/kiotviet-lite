import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createOrdersRoutes } from '../routes/orders.routes.js'
import {
  createCompletedOrder,
  createCustomer,
  createPartialReturn,
  createProduct,
  createStore,
  createUser,
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

describe('Orders API Integration Tests', () => {
  let env: TestEnv
  let app: ReturnType<typeof createOrdersRoutes>

  beforeEach(async () => {
    resetFactorySeq()
    env = await createTestEnv()
    app = createOrdersRoutes({ db: env.db })
  })

  afterEach(async () => {
    await env.close()
  })

  describe('GET / (Danh sách đơn hàng)', () => {
    it('trả về danh sách đơn hàng có phân trang và metadata chuẩn', async () => {
      const prod = await createProduct(env, { sellingPrice: 100_000 })
      const cust = await createCustomer(env)

      // Tạo 3 đơn hàng
      await createCompletedOrder(env, prod.id, { customerId: cust.id })
      await createCompletedOrder(env, prod.id, { customerId: cust.id })
      await createCompletedOrder(env, prod.id, { customerId: cust.id })

      const res = await app.request('/?page=1&pageSize=2', {
        method: 'GET',
        headers: env.owner.authHeader,
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        data: Array<{ id: string; total: number; orderNumber: string }>
        meta: { page: number; pageSize: number; total: number; totalPages: number }
      }

      expect(body.data).toHaveLength(2)
      expect(body.meta.page).toBe(1)
      expect(body.meta.pageSize).toBe(2)
      expect(body.meta.total).toBe(3)
      expect(body.meta.totalPages).toBe(2)
    })

    it('lọc đơn hàng theo trạng thái status', async () => {
      const prod = await createProduct(env, { sellingPrice: 100_000 })
      const cust = await createCustomer(env)

      // Đơn 1: completed
      const { order: order1 } = await createCompletedOrder(env, prod.id, { customerId: cust.id })
      // Đơn 2: partial_return
      const { order: order2 } = await createPartialReturn(env, prod.id, cust.id, {
        returnQuantity: 1,
      })

      // Lọc đơn completed
      const resCompleted = await app.request('/?status=completed', {
        method: 'GET',
        headers: env.owner.authHeader,
      })
      expect(resCompleted.status).toBe(200)
      const bodyCompleted = (await resCompleted.json()) as {
        data: Array<{ id: string; status: string }>
      }
      expect(bodyCompleted.data.some((o) => o.id === order1.id)).toBe(true)
      expect(bodyCompleted.data.some((o) => o.id === order2.id)).toBe(false)

      // Lọc đơn partial_return
      const resPartial = await app.request('/?status=partial_return', {
        method: 'GET',
        headers: env.owner.authHeader,
      })
      expect(resPartial.status).toBe(200)
      const bodyPartial = (await resPartial.json()) as {
        data: Array<{ id: string; status: string }>
      }
      expect(bodyPartial.data.some((o) => o.id === order2.id)).toBe(true)
      expect(bodyPartial.data.some((o) => o.id === order1.id)).toBe(false)
    })

    it('lọc đơn hàng theo customerId', async () => {
      const prod = await createProduct(env, { sellingPrice: 50_000 })
      const custA = await createCustomer(env, { name: 'Khách A' })
      const custB = await createCustomer(env, { name: 'Khách B' })

      const { order: orderA } = await createCompletedOrder(env, prod.id, { customerId: custA.id })
      const { order: orderB } = await createCompletedOrder(env, prod.id, { customerId: custB.id })

      const res = await app.request(`/?customerId=${custA.id}`, {
        method: 'GET',
        headers: env.owner.authHeader,
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { data: Array<{ id: string; customerId: string }> }
      expect(body.data.some((o) => o.id === orderA.id)).toBe(true)
      expect(body.data.some((o) => o.id === orderB.id)).toBe(false)
    })

    it('tìm kiếm đơn hàng theo mã orderNumber', async () => {
      const prod = await createProduct(env, { sellingPrice: 50_000 })
      await createCompletedOrder(env, prod.id, {
        orderOverrides: { orderNumber: 'HD-SEARCH-9999' },
      })

      const res = await app.request('/?search=SEARCH-9999', {
        method: 'GET',
        headers: env.owner.authHeader,
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { data: Array<{ id: string; orderNumber: string }> }
      expect(body.data).toHaveLength(1)
      expect(body.data[0]!.orderNumber).toBe('HD-SEARCH-9999')
    })

    it('Staff và Manager đều có quyền xem danh sách đơn hàng', async () => {
      const prod = await createProduct(env, { sellingPrice: 50_000 })
      await createCompletedOrder(env, prod.id)

      const resStaff = await app.request('/', {
        method: 'GET',
        headers: env.staff.authHeader,
      })
      expect(resStaff.status).toBe(200)

      const resManager = await app.request('/', {
        method: 'GET',
        headers: env.manager.authHeader,
      })
      expect(resManager.status).toBe(200)
    })

    it('chặn truy cập 401 khi không có token', async () => {
      const res = await app.request('/', {
        method: 'GET',
      })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /:id (Chi tiết đơn hàng)', () => {
    it('lấy chi tiết đơn hàng thành công kèm đầy đủ thông tin sản phẩm', async () => {
      const prod = await createProduct(env, {
        name: 'Bánh mì đặc biệt',
        sku: 'BM-001',
        sellingPrice: 20_000,
        costPrice: 12_000,
      })
      const cust = await createCustomer(env, { name: 'Trần Văn Chi Tiết' })
      const { order } = await createCompletedOrder(env, prod.id, {
        customerId: cust.id,
        items: [
          {
            productId: prod.id,
            productName: 'Bánh mì đặc biệt',
            quantity: 3,
            unitPrice: 20_000,
          },
        ],
      })

      const res = await app.request(`/${order.id}`, {
        method: 'GET',
        headers: env.owner.authHeader,
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        data: {
          id: string
          orderNumber: string
          customerName?: string | null
          items: Array<{
            productName: string
            sku?: string | null
            costPrice?: number | null
            quantity: number
            unitPrice: number
          }>
        }
      }

      expect(body.data.id).toBe(order.id)
      expect(body.data.items).toHaveLength(1)
      expect(body.data.items[0]!.productName).toBe('Bánh mì đặc biệt')
      expect(body.data.items[0]!.quantity).toBe(3)
      expect(body.data.items[0]!.unitPrice).toBe(20_000)
    })

    it('trả về 404 khi ID đơn hàng không tồn tại', async () => {
      const res = await app.request('/00000000-0000-0000-0000-000000000000', {
        method: 'GET',
        headers: env.owner.authHeader,
      })
      expect(res.status).toBe(404)
    })

    it('cách ly đa cửa hàng (Multi-tenant): Store B không thể xem đơn của Store A', async () => {
      const prod = await createProduct(env, { sellingPrice: 50_000 })
      const { order: orderA } = await createCompletedOrder(env, prod.id)

      // Tạo Store B và user của Store B
      const storeB = await createStore(env, { name: 'Cửa hàng đối thủ B' })
      const userB = await createUser(env, { storeId: storeB.id, role: 'owner' })

      const res = await app.request(`/${orderA.id}`, {
        method: 'GET',
        headers: userB.authHeader,
      })
      expect(res.status).toBe(404)
    })
  })

  describe('GET /:id/returnable-items & POST /:id/returns (Phân quyền)', () => {
    it('Staff bị chặn 403 khi gọi GET /:id/returnable-items', async () => {
      const prod = await createProduct(env, { sellingPrice: 50_000 })
      const { order } = await createCompletedOrder(env, prod.id)

      const res = await app.request(`/${order.id}/returnable-items`, {
        method: 'GET',
        headers: env.staff.authHeader,
      })
      expect(res.status).toBe(403)
    })

    it('Manager và Owner được phép gọi GET /:id/returnable-items', async () => {
      const prod = await createProduct(env, { sellingPrice: 50_000 })
      const { order } = await createCompletedOrder(env, prod.id)

      const resManager = await app.request(`/${order.id}/returnable-items`, {
        method: 'GET',
        headers: env.manager.authHeader,
      })
      expect(resManager.status).toBe(200)

      const resOwner = await app.request(`/${order.id}/returnable-items`, {
        method: 'GET',
        headers: env.owner.authHeader,
      })
      expect(resOwner.status).toBe(200)
    })
  })
})

import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { listOrdersQuerySchema, orders, SYNC_PUSH_MAX_BATCH, users } from '@kiotviet-lite/shared'

import { createSyncRoutes } from '../routes/sync.routes.js'
import { listOrders } from '../services/orders.service.js'
import { getRevenueByTime } from '../services/revenue-report.service.js'
import { createProduct, createStore, createUser, resetFactorySeq } from './helpers/factories.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

/**
 * Luồng o1-sync, tầng API của /sync/push:
 * - OFF-05: đơn ghi cho người bán gốc, không phải người đang đồng bộ; người bán phải cùng cửa hàng.
 * - OFF-10: lô có giới hạn dùng chung, mỗi đơn có kết quả riêng.
 * - OFF-11: đơn mang giờ bán, báo cáo tính theo giờ bán.
 */

interface PushResult {
  clientId: string
  serverId?: string
  orderNumber?: string
  status: 'synced' | 'error' | 'duplicate'
  error?: { code: string; message: string; reason?: string }
  reviewStatus?: string
}

describe('o1-sync: /sync/push', () => {
  let env: TestEnv
  let app: ReturnType<typeof createSyncRoutes>
  let productId: string
  let productName: string

  beforeEach(async () => {
    resetFactorySeq()
    env = await createTestEnv()
    app = createSyncRoutes({ db: env.db })
    const product = await createProduct(env, { currentStock: 1000, sellingPrice: 4_000 })
    productId = product.id
    productName = product.name
  })

  function offlineOrder(overrides: Record<string, unknown> = {}) {
    return {
      clientId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      orderData: {
        subtotal: 4_000,
        discountAmount: 0,
        total: 4_000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 4_000,
        items: [
          {
            productId,
            productName,
            unit: 'gói',
            unitPrice: 4_000,
            quantity: 1,
            discountAmount: 0,
            lineTotal: 4_000,
          },
        ],
      },
      ...overrides,
    }
  }

  async function push(authHeader: { Authorization: string }, payload: unknown[]) {
    const res = await app.request('/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ orders: payload }),
    })
    const body = (await res.json()) as { data?: { results: PushResult[] } }
    return { status: res.status, results: body.data?.results ?? [], body }
  }

  async function orderByClientId(clientId: string) {
    const [row] = await env.db
      .select()
      .from(orders)
      .where(and(eq(orders.storeId, env.storeId), eq(orders.clientId, clientId)))
    return row
  }

  describe('OFF-05: người bán gốc', () => {
    it('nhân viên bán ngoại tuyến, chủ đồng bộ trên cùng máy: đơn vẫn ghi cho nhân viên', async () => {
      const order = offlineOrder({ sellerUserId: env.staff.id })
      const { status, results } = await push(env.owner.authHeader, [order])

      expect(status).toBe(200)
      expect(results[0]!.status).toBe('synced')
      const row = await orderByClientId(order.clientId)
      expect(row!.userId).toBe(env.staff.id)
      // Người đồng bộ ghi riêng để đối soát
      expect(row!.syncedByUserId).toBe(env.owner.id)
    })

    it('người bán thuộc cửa hàng khác: từ chối, không tạo đơn trong cửa hàng đang đăng nhập', async () => {
      const otherStore = await createStore(env)
      const otherSeller = await createUser(env, { storeId: otherStore.id, role: 'owner' })
      const order = offlineOrder({ sellerUserId: otherSeller.id })

      const { results } = await push(env.owner.authHeader, [order])

      expect(results[0]!.status).toBe('error')
      expect(results[0]!.error).toMatchObject({ code: 'FORBIDDEN', reason: 'seller_not_in_store' })
      expect(await orderByClientId(order.clientId)).toBeUndefined()
    })

    it('người bán đã bị khóa: từ chối kèm hướng dẫn, đơn đã đồng bộ trước đó vẫn báo trùng', async () => {
      const seller = await createUser(env, { role: 'staff' })
      const first = offlineOrder({ sellerUserId: seller.id })
      expect((await push(env.owner.authHeader, [first])).results[0]!.status).toBe('synced')

      await env.db.update(users).set({ isActive: false }).where(eq(users.id, seller.id))

      const second = offlineOrder({ sellerUserId: seller.id })
      const { results } = await push(env.owner.authHeader, [first, second])
      expect(results[0]!.status).toBe('duplicate')
      expect(results[1]!.status).toBe('error')
      expect(results[1]!.error).toMatchObject({
        code: 'BUSINESS_RULE_VIOLATION',
        reason: 'seller_inactive',
      })
      expect(results[1]!.error!.message).toContain('mở lại tài khoản')
    })

    it('máy khách cũ không gửi người bán: người đồng bộ là người bán', async () => {
      const order = offlineOrder()
      await push(env.staff.authHeader, [order])
      const row = await orderByClientId(order.clientId)
      expect(row!.userId).toBe(env.staff.id)
      expect(row!.syncedByUserId).toBeNull()
    })
  })

  describe('OFF-10: lô và kết quả từng đơn', () => {
    it(`lô ${SYNC_PUSH_MAX_BATCH} đơn được nhận hết; lô ${SYNC_PUSH_MAX_BATCH + 1} đơn bị từ chối rõ giới hạn`, async () => {
      const tooMany = Array.from({ length: SYNC_PUSH_MAX_BATCH + 1 }, () => offlineOrder())
      const rejected = await push(env.staff.authHeader, tooMany)
      expect(rejected.status).toBe(400)
      expect(JSON.stringify(rejected.body)).toContain(`tối đa ${SYNC_PUSH_MAX_BATCH} đơn`)

      const full = tooMany.slice(0, SYNC_PUSH_MAX_BATCH)
      const accepted = await push(env.staff.authHeader, full)
      expect(accepted.status).toBe(200)
      expect(accepted.results).toHaveLength(SYNC_PUSH_MAX_BATCH)
      expect(accepted.results.every((r) => r.status === 'synced')).toBe(true)
      // OFF-17: máy khách nhận mã máy chủ để thay mã tạm
      expect(accepted.results[0]!.orderNumber).toMatch(/^HD-\d{6}-\d+$/)
    })

    it('một đơn sai dữ liệu không làm cả lô bị từ chối', async () => {
      const good = offlineOrder()
      const bad = offlineOrder({ orderData: { total: 'không phải số', items: [] } })
      const { status, results } = await push(env.staff.authHeader, [bad, good])

      expect(status).toBe(200)
      expect(results[0]).toMatchObject({ clientId: bad.clientId, status: 'error' })
      expect(results[0]!.error!.code).toBe('VALIDATION_ERROR')
      expect(results[1]).toMatchObject({ clientId: good.clientId, status: 'synced' })
    })
  })

  describe('OFF-11: giờ bán', () => {
    it('đơn bán 21:30 tối hôm trước, sáng nay mới đồng bộ: ghi và báo cáo theo ngày bán', async () => {
      const now = new Date()
      // 21:30 giờ Việt Nam của hôm qua = 14:30 UTC
      const soldAt = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 14, 30),
      )
      const order = offlineOrder({ createdAt: soldAt.toISOString() })
      const { results } = await push(env.staff.authHeader, [order])
      expect(results[0]!.status).toBe('synced')

      const row = await orderByClientId(order.clientId)
      expect(row!.createdAt.toISOString()).toBe(soldAt.toISOString())
      expect(row!.syncedAt).not.toBeNull()
      expect(row!.reviewStatus).toBe('none')
      // Mã đơn theo ngày bán
      const ymd = soldAt.toISOString().slice(2, 10).replace(/-/g, '')
      expect(row!.orderNumber.startsWith(`HD-${ymd}-`)).toBe(true)

      const day = soldAt.toISOString().slice(0, 10)
      const report = await getRevenueByTime(env.db, env.storeId, day, day, 'day')
      expect(report.summary.totalOrders).toBe(1)
      expect(report.summary.totalRevenue).toBe(4_000)
    })

    it('giờ bán ở tương lai quá giới hạn: dùng giờ nhận đơn và gắn cờ chờ duyệt', async () => {
      const future = new Date(Date.now() + 2 * 60 * 60 * 1000)
      const order = offlineOrder({ createdAt: future.toISOString() })
      const before = Date.now()
      const { results } = await push(env.staff.authHeader, [order])
      expect(results[0]!.reviewStatus).toBe('pending_review')

      const row = await orderByClientId(order.clientId)
      expect(row!.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1000)
      expect(row!.createdAt.getTime()).toBeLessThan(future.getTime())
      expect(row!.policyViolations?.map((v) => v.code)).toContain('sold_at_suspect')
    })

    it('đơn cũ hơn giới hạn ngày: giữ giờ bán nhưng gắn cờ chờ duyệt', async () => {
      const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
      const order = offlineOrder({ createdAt: old.toISOString() })
      const { results } = await push(env.staff.authHeader, [order])
      expect(results[0]!.reviewStatus).toBe('pending_review')

      const row = await orderByClientId(order.clientId)
      expect(row!.createdAt.toISOString()).toBe(old.toISOString())
      expect(row!.policyViolations?.map((v) => v.code)).toContain('sold_at_suspect')
    })
  })

  describe('OFF-17: mã tạm trên hóa đơn ngoại tuyến', () => {
    it('tìm theo mã tạm TAM- ra đúng đơn đã đồng bộ, đơn mang mã máy chủ', async () => {
      const order = offlineOrder()
      const other = offlineOrder()
      await push(env.owner.authHeader, [order, other])
      const tempCode = `TAM-${order.clientId.slice(0, 8).toUpperCase()}`

      const found = await listOrders({
        db: env.db,
        storeId: env.storeId,
        query: listOrdersQuerySchema.parse({ search: tempCode }),
      })

      expect(found.data.map((o) => o.id)).toEqual([(await orderByClientId(order.clientId))!.id])
      expect(found.data[0]!.orderNumber).toMatch(/^HD-\d{6}-\d+$/)
    })
  })
})

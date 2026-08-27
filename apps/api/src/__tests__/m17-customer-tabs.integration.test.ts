import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  customerGroups,
  customers,
  debts,
  orderItems,
  orders,
  products,
  stores,
} from '@kiotviet-lite/shared'

import { createCustomersRoutes } from '../routes/customers.routes.js'
import {
  getCustomerDebts,
  getCustomerStats,
  listCustomerOrders,
} from '../services/customers.service.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.BCRYPT_ROUNDS = '4'
})

describe('M17 — 3 tab chi tiết khách hàng: đơn hàng, công nợ, thống kê', () => {
  let env: TestEnv
  let app: ReturnType<typeof createCustomersRoutes>

  beforeEach(async () => {
    env = await createTestEnv()
    app = createCustomersRoutes({ db: env.db })
  })

  afterEach(async () => {
    await env.close()
  })

  describe('Tab Đơn hàng (listCustomerOrders)', () => {
    it('trả về danh sách đơn hàng có phân trang và lọc theo trạng thái/thời gian', async () => {
      // 1. Tạo khách hàng
      const [customer] = await env.db
        .insert(customers)
        .values({
          storeId: env.storeId,
          name: 'Nguyễn Văn A',
          phone: '0901234567',
        })
        .returning()

      // 2. Tạo các đơn hàng
      await env.db.insert(orders).values({
        storeId: env.storeId,
        customerId: customer!.id,
        userId: env.owner.id,
        orderNumber: 'HD00001',
        subtotal: 200_000,
        total: 200_000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        status: 'completed',
        createdAt: new Date('2026-05-01T10:00:00Z'),
      })

      await env.db.insert(orders).values({
        storeId: env.storeId,
        customerId: customer!.id,
        userId: env.owner.id,
        orderNumber: 'HD00002',
        subtotal: 300_000,
        total: 300_000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        status: 'full_return',
        createdAt: new Date('2026-05-15T10:00:00Z'),
      })

      await env.db.insert(orders).values({
        storeId: env.storeId,
        customerId: customer!.id,
        userId: env.owner.id,
        orderNumber: 'HD00003',
        subtotal: 150_000,
        total: 150_000,
        paymentMethod: 'cash',
        paymentStatus: 'pending',
        status: 'draft',
        createdAt: new Date('2026-05-20T10:00:00Z'),
      })

      // 3. Query toàn bộ danh sách đơn hàng
      const allOrders = await listCustomerOrders({
        db: env.db,
        storeId: env.storeId,
        targetId: customer!.id,
        query: { page: 1, pageSize: 20 },
      })
      expect(allOrders.total).toBe(3)
      expect(allOrders.items).toHaveLength(3)
      expect(allOrders.totalPages).toBe(1)
      // Thứ tự sắp xếp theo createdAt DESC
      expect(allOrders.items[0]?.orderCode).toBe('HD00003')
      expect(allOrders.items[1]?.orderCode).toBe('HD00002')
      expect(allOrders.items[2]?.orderCode).toBe('HD00001')

      // Kiểm tra map status full_return -> refunded
      expect(allOrders.items[1]?.status).toBe('refunded')

      // 4. Lọc theo trạng thái refunded
      const refundedOrders = await listCustomerOrders({
        db: env.db,
        storeId: env.storeId,
        targetId: customer!.id,
        query: { page: 1, pageSize: 20, status: 'refunded' },
      })
      expect(refundedOrders.total).toBe(1)
      expect(refundedOrders.items[0]?.orderCode).toBe('HD00002')

      // 5. Lọc theo khoảng ngày
      const dateFiltered = await listCustomerOrders({
        db: env.db,
        storeId: env.storeId,
        targetId: customer!.id,
        query: {
          page: 1,
          pageSize: 20,
          dateFrom: '2026-05-10T00:00:00Z',
          dateTo: '2026-05-18T23:59:59Z',
        },
      })
      expect(dateFiltered.total).toBe(1)
      expect(dateFiltered.items[0]?.orderCode).toBe('HD00002')

      // 6. Phân trang
      const paged = await listCustomerOrders({
        db: env.db,
        storeId: env.storeId,
        targetId: customer!.id,
        query: { page: 2, pageSize: 2 },
      })
      expect(paged.total).toBe(3)
      expect(paged.totalPages).toBe(2)
      expect(paged.page).toBe(2)
      expect(paged.items).toHaveLength(1)
      expect(paged.items[0]?.orderCode).toBe('HD00001')

      // 7. Gọi qua HTTP endpoint
      const res = await app.request(`/${customer!.id}/orders?page=1&pageSize=10`, {
        headers: env.owner.authHeader,
      })
      expect(res.status).toBe(200)
      const json = (await res.json()) as {
        data: unknown[]
        meta: { total: number; totalPages: number }
      }
      expect(json.data).toHaveLength(3)
      expect(json.meta.total).toBe(3)
      expect(json.meta.totalPages).toBe(1)
    })

    it('khách hàng không có đơn hàng trả về rỗng đúng nghĩa', async () => {
      const [customer] = await env.db
        .insert(customers)
        .values({
          storeId: env.storeId,
          name: 'Khách Không Đơn',
          phone: '0909999888',
        })
        .returning()

      const result = await listCustomerOrders({
        db: env.db,
        storeId: env.storeId,
        targetId: customer!.id,
        query: { page: 1, pageSize: 20 },
      })
      expect(result.items).toHaveLength(0)
      expect(result.total).toBe(0)
      expect(result.totalPages).toBe(1)
    })
  })

  describe('Tab Công nợ (getCustomerDebts)', () => {
    it('trả về tổng công nợ, hạn mức, phần trăm và danh sách các khoản nợ', async () => {
      // 1. Tạo nhóm khách hàng có hạn mức nợ 1.000.000đ
      const [group] = await env.db
        .insert(customerGroups)
        .values({
          storeId: env.storeId,
          name: 'VIP',
          debtLimit: 1_000_000,
        })
        .returning()

      // 2. Tạo khách hàng trong nhóm, currentDebt = 350.000đ
      const [customer] = await env.db
        .insert(customers)
        .values({
          storeId: env.storeId,
          name: 'Trần Thị B',
          phone: '0912345678',
          groupId: group!.id,
          currentDebt: 350_000,
        })
        .returning()

      // 3. Tạo 2 đơn hàng có công nợ
      const [order1] = await env.db
        .insert(orders)
        .values({
          storeId: env.storeId,
          customerId: customer!.id,
          userId: env.owner.id,
          orderNumber: 'HD-NO-01',
          subtotal: 500_000,
          total: 500_000,
          paymentMethod: 'debt',
          paymentStatus: 'partial',
          createdAt: new Date('2026-05-01T10:00:00Z'),
        })
        .returning()

      const [order2] = await env.db
        .insert(orders)
        .values({
          storeId: env.storeId,
          customerId: customer!.id,
          userId: env.owner.id,
          orderNumber: 'HD-NO-02',
          subtotal: 200_000,
          total: 200_000,
          paymentMethod: 'debt',
          paymentStatus: 'pending',
          createdAt: new Date('2026-05-10T10:00:00Z'),
        })
        .returning()

      // 4. Tạo bản ghi trong bảng debts
      await env.db.insert(debts).values([
        {
          storeId: env.storeId,
          customerId: customer!.id,
          orderId: order1!.id,
          amount: 500_000,
          paid: 350_000,
          remaining: 150_000,
          createdAt: new Date('2026-05-01T10:00:00Z'),
        },
        {
          storeId: env.storeId,
          customerId: customer!.id,
          orderId: order2!.id,
          amount: 200_000,
          paid: 0,
          remaining: 200_000,
          createdAt: new Date('2026-05-10T10:00:00Z'),
        },
      ])

      // 5. Query công nợ
      const debtData = await getCustomerDebts({
        db: env.db,
        storeId: env.storeId,
        targetId: customer!.id,
      })

      expect(debtData.currentDebt).toBe(350_000)
      expect(debtData.effectiveDebtLimit).toBe(1_000_000)
      expect(debtData.usagePercent).toBe(35) // 350_000 / 1_000_000 * 100
      expect(debtData.items).toHaveLength(2)
      // Sắp xếp desc theo createdAt
      expect(debtData.items[0]?.orderCode).toBe('HD-NO-02')
      expect(debtData.items[0]?.originalAmount).toBe(200_000)
      expect(debtData.items[0]?.paidAmount).toBe(0)
      expect(debtData.items[0]?.remainingAmount).toBe(200_000)

      expect(debtData.items[1]?.orderCode).toBe('HD-NO-01')
      expect(debtData.items[1]?.originalAmount).toBe(500_000)
      expect(debtData.items[1]?.paidAmount).toBe(350_000)
      expect(debtData.items[1]?.remainingAmount).toBe(150_000)

      // 6. Test qua HTTP endpoint
      const res = await app.request(`/${customer!.id}/debts`, {
        headers: env.owner.authHeader,
      })
      expect(res.status).toBe(200)
      const json = (await res.json()) as { data: { currentDebt: number; items: unknown[] } }
      expect(json.data.currentDebt).toBe(350_000)
      expect(json.data.items).toHaveLength(2)
    })

    it('khách hàng không có nợ trả về currentDebt=0 và items rỗng', async () => {
      const [customer] = await env.db
        .insert(customers)
        .values({
          storeId: env.storeId,
          name: 'Khách Không Nợ',
          phone: '0919999111',
          currentDebt: 0,
        })
        .returning()

      const debtData = await getCustomerDebts({
        db: env.db,
        storeId: env.storeId,
        targetId: customer!.id,
      })
      expect(debtData.currentDebt).toBe(0)
      expect(debtData.effectiveDebtLimit).toBeNull()
      expect(debtData.usagePercent).toBe(0)
      expect(debtData.items).toHaveLength(0)
    })
  })

  describe('Tab Thống kê (getCustomerStats)', () => {
    it('trả về top sản phẩm mua nhiều nhất và doanh số theo tháng', async () => {
      // 1. Tạo khách hàng
      const [customer] = await env.db
        .insert(customers)
        .values({
          storeId: env.storeId,
          name: 'Lê Văn C',
          phone: '0922334455',
        })
        .returning()

      // 2. Tạo các sản phẩm
      const [prodA, prodB] = await env.db
        .insert(products)
        .values([
          {
            storeId: env.storeId,
            name: 'Sản phẩm A',
            sku: 'SP-A',
            sellingPrice: 100_000,
            costPrice: 60_000,
          },
          {
            storeId: env.storeId,
            name: 'Sản phẩm B',
            sku: 'SP-B',
            sellingPrice: 50_000,
            costPrice: 30_000,
          },
        ])
        .returning()

      // 3. Tạo đơn hàng 1 (tháng 4/2026) - completed
      const [order1] = await env.db
        .insert(orders)
        .values({
          storeId: env.storeId,
          customerId: customer!.id,
          userId: env.owner.id,
          orderNumber: 'HD-ST-01',
          subtotal: 350_000,
          total: 350_000,
          paymentMethod: 'cash',
          paymentStatus: 'paid',
          status: 'completed',
          createdAt: new Date('2026-04-10T10:00:00Z'),
        })
        .returning()

      await env.db.insert(orderItems).values([
        {
          orderId: order1!.id,
          productId: prodA!.id,
          productName: 'Sản phẩm A',
          unitPrice: 100_000,
          quantity: 2,
          lineTotal: 200_000,
        },
        {
          orderId: order1!.id,
          productId: prodB!.id,
          productName: 'Sản phẩm B',
          unitPrice: 50_000,
          quantity: 3,
          lineTotal: 150_000,
        },
      ])

      // 4. Tạo đơn hàng 2 (tháng 5/2026) - completed
      const [order2] = await env.db
        .insert(orders)
        .values({
          storeId: env.storeId,
          customerId: customer!.id,
          userId: env.owner.id,
          orderNumber: 'HD-ST-02',
          subtotal: 500_000,
          total: 500_000,
          paymentMethod: 'cash',
          paymentStatus: 'paid',
          status: 'completed',
          createdAt: new Date('2026-05-15T10:00:00Z'),
        })
        .returning()

      await env.db.insert(orderItems).values([
        {
          orderId: order2!.id,
          productId: prodA!.id,
          productName: 'Sản phẩm A',
          unitPrice: 100_000,
          quantity: 5,
          lineTotal: 500_000,
        },
      ])

      // 5. Query stats
      const stats = await getCustomerStats({
        db: env.db,
        storeId: env.storeId,
        targetId: customer!.id,
      })

      // Top products: SP A (tổng qty = 2 + 5 = 7, lineTotal = 700_000), SP B (tổng qty = 3, lineTotal = 150_000)
      expect(stats.topProducts).toHaveLength(2)
      expect(stats.topProducts[0]?.productName).toBe('Sản phẩm A')
      expect(stats.topProducts[0]?.quantity).toBe(7)
      expect(stats.topProducts[0]?.total).toBe(700_000)

      expect(stats.topProducts[1]?.productName).toBe('Sản phẩm B')
      expect(stats.topProducts[1]?.quantity).toBe(3)
      expect(stats.topProducts[1]?.total).toBe(150_000)

      // Monthly sales: 2 tháng (2026-04: 350_000, 2026-05: 500_000)
      expect(stats.monthlySales).toHaveLength(2)
      expect(stats.monthlySales[0]?.month).toBe('2026-04')
      expect(stats.monthlySales[0]?.total).toBe(350_000)
      expect(stats.monthlySales[1]?.month).toBe('2026-05')
      expect(stats.monthlySales[1]?.total).toBe(500_000)

      // 6. Test qua HTTP endpoint
      const res = await app.request(`/${customer!.id}/stats`, {
        headers: env.owner.authHeader,
      })
      expect(res.status).toBe(200)
      const json = (await res.json()) as {
        data: { topProducts: unknown[]; monthlySales: unknown[] }
      }
      expect(json.data.topProducts).toHaveLength(2)
      expect(json.data.monthlySales).toHaveLength(2)
    })

    it('khách hàng chưa mua hàng trả về topProducts rỗng và monthlySales rỗng', async () => {
      const [customer] = await env.db
        .insert(customers)
        .values({
          storeId: env.storeId,
          name: 'Khách Mới',
          phone: '0933333444',
        })
        .returning()

      const stats = await getCustomerStats({
        db: env.db,
        storeId: env.storeId,
        targetId: customer!.id,
      })
      expect(stats.topProducts).toHaveLength(0)
      expect(stats.monthlySales).toHaveLength(0)
    })
  })

  describe('Multi-tenant & Error handling', () => {
    it('không cho phép truy cập dữ liệu khách hàng của cửa hàng khác', async () => {
      // Tạo store B
      const [storeB] = await env.db.insert(stores).values({ name: 'Store B' }).returning()
      const [customerStoreB] = await env.db
        .insert(customers)
        .values({
          storeId: storeB!.id,
          name: 'Khách Store B',
          phone: '0988888777',
        })
        .returning()

      // Store A cố gắng lấy orders / debts / stats của customerStoreB -> phải trả về 404
      const resOrders = await app.request(`/${customerStoreB!.id}/orders`, {
        headers: env.owner.authHeader,
      })
      expect(resOrders.status).toBe(404)

      const resDebts = await app.request(`/${customerStoreB!.id}/debts`, {
        headers: env.owner.authHeader,
      })
      expect(resDebts.status).toBe(404)

      const resStats = await app.request(`/${customerStoreB!.id}/stats`, {
        headers: env.owner.authHeader,
      })
      expect(resStats.status).toBe(404)
    })
  })
})

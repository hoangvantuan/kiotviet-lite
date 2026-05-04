import { Hono } from 'hono'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  customers,
  type DashboardResponse,
  debts,
  orderItems,
  orders,
  products,
  stores,
  users,
} from '@kiotviet-lite/shared'

import { signAccessToken } from '../lib/jwt.js'
import { hashPassword } from '../lib/password.js'
import { errorHandler } from '../middleware/error-handler.js'
import { createReportsRoutes } from '../routes/reports.routes.js'
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
  app: Hono
  storeBId: string
  storeBOwnerAuth: { Authorization: string }
}

async function setup(): Promise<Env> {
  const base = await createTestEnv()
  const reportsApp = createReportsRoutes({ db: base.db })
  const app = new Hono()
  app.onError(errorHandler)
  app.route('/api/v1/reports', reportsApp)

  // Create products with costPrice and minStock
  const [product1] = await base.db
    .insert(products)
    .values({
      storeId: base.storeId,
      name: 'Sản phẩm A',
      sku: 'SP-A',
      sellingPrice: 200_000,
      costPrice: 120_000,
      currentStock: 50,
      minStock: 10,
    })
    .returning()

  const [product2] = await base.db
    .insert(products)
    .values({
      storeId: base.storeId,
      name: 'Sản phẩm B',
      sku: 'SP-B',
      sellingPrice: 100_000,
      costPrice: 60_000,
      currentStock: 2,
      minStock: 10,
    })
    .returning()

  await base.db
    .insert(products)
    .values({
      storeId: base.storeId,
      name: 'Sản phẩm C - Hết hàng',
      sku: 'SP-C',
      sellingPrice: 300_000,
      costPrice: 180_000,
      currentStock: 0,
      minStock: 5,
    })
    .returning()

  // Product with minStock = 0 (should NOT appear in low stock alerts)
  await base.db.insert(products).values({
    storeId: base.storeId,
    name: 'Sản phẩm D - Không theo dõi',
    sku: 'SP-D',
    sellingPrice: 50_000,
    currentStock: 0,
    minStock: 0,
  })

  // Create completed orders (today)
  const [order1] = await base.db
    .insert(orders)
    .values({
      storeId: base.storeId,
      orderNumber: 'DASH-001',
      subtotal: 600_000,
      discountAmount: 0,
      total: 600_000,
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      status: 'completed',
      userId: base.owner.id,
    })
    .returning()

  const [order2] = await base.db
    .insert(orders)
    .values({
      storeId: base.storeId,
      orderNumber: 'DASH-002',
      subtotal: 400_000,
      discountAmount: 0,
      total: 400_000,
      paymentMethod: 'transfer',
      paymentStatus: 'paid',
      status: 'completed',
      userId: base.owner.id,
    })
    .returning()

  // Create a cancelled order (should NOT count in metrics)
  await base.db.insert(orders).values({
    storeId: base.storeId,
    orderNumber: 'DASH-003-CANCEL',
    subtotal: 500_000,
    discountAmount: 0,
    total: 500_000,
    paymentMethod: 'cash',
    paymentStatus: 'paid',
    status: 'cancelled',
    userId: base.owner.id,
  })

  // Order items for completed orders
  await base.db.insert(orderItems).values([
    {
      orderId: order1!.id,
      productId: product1!.id,
      productName: 'Sản phẩm A',
      unitPrice: 200_000,
      quantity: 3,
      lineTotal: 600_000,
    },
    {
      orderId: order2!.id,
      productId: product2!.id,
      productName: 'Sản phẩm B',
      unitPrice: 100_000,
      quantity: 4,
      lineTotal: 400_000,
    },
  ])

  // Create customer with overdue debts
  const [customer1] = await base.db
    .insert(customers)
    .values({
      storeId: base.storeId,
      name: 'KH Nợ Quá Hạn',
      phone: '0900001111',
      currentDebt: 500_000,
    })
    .returning()

  const [debtOrder1] = await base.db
    .insert(orders)
    .values({
      storeId: base.storeId,
      orderNumber: 'DASH-DEBT-001',
      customerId: customer1!.id,
      subtotal: 500_000,
      discountAmount: 0,
      total: 500_000,
      paymentMethod: 'debt',
      paymentStatus: 'unpaid',
      status: 'completed',
      userId: base.owner.id,
    })
    .returning()

  // Debt from 50 days ago (overdue: > 30 days)
  const now = Date.now()
  await base.db.insert(debts).values({
    storeId: base.storeId,
    orderId: debtOrder1!.id,
    customerId: customer1!.id,
    amount: 500_000,
    paid: 0,
    remaining: 500_000,
    createdAt: new Date(now - 50 * 86400000),
  })

  // Store B (multi-tenant isolation)
  const [storeB] = await base.db.insert(stores).values({ name: 'Cửa hàng B' }).returning()
  const storeBPwd = await hashPassword('matkhau123')
  const [storeBOwner] = await base.db
    .insert(users)
    .values({
      storeId: storeB!.id,
      name: 'Owner B',
      phone: '0909999999',
      passwordHash: storeBPwd,
      role: 'owner',
    })
    .returning()
  const storeBToken = signAccessToken({
    userId: storeBOwner!.id,
    storeId: storeB!.id,
    role: 'owner',
  })

  return {
    base,
    app,
    storeBId: storeB!.id,
    storeBOwnerAuth: { Authorization: `Bearer ${storeBToken}` },
  }
}

let env: Env

beforeEach(async () => {
  env = await setup()
})

afterEach(async () => {
  await env.base.close()
})

describe('GET /api/v1/reports/dashboard', () => {
  it('returns dashboard data with default period (today)', async () => {
    const res = await env.app.request('/api/v1/reports/dashboard', {
      headers: env.base.owner.authHeader,
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: DashboardResponse }

    // Metrics: 600k + 400k + 500k (debt order is also completed) = 1.5M
    expect(body.data.metrics).toBeDefined()
    expect(body.data.metrics.revenue.value).toBe(1_500_000)
    expect(body.data.metrics.orderCount.value).toBe(3)
    expect(body.data.metrics.avgOrderValue.value).toBe(500_000) // 1.5M / 3

    // Profit: 1.5M revenue - COGS (120k*3 + 60k*4 + 0*0 debt order has no items with cost) = 1.5M - 600k = 900k
    expect(body.data.metrics.profit.value).toBe(900_000)

    // Sparklines: always 7 points
    expect(body.data.metrics.revenue.sparkline).toHaveLength(7)
    expect(body.data.metrics.profit.sparkline).toHaveLength(7)
    expect(body.data.metrics.orderCount.sparkline).toHaveLength(7)
    expect(body.data.metrics.avgOrderValue.sparkline).toHaveLength(7)
  })

  it('returns revenueChart with 7 days', async () => {
    const res = await env.app.request('/api/v1/reports/dashboard', {
      headers: env.base.owner.authHeader,
    })
    const body = (await res.json()) as { data: DashboardResponse }
    expect(body.data.revenueChart).toHaveLength(7)

    // Today should have revenue (includes debt order which is also completed)
    const today = body.data.revenueChart[body.data.revenueChart.length - 1]!
    expect(today.revenue).toBe(1_500_000)
    expect(today.orderCount).toBe(3)

    // Each item has date and label
    for (const item of body.data.revenueChart) {
      expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(item.label).toBeTruthy()
    }
  })

  it('returns topProducts with correct ranking', async () => {
    const res = await env.app.request('/api/v1/reports/dashboard', {
      headers: env.base.owner.authHeader,
    })
    const body = (await res.json()) as { data: DashboardResponse }
    expect(body.data.topProducts).toHaveLength(2)

    // Sorted by quantity: SP B (4) first, SP A (3) second
    expect(body.data.topProducts[0]!.name).toBe('Sản phẩm B')
    expect(body.data.topProducts[0]!.quantity).toBe(4)
    expect(body.data.topProducts[1]!.name).toBe('Sản phẩm A')
    expect(body.data.topProducts[1]!.quantity).toBe(3)

    // Percentage
    expect(body.data.topProducts[0]!.percentage).toBeGreaterThan(0)
  })

  it('returns lowStockAlerts correctly', async () => {
    const res = await env.app.request('/api/v1/reports/dashboard', {
      headers: env.base.owner.authHeader,
    })
    const body = (await res.json()) as { data: DashboardResponse }

    // Should have 2 low stock items (SP-B: stock 2/10, SP-C: stock 0/5)
    // SP-D has minStock=0, so excluded
    expect(body.data.lowStockAlerts).toHaveLength(2)

    // Sorted by currentStock ASC: SP-C (0) first, SP-B (2) second
    expect(body.data.lowStockAlerts[0]!.currentStock).toBe(0)
    expect(body.data.lowStockAlerts[0]!.status).toBe('out')
    expect(body.data.lowStockAlerts[1]!.currentStock).toBe(2)
    expect(body.data.lowStockAlerts[1]!.status).toBe('low')
  })

  it('returns overdueDebts correctly', async () => {
    const res = await env.app.request('/api/v1/reports/dashboard', {
      headers: env.base.owner.authHeader,
    })
    const body = (await res.json()) as { data: DashboardResponse }

    expect(body.data.overdueDebts).toHaveLength(1)
    expect(body.data.overdueDebts[0]!.name).toBe('KH Nợ Quá Hạn')
    expect(body.data.overdueDebts[0]!.totalDebt).toBe(500_000)
    expect(body.data.overdueDebts[0]!.maxOverdueDays).toBeGreaterThanOrEqual(49)
  })

  it('accepts period parameter', async () => {
    for (const period of ['today', 'week', 'month', 'year']) {
      const res = await env.app.request(`/api/v1/reports/dashboard?period=${period}`, {
        headers: env.base.owner.authHeader,
      })
      expect(res.status).toBe(200)
    }
  })

  it('multi-tenant: store B sees zeroes', async () => {
    const res = await env.app.request('/api/v1/reports/dashboard', {
      headers: env.storeBOwnerAuth,
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: DashboardResponse }
    expect(body.data.metrics.revenue.value).toBe(0)
    expect(body.data.metrics.orderCount.value).toBe(0)
    expect(body.data.topProducts).toHaveLength(0)
    expect(body.data.lowStockAlerts).toHaveLength(0)
    expect(body.data.overdueDebts).toHaveLength(0)
  })

  it('staff gets 403', async () => {
    const res = await env.app.request('/api/v1/reports/dashboard', {
      headers: env.base.staff.authHeader,
    })
    expect(res.status).toBe(403)
  })

  it('manager gets 200', async () => {
    const res = await env.app.request('/api/v1/reports/dashboard', {
      headers: env.base.manager.authHeader,
    })
    expect(res.status).toBe(200)
  })

  it('trend is null when previousValue is 0', async () => {
    const res = await env.app.request('/api/v1/reports/dashboard', {
      headers: env.base.owner.authHeader,
    })
    const body = (await res.json()) as { data: DashboardResponse }
    // Yesterday had no orders, so previousValue = 0, trend = null
    expect(body.data.metrics.revenue.trend).toBeNull()
  })
})

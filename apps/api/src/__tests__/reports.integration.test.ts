import { Hono } from 'hono'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { customers, debts, orders, receipts, stores, supplierPayments, suppliers, users } from '@kiotviet-lite/shared'

import { createReportsRoutes } from '../routes/reports.routes.js'
import { errorHandler } from '../middleware/error-handler.js'
import { signAccessToken } from '../lib/jwt.js'
import { hashPassword } from '../lib/password.js'
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

  // Create customer with debts of varying ages
  const [customer1] = await base.db
    .insert(customers)
    .values({
      storeId: base.storeId,
      name: 'KH Nợ Nhiều',
      phone: '0900001111',
      currentDebt: 500_000,
      debtLimit: 1_000_000,
    })
    .returning()

  const [customer2] = await base.db
    .insert(customers)
    .values({
      storeId: base.storeId,
      name: 'KH Nợ Ít',
      phone: '0900002222',
      currentDebt: 100_000,
      debtLimit: 500_000,
    })
    .returning()

  // Create orders for debt records
  const [order1] = await base.db
    .insert(orders)
    .values({
      storeId: base.storeId,
      customerId: customer1!.id,
      orderNumber: 'ORD-TEST-001',
      subtotal: 300_000,
      discountAmount: 0,
      total: 300_000,
      paymentMethod: 'debt',
      paymentStatus: 'partial',
      userId: base.owner.id,
    })
    .returning()

  const [order2] = await base.db
    .insert(orders)
    .values({
      storeId: base.storeId,
      customerId: customer1!.id,
      orderNumber: 'ORD-TEST-002',
      subtotal: 200_000,
      discountAmount: 0,
      total: 200_000,
      paymentMethod: 'debt',
      paymentStatus: 'partial',
      userId: base.owner.id,
    })
    .returning()

  const [order3] = await base.db
    .insert(orders)
    .values({
      storeId: base.storeId,
      customerId: customer2!.id,
      orderNumber: 'ORD-TEST-003',
      subtotal: 100_000,
      discountAmount: 0,
      total: 100_000,
      paymentMethod: 'debt',
      paymentStatus: 'unpaid',
      userId: base.owner.id,
    })
    .returning()

  // Debts: 1 recent (10 days), 1 old (50 days), 1 very old (100 days for customer2)
  const now = Date.now()
  await base.db.insert(debts).values([
    {
      storeId: base.storeId,
      orderId: order1!.id,
      customerId: customer1!.id,
      amount: 300_000,
      paid: 0,
      remaining: 300_000,
      createdAt: new Date(now - 10 * 86400000),
    },
    {
      storeId: base.storeId,
      orderId: order2!.id,
      customerId: customer1!.id,
      amount: 200_000,
      paid: 0,
      remaining: 200_000,
      createdAt: new Date(now - 50 * 86400000),
    },
    {
      storeId: base.storeId,
      orderId: order3!.id,
      customerId: customer2!.id,
      amount: 100_000,
      paid: 0,
      remaining: 100_000,
      createdAt: new Date(now - 100 * 86400000),
    },
  ])

  // Receipts for cashflow
  await base.db.insert(receipts).values({
    storeId: base.storeId,
    customerId: customer1!.id,
    amount: 150_000,
    createdBy: base.owner.id,
  })

  // Supplier with debt
  const [supplier1] = await base.db
    .insert(suppliers)
    .values({
      storeId: base.storeId,
      name: 'NCC Test',
      currentDebt: 300_000,
    })
    .returning()

  // Supplier payment
  await base.db.insert(supplierPayments).values({
    storeId: base.storeId,
    supplierId: supplier1!.id,
    amount: 100_000,
    createdBy: base.owner.id,
  })

  // Store B (multi-tenant)
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
  const storeBToken = await signAccessToken({
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

describe('GET /api/v1/reports/debt-aging', () => {
  it('returns aging report with correct buckets', async () => {
    const res = await env.app.request('/api/v1/reports/debt-aging', {
      headers: env.base.owner.authHeader,
    })
    expect(res.status).toBe(200)
    const body: any = await res.json()
    expect(body.data.rows).toHaveLength(2)
    expect(body.data.bucketLabels).toHaveLength(4)
    expect(body.data.totals.totalDebt).toBe(600_000)
  })

  it('sorts by total debt descending', async () => {
    const res = await env.app.request('/api/v1/reports/debt-aging', {
      headers: env.base.owner.authHeader,
    })
    const body: any = await res.json()
    expect(body.data.rows[0].customerName).toBe('KH Nợ Nhiều')
    expect(body.data.rows[0].totalDebt).toBe(500_000)
  })

  it('multi-tenant: store B sees empty report', async () => {
    const res = await env.app.request('/api/v1/reports/debt-aging', {
      headers: env.storeBOwnerAuth,
    })
    expect(res.status).toBe(200)
    const body: any = await res.json()
    expect(body.data.rows).toHaveLength(0)
    expect(body.data.totals.totalDebt).toBe(0)
  })

  it('staff gets 403', async () => {
    const res = await env.app.request('/api/v1/reports/debt-aging', {
      headers: env.base.staff.authHeader,
    })
    expect(res.status).toBe(403)
  })

  it('manager gets 200', async () => {
    const res = await env.app.request('/api/v1/reports/debt-aging', {
      headers: env.base.manager.authHeader,
    })
    expect(res.status).toBe(200)
  })
})

describe('GET /api/v1/reports/debt-aging/csv', () => {
  it('returns CSV with correct headers', async () => {
    const res = await env.app.request('/api/v1/reports/debt-aging/csv', {
      headers: env.base.owner.authHeader,
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/csv')
    const text = await res.text()
    expect(text).toContain('Khách hàng')
    expect(text).toContain('Tổng cộng')
  })
})

describe('GET /api/v1/reports/debt-summary', () => {
  it('returns summary with receivable, payable, cashflow', async () => {
    const res = await env.app.request('/api/v1/reports/debt-summary', {
      headers: env.base.owner.authHeader,
    })
    expect(res.status).toBe(200)
    const body: any = await res.json()
    expect(body.data.receivable.totalDebt).toBe(600_000)
    expect(body.data.receivable.customerCount).toBe(2)
    expect(body.data.payable.totalDebt).toBe(300_000)
    expect(body.data.payable.supplierCount).toBe(1)
    expect(body.data.cashFlow.totalIn).toBe(150_000)
    expect(body.data.cashFlow.totalOut).toBe(100_000)
    expect(body.data.cashFlow.net).toBe(50_000)
  })

  it('multi-tenant: store B sees zeroes', async () => {
    const res = await env.app.request('/api/v1/reports/debt-summary', {
      headers: env.storeBOwnerAuth,
    })
    expect(res.status).toBe(200)
    const body: any = await res.json()
    expect(body.data.receivable.totalDebt).toBe(0)
    expect(body.data.payable.totalDebt).toBe(0)
  })

  it('filters by date range', async () => {
    const future = new Date(Date.now() + 86400000).toISOString()
    const past = new Date(Date.now() - 86400000).toISOString()
    const res = await env.app.request(
      `/api/v1/reports/debt-summary?from=${past}&to=${future}`,
      { headers: env.base.owner.authHeader },
    )
    expect(res.status).toBe(200)
    const body: any = await res.json()
    expect(body.data.cashFlow.totalIn).toBe(150_000)
  })

  it('staff gets 403', async () => {
    const res = await env.app.request('/api/v1/reports/debt-summary', {
      headers: env.base.staff.authHeader,
    })
    expect(res.status).toBe(403)
  })
})

describe('GET /api/v1/reports/debt-summary/csv', () => {
  it('returns CSV with BOM and sections', async () => {
    const res = await env.app.request('/api/v1/reports/debt-summary/csv', {
      headers: env.base.owner.authHeader,
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/csv')
    const text = await res.text()
    expect(text).toContain('PHẢI THU')
    expect(text).toContain('PHẢI TRẢ')
    expect(text).toContain('SỔ QUỸ')
  })
})

describe('PATCH /api/v1/store (debt settings)', () => {
  it('updates debtWarningPercent', async () => {
    const storeApp = new Hono()
    storeApp.onError(errorHandler)
    const { createStoreRoutes } = await import('../routes/store.routes.js')
    storeApp.route('/api/v1/store', createStoreRoutes({ db: env.base.db }))

    const res = await storeApp.request('/api/v1/store', {
      method: 'PATCH',
      headers: {
        ...env.base.owner.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ debtWarningPercent: 90 }),
    })
    expect(res.status).toBe(200)
    const body: any = await res.json()
    expect(body.data.debtWarningPercent).toBe(90)
  })

  it('updates debtOverdueDays', async () => {
    const storeApp = new Hono()
    storeApp.onError(errorHandler)
    const { createStoreRoutes } = await import('../routes/store.routes.js')
    storeApp.route('/api/v1/store', createStoreRoutes({ db: env.base.db }))

    const res = await storeApp.request('/api/v1/store', {
      method: 'PATCH',
      headers: {
        ...env.base.owner.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ debtOverdueDays: '15,45,90' }),
    })
    expect(res.status).toBe(200)
    const body: any = await res.json()
    expect(body.data.debtOverdueDays).toBe('15,45,90')
  })

  it('rejects invalid debtWarningPercent = 0', async () => {
    const storeApp = new Hono()
    storeApp.onError(errorHandler)
    const { createStoreRoutes } = await import('../routes/store.routes.js')
    storeApp.route('/api/v1/store', createStoreRoutes({ db: env.base.db }))

    const res = await storeApp.request('/api/v1/store', {
      method: 'PATCH',
      headers: {
        ...env.base.owner.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ debtWarningPercent: 0 }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects invalid debtOverdueDays', async () => {
    const storeApp = new Hono()
    storeApp.onError(errorHandler)
    const { createStoreRoutes } = await import('../routes/store.routes.js')
    storeApp.route('/api/v1/store', createStoreRoutes({ db: env.base.db }))

    const res = await storeApp.request('/api/v1/store', {
      method: 'PATCH',
      headers: {
        ...env.base.owner.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ debtOverdueDays: 'abc' }),
    })
    expect(res.status).toBe(400)
  })
})

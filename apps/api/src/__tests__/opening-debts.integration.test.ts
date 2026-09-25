import { eq } from 'drizzle-orm'
import type { Hono } from 'hono'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { auditLogs, customers, debts, orders, stores, users } from '@kiotviet-lite/shared'

import { signAccessToken } from '../lib/jwt.js'
import { createCustomersRoutes } from '../routes/customers.routes.js'
import { createReceiptsRoutes } from '../routes/receipts.routes.js'
import { getDebtAgingReport } from '../services/reports.service.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

describe('nợ đầu kỳ khách hàng', () => {
  let env: TestEnv
  let customerId: string
  let app: Hono

  beforeEach(async () => {
    env = await createTestEnv()
    app = createCustomersRoutes({ db: env.db })
    const [customer] = await env.db
      .insert(customers)
      .values({
        code: 'TEST-KH-24-1',
        storeId: env.storeId,
        name: 'Khách chuyển sang',
        phone: '0911111222',
      })
      .returning({ id: customers.id })
    customerId = customer!.id
  })

  afterEach(async () => env.close())

  const input = { amount: 422_158_349, incurredAt: '2025-01-15' }

  async function opening(customer: string, body: unknown, authHeader: { Authorization: string }) {
    const response = await app.request(`/${customer}/opening-debt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify(body),
    })
    return {
      status: response.status,
      body: (await response.json()) as {
        data?: {
          id: string
          type: string
          orderId: string | null
          amount: number
          remaining: number
          incurredAt: string
        }
        error?: { code: string }
      },
    }
  }

  it('creates an orderless debt visible in the ledger, both balances, aging and audit log', async () => {
    const result = await opening(customerId, input, env.owner.authHeader)
    expect(result.status).toBe(201)
    expect(result.body.data).toMatchObject({
      orderId: null,
      type: 'opening',
      amount: input.amount,
      remaining: input.amount,
    })
    expect(result.body.data!.incurredAt).toBe('2025-01-14T17:00:00.000Z')

    const ledger = await app.request(`/${customerId}/debts`, { headers: env.owner.authHeader })
    const { data } = (await ledger.json()) as {
      data: {
        currentDebt: number
        items: Array<{
          id: string
          orderCode: string | null
          type: string
          date: string
          remainingAmount: number
        }>
      }
    }
    expect(data.currentDebt).toBe(input.amount)
    expect(data.items).toEqual([
      expect.objectContaining({
        id: result.body.data!.id,
        orderCode: null,
        type: 'opening',
        remainingAmount: input.amount,
        date: result.body.data!.incurredAt,
      }),
    ])
    const rows = await env.db
      .select({ remaining: debts.remaining })
      .from(debts)
      .where(eq(debts.customerId, customerId))
    expect(rows.reduce((sum, row) => sum + Number(row.remaining), 0)).toBe(data.currentDebt)

    const report = await getDebtAgingReport({ db: env.db, storeId: env.storeId, query: {} })
    expect(report.rows.find((row) => row.customerId === customerId)?.buckets).toEqual([
      0,
      0,
      0,
      input.amount,
    ])
    const logs = await env.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.targetId, result.body.data!.id))
    expect(logs).toEqual([
      expect.objectContaining({
        action: 'debt.opening_created',
        actorId: env.owner.id,
        storeId: env.storeId,
      }),
    ])
  })

  it('rejects managers, staff and another store owner', async () => {
    for (const actor of [env.manager, env.staff]) {
      expect((await opening(customerId, input, actor.authHeader)).status).toBe(403)
    }
    const [otherStore] = await env.db.insert(stores).values({ name: 'Cửa hàng khác' }).returning()
    const [otherOwner] = await env.db
      .insert(users)
      .values({
        storeId: otherStore!.id,
        name: 'Owner Other',
        role: 'owner',
        phone: '0987654321',
        passwordHash: 'unused',
        pinHash: 'unused',
      })
      .returning()
    const header = {
      Authorization: `Bearer ${signAccessToken({ userId: otherOwner!.id, storeId: otherStore!.id, role: 'owner' })}`,
    }
    expect((await opening(customerId, input, header)).status).toBe(404)
    expect((await app.request(`/${customerId}/debts`, { headers: header })).status).toBe(404)
  })

  it('rejects existing balance, including a repeated opening operation', async () => {
    expect((await opening(customerId, input, env.owner.authHeader)).status).toBe(201)
    expect((await opening(customerId, input, env.owner.authHeader)).status).toBe(422)
    const rows = await env.db.select().from(debts).where(eq(debts.customerId, customerId))
    expect(rows).toHaveLength(1)
  })

  it('rejects zero, missing, malformed and future dates', async () => {
    for (const body of [
      { ...input, amount: 0 },
      { ...input, amount: null },
      { ...input, incurredAt: '2025-02-30' },
      { ...input, incurredAt: '2999-01-01' },
    ]) {
      expect((await opening(customerId, body, env.owner.authHeader)).status).toBe(400)
    }
    const ledger = await app.request(`/${customerId}/debts`, { headers: env.owner.authHeader })
    const ledgerBody = (await ledger.json()) as { data: { currentDebt: number } }
    expect(ledgerBody.data.currentDebt).toBe(0)
  })

  it('allocates a receipt to old opening debt before a newer sale debt', async () => {
    const opened = await opening(
      customerId,
      { amount: 100_000, incurredAt: '2024-01-15' },
      env.owner.authHeader,
    )
    expect(opened.status).toBe(201)
    const [order] = await env.db
      .insert(orders)
      .values({
        storeId: env.storeId,
        customerId,
        userId: env.owner.id,
        orderNumber: 'NEW-ORDER',
        subtotal: 50_000,
        total: 50_000,
        paymentMethod: 'debt',
        paymentStatus: 'pending',
      })
      .returning()
    const [sale] = await env.db
      .insert(debts)
      .values({
        storeId: env.storeId,
        customerId,
        orderId: order!.id,
        amount: 50_000,
        remaining: 50_000,
      })
      .returning()
    await env.db.update(customers).set({ currentDebt: 150_000 }).where(eq(customers.id, customerId))
    const aging = await getDebtAgingReport({ db: env.db, storeId: env.storeId, query: {} })
    expect(aging.rows.find((row) => row.customerId === customerId)?.buckets).toEqual([
      50_000, 0, 0, 100_000,
    ])

    const receiptApp = createReceiptsRoutes({ db: env.db })
    const list = await receiptApp.request(`/customer-debts/${customerId}`, {
      headers: env.owner.authHeader,
    })
    expect(list.status).toBe(200)
    const listBody = (await list.json()) as {
      data: { items: Array<{ id: string; orderId: string | null; orderCode: string | null }> }
    }
    expect(listBody.data.items.map((item) => item.id)).toEqual([opened.body.data!.id, sale!.id])
    expect(listBody.data.items[0]).toMatchObject({ orderId: null, orderCode: null })

    const receipt = await receiptApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...env.owner.authHeader },
      body: JSON.stringify({
        customerId,
        amount: 100_000,
        allocationMode: 'fifo',
        allocations: [{ debtId: opened.body.data!.id, amount: 100_000 }],
      }),
    })
    expect(receipt.status).toBe(201)
    const receiptBody = (await receipt.json()) as {
      data: { allocations: Array<{ orderId: string | null; orderCode: string | null }> }
    }
    expect(receiptBody.data.allocations[0]).toMatchObject({ orderId: null, orderCode: null })
    const ledger = await app.request(`/${customerId}/debts`, { headers: env.owner.authHeader })
    const ledgerBody = (await ledger.json()) as {
      data: { currentDebt: number; items: Array<{ id: string; remainingAmount: number }> }
    }
    expect(ledgerBody.data.currentDebt).toBe(50_000)
    expect(
      ledgerBody.data.items.find((item) => item.id === opened.body.data!.id)?.remainingAmount,
    ).toBe(0)
    expect(ledgerBody.data.items.find((item) => item.id === sale!.id)?.remainingAmount).toBe(50_000)
  })
})

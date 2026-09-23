import { eq } from 'drizzle-orm'
import type { Hono } from 'hono'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { auditLogs, stores, suppliers, users } from '@kiotviet-lite/shared'

import { signAccessToken } from '../lib/jwt.js'
import { createSupplierDebtAdjustmentsRoutes } from '../routes/supplier-debt-adjustments.routes.js'
import { createSupplierPaymentsRoutes } from '../routes/supplier-payments.routes.js'
import { createSuppliersRoutes } from '../routes/suppliers.routes.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

describe('supplier debt adjustments and opening debt', () => {
  let env: TestEnv
  let supplierId: string
  let adjustments: Hono
  let supplierRoutes: Hono
  let payments: Hono

  beforeEach(async () => {
    env = await createTestEnv()
    const [supplier] = await env.db
      .insert(suppliers)
      .values({ storeId: env.storeId, name: 'Nhà cung cấp A' })
      .returning()
    supplierId = supplier!.id
    adjustments = createSupplierDebtAdjustmentsRoutes({ db: env.db })
    supplierRoutes = createSuppliersRoutes({ db: env.db })
    payments = createSupplierPaymentsRoutes({ db: env.db })
  })
  afterEach(async () => env.close())

  async function post(path: string, body: unknown, auth = env.owner.authHeader) {
    const response = await adjustments.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify(body),
    })
    return {
      status: response.status,
      body: (await response.json()) as {
        data?: {
          id: string
          oldAmount: number
          newAmount: number
          reason: string
          supplierId: string
          type: string
          incurredAt: string | null
        }
        error?: { code: string }
      },
    }
  }

  it('only owner can adjust with a reason; keeps before/after and audit trail', async () => {
    const input = { supplierId, newAmount: 250_000, reason: 'Đối chiếu hóa đơn cũ' }
    for (const auth of [env.manager.authHeader, env.staff.authHeader]) {
      expect((await post('/', input, auth)).status).toBe(403)
    }
    expect((await post('/', { ...input, reason: '  ' })).status).toBe(400)
    expect((await post('/', { ...input, newAmount: -1 })).status).toBe(400)
    const created = await post('/', input)
    expect(created.status).toBe(201)
    expect(created.body.data).toMatchObject({
      supplierId,
      oldAmount: 0,
      newAmount: 250_000,
      reason: input.reason,
      type: 'adjustment',
    })
    const changed = await post('/', {
      ...input,
      newAmount: 100_000,
      reason: 'Điều chỉnh sau đối chiếu',
    })
    expect(changed.status).toBe(201)
    expect(changed.body.data).toMatchObject({ oldAmount: 250_000, newAmount: 100_000 })
    expect((await post('/', { ...input, newAmount: 100_000 })).status).toBe(422)
    const list = await adjustments.request(`/?supplierId=${supplierId}`, {
      headers: env.owner.authHeader,
    })
    expect(list.status).toBe(200)
    const listBody = (await list.json()) as {
      data: Array<{ id: string; oldAmount: number; newAmount: number }>
    }
    expect(listBody.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.body.data!.id, oldAmount: 0, newAmount: 250_000 }),
        expect.objectContaining({
          id: changed.body.data!.id,
          oldAmount: 250_000,
          newAmount: 100_000,
        }),
      ]),
    )
    const detail = await supplierRoutes.request(`/${supplierId}`, { headers: env.owner.authHeader })
    const detailBody = (await detail.json()) as { data: { currentDebt: number } }
    expect(detailBody.data.currentDebt).toBe(100_000)
    const logs = await env.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.targetId, changed.body.data!.id))
    expect(logs).toEqual([
      expect.objectContaining({
        action: 'supplier_debt_adjustment.created',
        storeId: env.storeId,
        actorId: env.owner.id,
        changes: expect.objectContaining({
          oldAmount: 250_000,
          newAmount: 100_000,
          reason: 'Điều chỉnh sau đối chiếu',
        }),
      }),
    ])
  })

  it('rejects cross-store supplier IDs for adjustment and opening, without leaking history', async () => {
    const [other] = await env.db.insert(stores).values({ name: 'Cửa hàng B' }).returning()
    const [foreignSupplier] = await env.db
      .insert(suppliers)
      .values({ storeId: other!.id, name: 'Nhà cung cấp B' })
      .returning()
    const [otherOwner] = await env.db
      .insert(users)
      .values({
        storeId: other!.id,
        name: 'Chủ B',
        phone: '0987654321',
        role: 'owner',
        passwordHash: 'unused',
        pinHash: 'unused',
      })
      .returning()
    const otherAuth = {
      Authorization: `Bearer ${signAccessToken({ userId: otherOwner!.id, storeId: other!.id, role: 'owner' })}`,
    }
    expect(
      (await post('/', { supplierId: foreignSupplier!.id, newAmount: 100, reason: 'Thử' })).status,
    ).toBe(404)
    expect(
      (
        await post(`/${foreignSupplier!.id}/opening-debt`, {
          amount: 100,
          incurredAt: '2025-01-15',
        })
      ).status,
    ).toBe(404)
    expect((await post('/', { supplierId, newAmount: 100, reason: 'Thử' }, otherAuth)).status).toBe(
      404,
    )
    const list = await adjustments.request(`/?supplierId=${foreignSupplier!.id}`, {
      headers: env.owner.authHeader,
    })
    const listBody = (await list.json()) as { data: unknown[] }
    expect(listBody.data).toEqual([])
  })

  it('loads opening debt at zero once, records date and payment reduces precisely that balance', async () => {
    const input = { amount: 305_431_600, incurredAt: '2025-01-15' }
    for (const auth of [env.manager.authHeader, env.staff.authHeader]) {
      expect((await post(`/${supplierId}/opening-debt`, input, auth)).status).toBe(403)
    }
    for (const invalid of [
      { ...input, amount: -1 },
      { ...input, amount: 0 },
      { ...input, incurredAt: '2999-01-01' },
    ]) {
      expect((await post(`/${supplierId}/opening-debt`, invalid)).status).toBe(400)
    }
    const opened = await post(`/${supplierId}/opening-debt`, input)
    expect(opened.status).toBe(201)
    expect(opened.body.data).toMatchObject({
      type: 'opening',
      oldAmount: 0,
      newAmount: input.amount,
      incurredAt: '2025-01-14T17:00:00.000Z',
    })
    expect((await post(`/${supplierId}/opening-debt`, input)).status).toBe(422)
    const paid = await payments.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...env.owner.authHeader },
      body: JSON.stringify({ supplierId, amount: 5_431_600 }),
    })
    expect(paid.status).toBe(201)
    const paidBody = (await paid.json()) as { data: { debtAfter: number } }
    expect(paidBody.data.debtAfter).toBe(300_000_000)
    const detail = await supplierRoutes.request(`/${supplierId}`, { headers: env.owner.authHeader })
    const detailBody = (await detail.json()) as { data: { currentDebt: number } }
    expect(detailBody.data.currentDebt).toBe(300_000_000)
    const logs = await env.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.targetId, opened.body.data!.id))
    expect(logs).toEqual([
      expect.objectContaining({
        action: 'supplier_debt.opening_created',
        changes: expect.objectContaining({ amount: input.amount, incurredAt: input.incurredAt }),
      }),
    ])
  })
})

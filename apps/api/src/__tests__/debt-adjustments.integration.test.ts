import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { auditLogs, customers, debtAdjustments, stores, users } from '@kiotviet-lite/shared'

import { createDebtAdjustmentsRoutes } from '../routes/debt-adjustments.routes.js'
import { hashPassword } from '../lib/password.js'
import { signAccessToken } from '../lib/jwt.js'
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
  app: ReturnType<typeof createDebtAdjustmentsRoutes>
  customerWithDebtId: string
  customerNoDebtId: string
  deletedCustomerId: string
  // store B for multi-tenant test
  storeBId: string
  storeBOwnerId: string
  storeBOwnerAuth: { Authorization: string }
  storeBCustomerId: string
}

async function setup(): Promise<Env> {
  const base = await createTestEnv()
  const app = createDebtAdjustmentsRoutes({ db: base.db })

  // Customers for store A
  const inserted = await base.db
    .insert(customers)
    .values([
      {
        storeId: base.storeId,
        name: 'KH Có Nợ',
        phone: '0911111000',
        currentDebt: 500_000,
      },
      {
        storeId: base.storeId,
        name: 'KH Không Nợ',
        phone: '0911222000',
        currentDebt: 0,
      },
      {
        storeId: base.storeId,
        name: 'KH Đã Xoá',
        phone: '0911333000',
        currentDebt: 100_000,
        deletedAt: new Date(),
      },
    ])
    .returning({ id: customers.id, name: customers.name })

  const cWithDebt = inserted.find((c) => c.name === 'KH Có Nợ')!
  const cNoDebt = inserted.find((c) => c.name === 'KH Không Nợ')!
  const cDeleted = inserted.find((c) => c.name === 'KH Đã Xoá')!

  // Store B for multi-tenant test
  const [storeB] = await base.db.insert(stores).values({ name: 'Store B' }).returning()
  const storeBPwd = await hashPassword('matkhau123')
  const storeBPin = await hashPassword('444444')
  const [storeBOwner] = await base.db
    .insert(users)
    .values({
      storeId: storeB!.id,
      name: 'Owner B',
      phone: '0909999999',
      passwordHash: storeBPwd,
      pinHash: storeBPin,
      role: 'owner',
    })
    .returning()

  const storeBAccessToken = signAccessToken({
    userId: storeBOwner!.id,
    storeId: storeB!.id,
    role: 'owner',
  })

  const [storeBCustomer] = await base.db
    .insert(customers)
    .values({
      storeId: storeB!.id,
      name: 'KH Store B',
      phone: '0900000001',
      currentDebt: 200_000,
    })
    .returning()

  return {
    base,
    app,
    customerWithDebtId: cWithDebt.id,
    customerNoDebtId: cNoDebt.id,
    deletedCustomerId: cDeleted.id,
    storeBId: storeB!.id,
    storeBOwnerId: storeBOwner!.id,
    storeBOwnerAuth: { Authorization: `Bearer ${storeBAccessToken}` },
    storeBCustomerId: storeBCustomer!.id,
  }
}

interface AdjustmentResp {
  id: string
  customerId: string
  customerName: string | null
  oldAmount: number
  newAmount: number
  reason: string
  adjustedBy: string
  adjustedByName: string | null
  createdAt: string
}

interface ListResp {
  data: AdjustmentResp[]
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

interface ErrResp {
  error: { code: string; message: string; details?: unknown }
}

async function jsonReq<T>(
  env: Env,
  method: string,
  path: string,
  body: unknown,
  authHeader: { Authorization: string },
): Promise<{ status: number; body: T }> {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeader },
  }
  if (body !== undefined) init.body = JSON.stringify(body)
  const res = await env.app.request(path, init)
  const text = await res.text()
  return { status: res.status, body: text ? (JSON.parse(text) as T) : (undefined as T) }
}

async function getReq<T>(
  env: Env,
  path: string,
  authHeader: { Authorization: string },
): Promise<{ status: number; body: T }> {
  const res = await env.app.request(path, {
    method: 'GET',
    headers: authHeader,
  })
  const text = await res.text()
  return { status: res.status, body: text ? (JSON.parse(text) as T) : (undefined as T) }
}

let env: Env

beforeEach(async () => {
  env = await setup()
})

afterEach(async () => {
  await env.base.close()
})

// =================== POST /api/v1/debt-adjustments ===================

describe('POST /', () => {
  it('Owner tạo điều chỉnh giảm nợ, 201 + customer.currentDebt = newAmount', async () => {
    const res = await jsonReq<{ data: AdjustmentResp }>(
      env,
      'POST',
      '/',
      {
        customerId: env.customerWithDebtId,
        newAmount: 300_000,
        reason: 'Xoá nợ xấu, KH đã thanh toán bên ngoài',
      },
      env.base.owner.authHeader,
    )
    expect(res.status).toBe(201)
    expect(res.body.data.oldAmount).toBe(500_000)
    expect(res.body.data.newAmount).toBe(300_000)
    expect(res.body.data.reason).toBe('Xoá nợ xấu, KH đã thanh toán bên ngoài')
    expect(res.body.data.customerName).toBe('KH Có Nợ')
    expect(res.body.data.adjustedByName).toBe('Owner Test')

    // Verify customer.currentDebt updated
    const [customer] = await env.base.db
      .select({ currentDebt: customers.currentDebt })
      .from(customers)
      .where(eq(customers.id, env.customerWithDebtId))
    expect(Number(customer!.currentDebt)).toBe(300_000)
  })

  it('Owner tạo điều chỉnh tăng nợ, 201', async () => {
    const res = await jsonReq<{ data: AdjustmentResp }>(
      env,
      'POST',
      '/',
      {
        customerId: env.customerWithDebtId,
        newAmount: 800_000,
        reason: 'Ghi nhận nợ bổ sung',
      },
      env.base.owner.authHeader,
    )
    expect(res.status).toBe(201)
    expect(res.body.data.oldAmount).toBe(500_000)
    expect(res.body.data.newAmount).toBe(800_000)

    const [customer] = await env.base.db
      .select({ currentDebt: customers.currentDebt })
      .from(customers)
      .where(eq(customers.id, env.customerWithDebtId))
    expect(Number(customer!.currentDebt)).toBe(800_000)
  })

  it('Owner set nợ = 0, 201', async () => {
    const res = await jsonReq<{ data: AdjustmentResp }>(
      env,
      'POST',
      '/',
      {
        customerId: env.customerWithDebtId,
        newAmount: 0,
        reason: 'Xoá toàn bộ nợ',
      },
      env.base.owner.authHeader,
    )
    expect(res.status).toBe(201)
    expect(res.body.data.newAmount).toBe(0)

    const [customer] = await env.base.db
      .select({ currentDebt: customers.currentDebt })
      .from(customers)
      .where(eq(customers.id, env.customerWithDebtId))
    expect(Number(customer!.currentDebt)).toBe(0)
  })

  it('Manager bị từ chối 403', async () => {
    const res = await jsonReq<ErrResp>(
      env,
      'POST',
      '/',
      {
        customerId: env.customerWithDebtId,
        newAmount: 100_000,
        reason: 'Test manager',
      },
      env.base.manager.authHeader,
    )
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('Staff bị từ chối 403 (middleware customers.manage)', async () => {
    const res = await jsonReq<ErrResp>(
      env,
      'POST',
      '/',
      {
        customerId: env.customerWithDebtId,
        newAmount: 100_000,
        reason: 'Test staff',
      },
      env.base.staff.authHeader,
    )
    expect(res.status).toBe(403)
  })

  it('Owner cố điều chỉnh cho KH store khác, 404 multi-tenant', async () => {
    const res = await jsonReq<ErrResp>(
      env,
      'POST',
      '/',
      {
        customerId: env.storeBCustomerId,
        newAmount: 100_000,
        reason: 'Cross-store test',
      },
      env.base.owner.authHeader,
    )
    expect(res.status).toBe(404)
  })

  it('KH đã soft delete, 404', async () => {
    const res = await jsonReq<ErrResp>(
      env,
      'POST',
      '/',
      {
        customerId: env.deletedCustomerId,
        newAmount: 50_000,
        reason: 'Deleted customer test',
      },
      env.base.owner.authHeader,
    )
    expect(res.status).toBe(404)
  })

  it('newAmount === currentDebt, 422', async () => {
    const res = await jsonReq<ErrResp>(
      env,
      'POST',
      '/',
      {
        customerId: env.customerWithDebtId,
        newAmount: 500_000,
        reason: 'Same amount test',
      },
      env.base.owner.authHeader,
    )
    expect(res.status).toBe(422)
    expect(res.body.error.message).toContain('phải khác')
  })

  it('newAmount < 0, 400 VALIDATION_ERROR', async () => {
    const res = await jsonReq<ErrResp>(
      env,
      'POST',
      '/',
      {
        customerId: env.customerWithDebtId,
        newAmount: -1000,
        reason: 'Negative test',
      },
      env.base.owner.authHeader,
    )
    expect(res.status).toBe(400)
  })

  it('reason trống, 400 VALIDATION_ERROR', async () => {
    const res = await jsonReq<ErrResp>(
      env,
      'POST',
      '/',
      {
        customerId: env.customerWithDebtId,
        newAmount: 100_000,
        reason: '',
      },
      env.base.owner.authHeader,
    )
    expect(res.status).toBe(400)
  })

  it('audit log ghi đúng action và changes', async () => {
    const res = await jsonReq<{ data: AdjustmentResp }>(
      env,
      'POST',
      '/',
      {
        customerId: env.customerWithDebtId,
        newAmount: 200_000,
        reason: 'Audit test',
      },
      env.base.owner.authHeader,
    )
    expect(res.status).toBe(201)

    const logs = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'debt_adjustment.created'))

    expect(logs.length).toBeGreaterThanOrEqual(1)
    const log = logs[logs.length - 1]!
    expect(log.targetType).toBe('debt_adjustment')
    expect(log.targetId).toBe(res.body.data.id)
    const changes = log.changes as Record<string, unknown>
    expect(changes.oldAmount).toBe(500_000)
    expect(changes.newAmount).toBe(200_000)
    expect(changes.reason).toBe('Audit test')
    expect(changes.customerName).toBe('KH Có Nợ')
  })

  it('race condition: 2 điều chỉnh tuần tự, oldAmount phiếu 2 = newAmount phiếu 1', async () => {
    // Phiếu 1
    const res1 = await jsonReq<{ data: AdjustmentResp }>(
      env,
      'POST',
      '/',
      {
        customerId: env.customerWithDebtId,
        newAmount: 300_000,
        reason: 'Phiếu 1',
      },
      env.base.owner.authHeader,
    )
    expect(res1.status).toBe(201)
    expect(res1.body.data.oldAmount).toBe(500_000)
    expect(res1.body.data.newAmount).toBe(300_000)

    // Phiếu 2
    const res2 = await jsonReq<{ data: AdjustmentResp }>(
      env,
      'POST',
      '/',
      {
        customerId: env.customerWithDebtId,
        newAmount: 100_000,
        reason: 'Phiếu 2',
      },
      env.base.owner.authHeader,
    )
    expect(res2.status).toBe(201)
    expect(res2.body.data.oldAmount).toBe(300_000) // oldAmount = newAmount phiếu 1
    expect(res2.body.data.newAmount).toBe(100_000)

    // Customer debt cuối = 100_000
    const [customer] = await env.base.db
      .select({ currentDebt: customers.currentDebt })
      .from(customers)
      .where(eq(customers.id, env.customerWithDebtId))
    expect(Number(customer!.currentDebt)).toBe(100_000)
  })
})

// =================== GET /api/v1/debt-adjustments ===================

describe('GET /', () => {
  it('thiếu customerId, 400', async () => {
    const res = await getReq<ErrResp>(env, '/', env.base.owner.authHeader)
    expect(res.status).toBe(400)
  })

  it('list trả đúng paginated, sort created_at DESC', async () => {
    // Tạo 2 adjustments
    await jsonReq(
      env,
      'POST',
      '/',
      { customerId: env.customerWithDebtId, newAmount: 400_000, reason: 'Adj 1' },
      env.base.owner.authHeader,
    )
    await jsonReq(
      env,
      'POST',
      '/',
      { customerId: env.customerWithDebtId, newAmount: 200_000, reason: 'Adj 2' },
      env.base.owner.authHeader,
    )

    const res = await getReq<ListResp>(
      env,
      `/?customerId=${env.customerWithDebtId}`,
      env.base.owner.authHeader,
    )
    expect(res.status).toBe(200)
    expect(res.body.data.length).toBe(2)
    expect(res.body.meta.total).toBe(2)
    // Mới nhất trước
    expect(res.body.data[0]!.reason).toBe('Adj 2')
    expect(res.body.data[1]!.reason).toBe('Adj 1')
  })

  it('multi-tenant: store A không thấy adjustments store B', async () => {
    // Store B owner tạo adjustment
    await jsonReq(
      env,
      'POST',
      '/',
      { customerId: env.storeBCustomerId, newAmount: 100_000, reason: 'Store B adj' },
      env.storeBOwnerAuth,
    )

    // Store A query với customerId store B: trả 0 (không thấy)
    const res = await getReq<ListResp>(
      env,
      `/?customerId=${env.storeBCustomerId}`,
      env.base.owner.authHeader,
    )
    expect(res.status).toBe(200)
    expect(res.body.data.length).toBe(0)
  })

  it('Manager list được (chỉ POST giới hạn Owner)', async () => {
    // Tạo 1 adjustment bằng Owner
    await jsonReq(
      env,
      'POST',
      '/',
      { customerId: env.customerWithDebtId, newAmount: 300_000, reason: 'For manager test' },
      env.base.owner.authHeader,
    )

    const res = await getReq<ListResp>(
      env,
      `/?customerId=${env.customerWithDebtId}`,
      env.base.manager.authHeader,
    )
    expect(res.status).toBe(200)
    expect(res.body.data.length).toBe(1)
  })
})

// =================== PATCH / DELETE → 405 ===================

describe('PATCH/DELETE → 404 (not mounted)', () => {
  it('PATCH / trả 404', async () => {
    const res = await env.app.request('/some-id', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...env.base.owner.authHeader },
      body: JSON.stringify({ newAmount: 100 }),
    })
    expect(res.status).toBe(404)
  })

  it('DELETE / tr��� 404', async () => {
    const res = await env.app.request('/some-id', {
      method: 'DELETE',
      headers: env.base.owner.authHeader,
    })
    expect(res.status).toBe(404)
  })
})

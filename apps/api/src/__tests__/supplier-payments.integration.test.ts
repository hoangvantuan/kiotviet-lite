import { and, eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { auditLogs, supplierPayments, suppliers } from '@kiotviet-lite/shared'

import { createSupplierPaymentsRoutes } from '../routes/supplier-payments.routes.js'
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
  app: ReturnType<typeof createSupplierPaymentsRoutes>
  supplierWithDebtId: string
  supplierNoDebtId: string
  supplierBigDebtId: string
}

async function setup(): Promise<Env> {
  const base = await createTestEnv()
  const app = createSupplierPaymentsRoutes({ db: base.db })

  const inserted = await base.db
    .insert(suppliers)
    .values([
      { storeId: base.storeId, name: 'NCC Có Nợ', phone: '0901111000', currentDebt: 1_000_000 },
      { storeId: base.storeId, name: 'NCC Không Nợ', phone: '0901222000', currentDebt: 0 },
      { storeId: base.storeId, name: 'NCC Nợ Lớn', phone: '0901333000', currentDebt: 5_000_000 },
    ])
    .returning({ id: suppliers.id, name: suppliers.name })

  const withDebt = inserted.find((s) => s.name === 'NCC Có Nợ')
  const noDebt = inserted.find((s) => s.name === 'NCC Không Nợ')
  const bigDebt = inserted.find((s) => s.name === 'NCC Nợ Lớn')
  if (!withDebt || !noDebt || !bigDebt) throw new Error('seed suppliers failed')

  return {
    base,
    app,
    supplierWithDebtId: withDebt.id,
    supplierNoDebtId: noDebt.id,
    supplierBigDebtId: bigDebt.id,
  }
}

interface PaymentResp {
  id: string
  supplierId: string
  supplierName: string | null
  supplierPhone: string | null
  amount: number
  note: string | null
  createdBy: string
  createdByName: string | null
  createdAt: string
  debtAfter: number | null
}

interface ListResp {
  data: PaymentResp[]
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

describe('POST /supplier-payments (createSupplierPayment)', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Owner tạo phiếu chi cho NCC có nợ → 201, debt giảm đúng', async () => {
    const r = await jsonReq<{ data: PaymentResp }>(
      env,
      'POST',
      '/',
      {
        supplierId: env.supplierWithDebtId,
        amount: 300_000,
        note: 'Trả nợ tháng 4',
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
    expect(r.body.data.amount).toBe(300_000)
    expect(r.body.data.note).toBe('Trả nợ tháng 4')
    expect(r.body.data.supplierName).toBe('NCC Có Nợ')
    expect(r.body.data.debtAfter).toBe(700_000)
    expect(r.body.data.createdByName).toBe('Owner Test')

    const supplierRow = await env.base.db.query.suppliers.findFirst({
      where: eq(suppliers.id, env.supplierWithDebtId),
    })
    expect(supplierRow?.currentDebt).toBe(700_000)
  })

  it('amount === currentDebt → tạo OK, debt sau = 0', async () => {
    const r = await jsonReq<{ data: PaymentResp }>(
      env,
      'POST',
      '/',
      { supplierId: env.supplierWithDebtId, amount: 1_000_000 },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
    expect(r.body.data.debtAfter).toBe(0)
  })

  it('Manager tạo phiếu chi → 403 FORBIDDEN', async () => {
    const r = await jsonReq<ErrResp>(
      env,
      'POST',
      '/',
      { supplierId: env.supplierWithDebtId, amount: 100_000 },
      env.base.manager.authHeader,
    )
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('FORBIDDEN')
  })

  it('Staff tạo → 403 (qua middleware permission)', async () => {
    const r = await jsonReq<ErrResp>(
      env,
      'POST',
      '/',
      { supplierId: env.supplierWithDebtId, amount: 100_000 },
      env.base.staff.authHeader,
    )
    expect(r.status).toBe(403)
  })

  it('amount > currentDebt → 422 BUSINESS_RULE_VIOLATION', async () => {
    const r = await jsonReq<ErrResp>(
      env,
      'POST',
      '/',
      { supplierId: env.supplierWithDebtId, amount: 2_000_000 },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('BUSINESS_RULE_VIOLATION')
    expect(r.body.error.message).toContain('vượt quá nợ')
  })

  it('NCC currentDebt = 0 → 422 với message "không còn nợ phải trả"', async () => {
    const r = await jsonReq<ErrResp>(
      env,
      'POST',
      '/',
      { supplierId: env.supplierNoDebtId, amount: 100_000 },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(422)
    expect(r.body.error.message).toContain('không còn nợ phải trả')
  })

  it('Body thiếu supplierId → 400 VALIDATION_ERROR', async () => {
    const r = await jsonReq<ErrResp>(
      env,
      'POST',
      '/',
      { amount: 100_000 },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
  })

  it('amount = 0 → 400 VALIDATION_ERROR', async () => {
    const r = await jsonReq<ErrResp>(
      env,
      'POST',
      '/',
      { supplierId: env.supplierWithDebtId, amount: 0 },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
  })

  it('Owner tạo cho NCC store khác → 404', async () => {
    // tạo store + supplier ở store khác
    const otherEnv = await createTestEnv()
    const [otherSupplier] = await otherEnv.db
      .insert(suppliers)
      .values({
        storeId: otherEnv.storeId,
        name: 'NCC Khác Store',
        currentDebt: 500_000,
      })
      .returning({ id: suppliers.id })

    const r = await jsonReq<ErrResp>(
      env,
      'POST',
      '/',
      { supplierId: otherSupplier!.id, amount: 100_000 },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(404)
    await otherEnv.close()
  })

  it('Audit log có row mới với action=supplier_payment.created', async () => {
    await jsonReq(
      env,
      'POST',
      '/',
      { supplierId: env.supplierWithDebtId, amount: 200_000, note: 'test' },
      env.base.owner.authHeader,
    )
    const logs = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'supplier_payment.created'))
    expect(logs.length).toBe(1)
    const changes = logs[0]?.changes as Record<string, unknown>
    expect(changes.amount).toBe(200_000)
    expect(changes.debtBefore).toBe(1_000_000)
    expect(changes.debtAfter).toBe(800_000)
    expect(changes.supplierName).toBe('NCC Có Nợ')
  })

  it('NCC đã soft delete → 404', async () => {
    await env.base.db
      .update(suppliers)
      .set({ deletedAt: new Date() })
      .where(eq(suppliers.id, env.supplierWithDebtId))

    const r = await jsonReq<ErrResp>(
      env,
      'POST',
      '/',
      { supplierId: env.supplierWithDebtId, amount: 100_000 },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(404)
  })
})

describe('GET /supplier-payments (listSupplierPayments)', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
    // tạo 3 phiếu chi
    await jsonReq(
      env,
      'POST',
      '/',
      { supplierId: env.supplierWithDebtId, amount: 100_000, note: 'phiếu 1' },
      env.base.owner.authHeader,
    )
    await jsonReq(
      env,
      'POST',
      '/',
      { supplierId: env.supplierBigDebtId, amount: 500_000, note: 'phiếu 2' },
      env.base.owner.authHeader,
    )
    await jsonReq(
      env,
      'POST',
      '/',
      { supplierId: env.supplierBigDebtId, amount: 200_000, note: 'phiếu 3 kèm 50%' },
      env.base.owner.authHeader,
    )
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Owner list → 200, trả 3 phiếu sort created_at DESC', async () => {
    const r = await jsonReq<ListResp>(env, 'GET', '/', undefined, env.base.owner.authHeader)
    expect(r.status).toBe(200)
    expect(r.body.data.length).toBe(3)
    expect(r.body.meta.total).toBe(3)
  })

  it('Manager cũng list được', async () => {
    const r = await jsonReq<ListResp>(env, 'GET', '/', undefined, env.base.manager.authHeader)
    expect(r.status).toBe(200)
    expect(r.body.data.length).toBe(3)
  })

  it('Staff list → 403 (qua middleware)', async () => {
    const r = await jsonReq<ErrResp>(env, 'GET', '/', undefined, env.base.staff.authHeader)
    expect(r.status).toBe(403)
  })

  it('filter supplierId → chỉ phiếu của NCC đó', async () => {
    const r = await jsonReq<ListResp>(
      env,
      'GET',
      `/?supplierId=${env.supplierBigDebtId}`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.body.data.length).toBe(2)
    expect(r.body.data.every((p) => p.supplierId === env.supplierBigDebtId)).toBe(true)
  })

  it('search theo tên NCC', async () => {
    const r = await jsonReq<ListResp>(
      env,
      'GET',
      '/?search=Nợ%20Lớn',
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.body.data.length).toBe(2)
  })

  it('search escape wildcard "%": không match unintended', async () => {
    // input "10%" sẽ được escape → tìm note chứa "10%" theo nghĩa đen
    // Note "phiếu 3 kèm 50%" có chứa "%". Test escape: search "0%" should match "50%" (literal)
    const r = await jsonReq<ListResp>(
      env,
      'GET',
      '/?search=' + encodeURIComponent('0%'),
      undefined,
      env.base.owner.authHeader,
    )
    // Phải tìm thấy note "phiếu 3 kèm 50%" vì có chứa chuỗi "0%" literal
    expect(r.body.data.length).toBe(1)
    expect(r.body.data[0]?.note).toContain('50%')
  })

  it('multi-tenant: store khác không thấy phiếu store này', async () => {
    const otherEnv = await createTestEnv()
    const otherApp = createSupplierPaymentsRoutes({ db: otherEnv.db })
    const res = await otherApp.request('/', { headers: otherEnv.owner.authHeader })
    const body = (await res.json()) as ListResp
    expect(body.data.length).toBe(0)
    await otherEnv.close()
  })

  it('pagination: pageSize=1, page=2 trả phiếu thứ 2', async () => {
    const r = await jsonReq<ListResp>(
      env,
      'GET',
      '/?pageSize=1&page=2',
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.body.data.length).toBe(1)
    expect(r.body.meta.totalPages).toBe(3)
  })

  it('orphan supplier (đã soft delete): vẫn trả phiếu, supplierName còn nguyên', async () => {
    await env.base.db
      .update(suppliers)
      .set({ deletedAt: new Date() })
      .where(eq(suppliers.id, env.supplierWithDebtId))
    const r = await jsonReq<ListResp>(env, 'GET', '/', undefined, env.base.owner.authHeader)
    expect(r.body.data.length).toBe(3)
    const p = r.body.data.find((x) => x.supplierId === env.supplierWithDebtId)
    expect(p?.supplierName).toBe('NCC Có Nợ')
  })
})

describe('GET /supplier-payments/:id (getSupplierPayment)', () => {
  let env: Env
  let createdId: string
  beforeEach(async () => {
    env = await setup()
    const r = await jsonReq<{ data: PaymentResp }>(
      env,
      'POST',
      '/',
      { supplierId: env.supplierWithDebtId, amount: 100_000 },
      env.base.owner.authHeader,
    )
    createdId = r.body.data.id
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Owner xem detail → 200', async () => {
    const r = await jsonReq<{ data: PaymentResp }>(
      env,
      'GET',
      `/${createdId}`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.amount).toBe(100_000)
    expect(r.body.data.debtAfter).toBeNull()
  })

  it('ID không phải uuid → 400', async () => {
    const r = await jsonReq<ErrResp>(env, 'GET', '/not-uuid', undefined, env.base.owner.authHeader)
    expect(r.status).toBe(400)
  })

  it('ID không tồn tại → 404', async () => {
    const r = await jsonReq<ErrResp>(
      env,
      'GET',
      '/01928a8e-1234-7c01-9999-aaaaaaaaaaaa',
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(404)
  })

  it('Khác store → 404', async () => {
    const otherEnv = await createTestEnv()
    const otherApp = createSupplierPaymentsRoutes({ db: otherEnv.db })
    const res = await otherApp.request(`/${createdId}`, { headers: otherEnv.owner.authHeader })
    expect(res.status).toBe(404)
    await otherEnv.close()
  })
})

describe('Method not allowed (immutable)', () => {
  let env: Env
  let createdId: string
  beforeEach(async () => {
    env = await setup()
    const r = await jsonReq<{ data: PaymentResp }>(
      env,
      'POST',
      '/',
      { supplierId: env.supplierWithDebtId, amount: 100_000 },
      env.base.owner.authHeader,
    )
    createdId = r.body.data.id
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('PATCH /:id → 404 hoặc 405 (không mount)', async () => {
    const res = await env.app.request(`/${createdId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...env.base.owner.authHeader },
      body: JSON.stringify({ note: 'sửa' }),
    })
    expect([404, 405]).toContain(res.status)
  })

  it('DELETE /:id → 404 hoặc 405 (không mount)', async () => {
    const res = await env.app.request(`/${createdId}`, {
      method: 'DELETE',
      headers: env.base.owner.authHeader,
    })
    expect([404, 405]).toContain(res.status)
  })
})

describe('Debt consistency across sequential payments', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('2 phiếu chi tuần tự cho cùng NCC: phiếu 1 OK, phiếu 2 vượt nợ → 422', async () => {
    const r1 = await jsonReq<{ data: PaymentResp }>(
      env,
      'POST',
      '/',
      { supplierId: env.supplierWithDebtId, amount: 800_000 },
      env.base.owner.authHeader,
    )
    expect(r1.status).toBe(201)
    expect(r1.body.data.debtAfter).toBe(200_000)

    const r2 = await jsonReq<ErrResp>(
      env,
      'POST',
      '/',
      { supplierId: env.supplierWithDebtId, amount: 500_000 },
      env.base.owner.authHeader,
    )
    expect(r2.status).toBe(422)

    // Verify supplier debt sau cùng = 200_000
    const supplierRow = await env.base.db.query.suppliers.findFirst({
      where: eq(suppliers.id, env.supplierWithDebtId),
    })
    expect(supplierRow?.currentDebt).toBe(200_000)

    // Verify chỉ có 1 phiếu chi được tạo
    const payments = await env.base.db
      .select()
      .from(supplierPayments)
      .where(
        and(
          eq(supplierPayments.supplierId, env.supplierWithDebtId),
          eq(supplierPayments.storeId, env.base.storeId),
        ),
      )
    expect(payments.length).toBe(1)
  })
})

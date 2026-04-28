import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { auditLogs, suppliers } from '@kiotviet-lite/shared'

import { createSuppliersRoutes } from '../routes/suppliers.routes.js'
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
  app: ReturnType<typeof createSuppliersRoutes>
}

async function setup(): Promise<Env> {
  const base = await createTestEnv()
  return { base, app: createSuppliersRoutes({ db: base.db }) }
}

interface SupplierResp {
  id: string
  storeId: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  taxId: string | null
  notes: string | null
  currentDebt: number
  totalPurchased: number
  purchaseCount: number
}

interface ApiError {
  error: { code: string; message: string; details?: { field?: string } }
}

async function jsonRequest<T>(
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

describe('POST /suppliers (createSupplier)', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Owner tạo NCC tối thiểu → 201', async () => {
    const r = await jsonRequest<{ data: SupplierResp }>(
      env,
      'POST',
      '/',
      { name: 'NCC Hà Nội' },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
    expect(r.body.data.name).toBe('NCC Hà Nội')
    expect(r.body.data.currentDebt).toBe(0)
    expect(r.body.data.purchaseCount).toBe(0)
  })

  it('Manager tạo OK', async () => {
    const r = await jsonRequest<{ data: SupplierResp }>(
      env,
      'POST',
      '/',
      { name: 'NCC Sài Gòn', phone: '0901234567' },
      env.base.manager.authHeader,
    )
    expect(r.status).toBe(201)
    expect(r.body.data.phone).toBe('0901234567')
  })

  it('Staff tạo → 403', async () => {
    const r = await jsonRequest<ApiError>(
      env,
      'POST',
      '/',
      { name: 'NCC X' },
      env.base.staff.authHeader,
    )
    expect(r.status).toBe(403)
  })

  it('Tên rỗng → 400 VALIDATION_ERROR', async () => {
    const r = await jsonRequest<ApiError>(env, 'POST', '/', { name: '' }, env.base.owner.authHeader)
    expect(r.status).toBe(400)
  })

  it('Tên trùng (case-insensitive, NCC sống) → 409 field=name', async () => {
    await jsonRequest(env, 'POST', '/', { name: 'NCC ABC' }, env.base.owner.authHeader)
    const r = await jsonRequest<ApiError>(
      env,
      'POST',
      '/',
      { name: 'ncc abc' },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(409)
    expect(r.body.error.details?.field).toBe('name')
  })

  it('SĐT trùng (NCC sống) → 409 field=phone', async () => {
    await jsonRequest(
      env,
      'POST',
      '/',
      { name: 'NCC 1', phone: '0901111111' },
      env.base.owner.authHeader,
    )
    const r = await jsonRequest<ApiError>(
      env,
      'POST',
      '/',
      { name: 'NCC 2', phone: '0901111111' },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(409)
    expect(r.body.error.details?.field).toBe('phone')
  })

  it('audit ghi supplier.created', async () => {
    const r = await jsonRequest<{ data: SupplierResp }>(
      env,
      'POST',
      '/',
      { name: 'NCC Audit' },
      env.base.owner.authHeader,
    )
    const logs = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.targetId, r.body.data.id))
    const created = logs.find((l) => l.action === 'supplier.created')
    expect(created).toBeTruthy()
    expect(created?.actorRole).toBe('owner')
  })
})

describe('GET /suppliers (list)', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
    await jsonRequest(
      env,
      'POST',
      '/',
      { name: 'A Supplier', phone: '0911000001' },
      env.base.owner.authHeader,
    )
    await jsonRequest(
      env,
      'POST',
      '/',
      { name: 'B Supplier', phone: '0911000002' },
      env.base.owner.authHeader,
    )
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Trả flat list với meta pagination', async () => {
    const r = await jsonRequest<{ data: SupplierResp[]; meta: { total: number } }>(
      env,
      'GET',
      '/',
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.meta.total).toBe(2)
    expect(r.body.data.length).toBe(2)
  })

  it('search match name (case-insensitive)', async () => {
    const r = await jsonRequest<{ data: SupplierResp[] }>(
      env,
      'GET',
      '/?search=a%20supplier',
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.length).toBe(1)
    expect(r.body.data[0]?.name).toBe('A Supplier')
  })

  it('GET /trashed mount trước /:id (không nhầm route)', async () => {
    const r = await jsonRequest<{ data: SupplierResp[] }>(
      env,
      'GET',
      '/trashed',
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(Array.isArray(r.body.data)).toBe(true)
  })
})

describe('PATCH /suppliers/:id', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Sửa tên thành công', async () => {
    const created = await jsonRequest<{ data: SupplierResp }>(
      env,
      'POST',
      '/',
      { name: 'Old Name' },
      env.base.owner.authHeader,
    )
    const r = await jsonRequest<{ data: SupplierResp }>(
      env,
      'PATCH',
      `/${created.body.data.id}`,
      { name: 'New Name' },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.name).toBe('New Name')
  })

  it('PATCH rỗng → 400 (yêu cầu ≥1 trường)', async () => {
    const created = await jsonRequest<{ data: SupplierResp }>(
      env,
      'POST',
      '/',
      { name: 'NCC P' },
      env.base.owner.authHeader,
    )
    const r = await jsonRequest<ApiError>(
      env,
      'PATCH',
      `/${created.body.data.id}`,
      {},
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
  })
})

describe('DELETE + Restore /suppliers/:id', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Soft delete + ẩn khỏi list mặc định + hiện trong trashed', async () => {
    const created = await jsonRequest<{ data: SupplierResp }>(
      env,
      'POST',
      '/',
      { name: 'NCC Del' },
      env.base.owner.authHeader,
    )
    const id = created.body.data.id
    const del = await jsonRequest<{ data: SupplierResp }>(
      env,
      'DELETE',
      `/${id}`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(del.status).toBe(200)

    const list = await jsonRequest<{ data: SupplierResp[] }>(
      env,
      'GET',
      '/',
      undefined,
      env.base.owner.authHeader,
    )
    expect(list.body.data.find((s) => s.id === id)).toBeUndefined()

    const trashed = await jsonRequest<{ data: SupplierResp[] }>(
      env,
      'GET',
      '/trashed',
      undefined,
      env.base.owner.authHeader,
    )
    expect(trashed.body.data.find((s) => s.id === id)).toBeTruthy()
  })

  it('Xoá NCC còn công nợ → 422', async () => {
    const created = await jsonRequest<{ data: SupplierResp }>(
      env,
      'POST',
      '/',
      { name: 'NCC Debt' },
      env.base.owner.authHeader,
    )
    await env.base.db
      .update(suppliers)
      .set({ currentDebt: 100_000 })
      .where(eq(suppliers.id, created.body.data.id))
    const r = await jsonRequest<ApiError>(
      env,
      'DELETE',
      `/${created.body.data.id}`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(422)
  })

  it('Xoá NCC đã có phiếu nhập (purchaseCount > 0) → 422', async () => {
    const created = await jsonRequest<{ data: SupplierResp }>(
      env,
      'POST',
      '/',
      { name: 'NCC Có PN' },
      env.base.owner.authHeader,
    )
    // Mô phỏng đã có PO bằng cách bump purchaseCount + giữ debt = 0
    await env.base.db
      .update(suppliers)
      .set({ purchaseCount: 1, totalPurchased: 500_000 })
      .where(eq(suppliers.id, created.body.data.id))
    const r = await jsonRequest<ApiError>(
      env,
      'DELETE',
      `/${created.body.data.id}`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('BUSINESS_RULE_VIOLATION')
  })

  it('Restore khi tên bị NCC khác chiếm → 409', async () => {
    const c1 = await jsonRequest<{ data: SupplierResp }>(
      env,
      'POST',
      '/',
      { name: 'NCC Same' },
      env.base.owner.authHeader,
    )
    await jsonRequest(env, 'DELETE', `/${c1.body.data.id}`, undefined, env.base.owner.authHeader)
    await jsonRequest(env, 'POST', '/', { name: 'NCC Same' }, env.base.owner.authHeader)
    const r = await jsonRequest<ApiError>(
      env,
      'POST',
      `/${c1.body.data.id}/restore`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(409)
  })
})

describe('Multi-tenant safety', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Store A không thấy NCC store B', async () => {
    const { stores: storesSchema, users: usersSchema } = await import('@kiotviet-lite/shared')
    const { hashPassword } = await import('../lib/password.js')
    const { signAccessToken } = await import('../lib/jwt.js')

    const [storeB] = await env.base.db.insert(storesSchema).values({ name: 'Store B' }).returning()
    const [ownerB] = await env.base.db
      .insert(usersSchema)
      .values({
        storeId: storeB!.id,
        name: 'Owner B',
        phone: '0908888888',
        passwordHash: await hashPassword('pwdpwd'),
        pinHash: await hashPassword('888888'),
        role: 'owner',
      })
      .returning()
    const tokenB = signAccessToken({
      userId: ownerB!.id,
      storeId: storeB!.id,
      role: 'owner',
    })
    const authB = { Authorization: `Bearer ${tokenB}` }

    const createdA = await jsonRequest<{ data: SupplierResp }>(
      env,
      'POST',
      '/',
      { name: 'NCC Store A' },
      env.base.owner.authHeader,
    )
    const r = await jsonRequest<ApiError>(env, 'GET', `/${createdA.body.data.id}`, undefined, authB)
    expect(r.status).toBe(404)
  })
})

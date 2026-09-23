import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { stores, users } from '@kiotviet-lite/shared'

import { signAccessToken } from '../lib/jwt.js'
import { hashPassword } from '../lib/password.js'
import { createCustomersRoutes } from '../routes/customers.routes.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.ACCESS_TOKEN_TTL_SECONDS = '900'
  process.env.REFRESH_TOKEN_TTL_SECONDS = '604800'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

interface CustomerResponse {
  id: string
  storeId: string
  name: string
  phone: string
}

interface ApiError {
  error: { code: string; details?: { field?: string } }
}

async function request<T>(
  env: TestEnv,
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
  const res = await createCustomersRoutes({ db: env.db }).request(path, init)
  return { status: res.status, body: (await res.json()) as T }
}

async function create(
  env: TestEnv,
  name: string,
  phone: string,
  authHeader = env.owner.authHeader,
) {
  return request<{ data: CustomerResponse }>(env, 'POST', '/', { name, phone }, authHeader)
}

async function createOtherStoreOwner(env: TestEnv) {
  const [store] = await env.db.insert(stores).values({ name: 'Cửa hàng B' }).returning()
  if (!store) throw new Error('seed store B failed')
  const [owner] = await env.db
    .insert(users)
    .values({
      storeId: store.id,
      name: 'Chủ cửa hàng B',
      phone: '0908888888',
      passwordHash: await hashPassword('matkhau123'),
      pinHash: await hashPassword('888888'),
      role: 'owner',
    })
    .returning()
  if (!owner) throw new Error('seed owner B failed')
  const token = signAccessToken({ userId: owner.id, storeId: store.id, role: 'owner' })
  return { storeId: store.id, authHeader: { Authorization: `Bearer ${token}` } }
}

describe('customers HTTP routes', () => {
  let env: TestEnv

  beforeEach(async () => {
    env = await createTestEnv()
  })

  afterEach(async () => {
    await env.close()
  })

  it('tạo khách hàng với tên và số điện thoại tối thiểu', async () => {
    const result = await create(env, 'Khách hàng A', '0912345678')
    expect(result.status).toBe(201)
    expect(result.body.data).toMatchObject({
      name: 'Khách hàng A',
      phone: '0912345678',
      storeId: env.storeId,
    })

    const read = await request<{ data: CustomerResponse }>(
      env,
      'GET',
      `/${result.body.data.id}`,
      undefined,
      env.owner.authHeader,
    )
    expect(read.status).toBe(200)
    expect(read.body.data.phone).toBe('0912345678')
  })

  it('từ chối tạo khách hàng trùng số điện thoại trong cùng cửa hàng', async () => {
    expect((await create(env, 'Khách hàng A', '0912345678')).status).toBe(201)
    const result = await request<ApiError>(
      env,
      'POST',
      '/',
      { name: 'Khách hàng B', phone: '0912345678' },
      env.owner.authHeader,
    )
    expect(result.status).toBe(409)
    expect(result.body.error.details?.field).toBe('phone')
  })

  it('từ chối sửa số điện thoại thành số của khách hàng khác', async () => {
    const first = await create(env, 'Khách hàng A', '0912345678')
    const second = await create(env, 'Khách hàng B', '0987654321')
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)

    const result = await request<ApiError>(
      env,
      'PATCH',
      `/${second.body.data.id}`,
      { phone: '0912345678' },
      env.owner.authHeader,
    )
    expect(result.status).toBe(409)
    expect(result.body.error.details?.field).toBe('phone')
  })

  it('cho phép sửa tên mà giữ nguyên số điện thoại của chính mình', async () => {
    const created = await create(env, 'Tên cũ', '0912345678')
    expect(created.status).toBe(201)
    const result = await request<{ data: CustomerResponse }>(
      env,
      'PATCH',
      `/${created.body.data.id}`,
      { name: 'Tên mới', phone: '0912345678' },
      env.owner.authHeader,
    )
    expect(result.status).toBe(200)
    expect(result.body.data).toMatchObject({ name: 'Tên mới', phone: '0912345678' })
  })

  it('cho phép hai cửa hàng lưu khách hàng cùng số điện thoại', async () => {
    const other = await createOtherStoreOwner(env)
    const first = await create(env, 'Khách hàng A', '0912345678')
    const second = await create(env, 'Khách hàng B', '0912345678', other.authHeader)
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(first.body.data.storeId).toBe(env.storeId)
    expect(second.body.data.storeId).toBe(other.storeId)
  })

  it('cho phép tạo khách hàng mới với số điện thoại của khách hàng đã xóa mềm', async () => {
    const first = await create(env, 'Khách hàng cũ', '0912345678')
    expect(first.status).toBe(201)
    const removed = await request<{ data: { ok: boolean } }>(
      env,
      'DELETE',
      `/${first.body.data.id}`,
      undefined,
      env.owner.authHeader,
    )
    expect(removed.status).toBe(200)
    const trashed = await request<{ data: CustomerResponse[] }>(
      env,
      'GET',
      '/trashed',
      undefined,
      env.owner.authHeader,
    )
    expect(trashed.status).toBe(200)
    expect(trashed.body.data).toContainEqual(
      expect.objectContaining({ id: first.body.data.id, phone: '0912345678' }),
    )
    const replacement = await create(env, 'Khách hàng mới', '0912345678')
    expect(replacement.status).toBe(201)
    expect(replacement.body.data.id).not.toBe(first.body.data.id)
  })

  it('nhân viên không thể tạo hoặc sửa khách hàng đầy đủ', async () => {
    const created = await create(env, 'Khách hàng A', '0912345678')
    expect(created.status).toBe(201)
    const forbiddenCreate = await request<ApiError>(
      env,
      'POST',
      '/',
      { name: 'Khách hàng B', phone: '0987654321' },
      env.staff.authHeader,
    )
    const forbiddenUpdate = await request<ApiError>(
      env,
      'PATCH',
      `/${created.body.data.id}`,
      { name: 'Tên bị sửa' },
      env.staff.authHeader,
    )
    expect(forbiddenCreate.status).toBe(403)
    expect(forbiddenUpdate.status).toBe(403)
    const unchanged = await request<{ data: CustomerResponse }>(
      env,
      'GET',
      `/${created.body.data.id}`,
      undefined,
      env.owner.authHeader,
    )
    expect(unchanged.body.data.name).toBe('Khách hàng A')
  })

  it('cửa hàng A không thể đọc, sửa hoặc xóa khách hàng của cửa hàng B', async () => {
    const other = await createOtherStoreOwner(env)
    const created = await create(env, 'Khách hàng B', '0912345678', other.authHeader)
    expect(created.status).toBe(201)
    const path = `/${created.body.data.id}`

    const read = await request<ApiError>(env, 'GET', path, undefined, env.owner.authHeader)
    const updated = await request<ApiError>(
      env,
      'PATCH',
      path,
      { name: 'Tên của A' },
      env.owner.authHeader,
    )
    const removed = await request<ApiError>(env, 'DELETE', path, undefined, env.owner.authHeader)
    expect(read.status).toBe(404)
    expect(updated.status).toBe(404)
    expect(removed.status).toBe(404)

    const stillOwnedByB = await request<{ data: CustomerResponse }>(
      env,
      'GET',
      path,
      undefined,
      other.authHeader,
    )
    expect(stillOwnedByB.status).toBe(200)
    expect(stillOwnedByB.body.data).toMatchObject({
      name: 'Khách hàng B',
      storeId: other.storeId,
    })
  })
})

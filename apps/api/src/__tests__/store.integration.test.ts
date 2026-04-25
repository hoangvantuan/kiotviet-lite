import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { auditLogs, stores } from '@kiotviet-lite/shared'

import { createStoreRoutes } from '../routes/store.routes.js'
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
  app: ReturnType<typeof createStoreRoutes>
}

async function setup(): Promise<Env> {
  const base = await createTestEnv()
  const app = createStoreRoutes({ db: base.db })
  return { base, app }
}

// 1x1 PNG hợp lệ (base64 ngắn) dùng cho test logo
const SMALL_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

describe('GET /store', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('mọi role được xem (Owner)', async () => {
    const res = await env.app.request('/', { headers: env.base.owner.authHeader })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { id: string; name: string } }
    expect(body.data.id).toBe(env.base.storeId)
    expect(body.data.name).toBe('Cửa hàng test')
  })

  it('Manager xem được', async () => {
    const res = await env.app.request('/', { headers: env.base.manager.authHeader })
    expect(res.status).toBe(200)
  })

  it('Staff xem được', async () => {
    const res = await env.app.request('/', { headers: env.base.staff.authHeader })
    expect(res.status).toBe(200)
  })

  it('Không có Authorization → 401', async () => {
    const res = await env.app.request('/')
    expect(res.status).toBe(401)
  })
})

describe('PATCH /store', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Owner PATCH store thành công + ghi audit store.updated với diff', async () => {
    const res = await env.app.request('/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...env.base.owner.authHeader },
      body: JSON.stringify({ name: 'Cửa hàng đổi tên', address: '123 Lê Lợi' }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { name: string; address: string | null } }
    expect(body.data.name).toBe('Cửa hàng đổi tên')
    expect(body.data.address).toBe('123 Lê Lợi')

    const dbStore = await env.base.db.query.stores.findFirst({
      where: eq(stores.id, env.base.storeId),
    })
    expect(dbStore?.name).toBe('Cửa hàng đổi tên')

    const logs = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'store.updated'))
    expect(logs.length).toBe(1)
    const changes = logs[0]?.changes as Record<string, { before: unknown; after: unknown }>
    expect(changes.name?.after).toBe('Cửa hàng đổi tên')
  })

  it('Manager PATCH store → 403', async () => {
    const res = await env.app.request('/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...env.base.manager.authHeader },
      body: JSON.stringify({ name: 'X' }),
    })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('FORBIDDEN')
  })

  it('Staff PATCH store → 403', async () => {
    const res = await env.app.request('/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...env.base.staff.authHeader },
      body: JSON.stringify({ name: 'X' }),
    })
    expect(res.status).toBe(403)
  })

  it('Không có field → 400 (refine fail)', async () => {
    const res = await env.app.request('/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...env.base.owner.authHeader },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })

  it('Logo PNG hợp lệ → lưu được', async () => {
    const res = await env.app.request('/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...env.base.owner.authHeader },
      body: JSON.stringify({ logoUrl: SMALL_PNG_DATA_URL }),
    })
    expect(res.status).toBe(200)
  })

  it('Logo định dạng không hỗ trợ (gif) → 400', async () => {
    const res = await env.app.request('/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...env.base.owner.authHeader },
      body: JSON.stringify({ logoUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }),
    })
    expect(res.status).toBe(400)
  })

  it('Logo base64 vượt 2MB → 400', async () => {
    // Tạo base64 ~3MB (4MB ký tự base64 ≈ 3MB raw)
    const bigBase64 = 'A'.repeat(4 * 1024 * 1024)
    const dataUrl = `data:image/png;base64,${bigBase64}`
    const res = await env.app.request('/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...env.base.owner.authHeader },
      body: JSON.stringify({ logoUrl: dataUrl }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as {
      error: { code: string; message: string; details?: Array<{ message: string }> }
    }
    expect(body.error.code).toBe('VALIDATION_ERROR')
    const has2MB =
      body.error.message.includes('2MB') ||
      body.error.details?.some((d) => d.message.includes('2MB'))
    expect(has2MB).toBe(true)
  })

  it('Phone sai format → 400', async () => {
    const res = await env.app.request('/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...env.base.owner.authHeader },
      body: JSON.stringify({ phone: 'abc' }),
    })
    expect(res.status).toBe(400)
  })
})

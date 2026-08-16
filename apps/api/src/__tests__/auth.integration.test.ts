import { PGlite } from '@electric-sql/pglite'
import { drizzle as pgliteDrizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import * as schema from '@kiotviet-lite/shared/schema'

import type { Db } from '../db/index.js'
import { createAuthRoutes } from '../routes/auth.routes.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(__dirname, '../db/migrations')

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.ACCESS_TOKEN_TTL_SECONDS = '900'
  process.env.REFRESH_TOKEN_TTL_SECONDS = '604800'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

interface TestEnv {
  pglite: PGlite
  app: ReturnType<typeof createAuthRoutes>
}

async function setup(): Promise<TestEnv> {
  const pglite = new PGlite()
  const drizzleDb = pgliteDrizzle(pglite, { schema, casing: 'snake_case' })
  await migrate(drizzleDb, { migrationsFolder })
  const app = createAuthRoutes({ db: drizzleDb as unknown as Db })
  return { pglite, app }
}

const validRegister = {
  storeName: 'Cửa hàng test',
  ownerName: 'Nguyễn Văn A',
  phone: '0901234567',
  password: 'matkhau123',
}

/**
 * Rate limiter (3 register/giờ/IP, 5 login/phút/IP) giữ state ở module scope,
 * không reset giữa các test. Request trong test không có header IP nên tất cả
 * dùng chung key 'unknown' và test sau bị 429. Cấp cho mỗi request một IP riêng
 * để rate limit không nhiễu vào thứ đang được kiểm tra.
 */
let ipCounter = 0

async function request(
  app: TestEnv['app'],
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  ipCounter += 1
  return app.request(path, {
    ...init,
    headers: {
      ...((init.headers as Record<string, string> | undefined) ?? {}),
      'x-forwarded-for': `10.0.0.${ipCounter}`,
    },
  })
}

describe('POST /register', () => {
  let env: TestEnv

  beforeEach(async () => {
    env = await setup()
  })

  afterEach(async () => {
    await env.pglite.close()
  })

  it('tạo store + user và trả access token + cookie refresh', async () => {
    const res = await request(env.app, '/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validRegister),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      data: { user: { phone: string; role: string }; accessToken: string }
    }
    expect(body.data.user.phone).toBe('0901234567')
    expect(body.data.user.role).toBe('owner')
    expect(body.data.accessToken).toBeTruthy()
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('kvl_refresh=')
    expect(cookie.toLowerCase()).toContain('httponly')
  })

  it('phone trùng trả CONFLICT với field=phone', async () => {
    await request(env.app, '/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validRegister),
    })
    const res = await request(env.app, '/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validRegister),
    })
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: { code: string; details?: { field?: string } } }
    expect(body.error.code).toBe('CONFLICT')
    expect(body.error.details?.field).toBe('phone')
  })

  it('phone sai format trả VALIDATION_ERROR', async () => {
    const res = await request(env.app, '/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validRegister, phone: 'abc' }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('POST /login', () => {
  let env: TestEnv

  beforeEach(async () => {
    env = await setup()
    await request(env.app, '/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validRegister),
    })
  })

  afterEach(async () => {
    await env.pglite.close()
  })

  it('mật khẩu đúng trả 200 + access token', async () => {
    const res = await request(env.app, '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: validRegister.phone, password: validRegister.password }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { accessToken: string } }
    expect(body.data.accessToken).toBeTruthy()
  })

  it('mật khẩu sai trả 401', async () => {
    const res = await request(env.app, '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: validRegister.phone, password: 'saimk123' }),
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('phone không tồn tại trả 401 (không leak)', async () => {
    const res = await request(env.app, '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '0907777777', password: 'matkhau123' }),
    })
    expect(res.status).toBe(401)
  })
})

describe('POST /refresh + /logout', () => {
  let env: TestEnv

  beforeEach(async () => {
    env = await setup()
  })

  afterEach(async () => {
    await env.pglite.close()
  })

  it('refresh rotate token: token cũ bị thu hồi, token mới hoạt động', async () => {
    const reg = await request(env.app, '/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validRegister),
    })
    const oldCookie = extractRefreshCookie(reg.headers.get('set-cookie'))
    expect(oldCookie).toBeTruthy()

    const r1 = await request(env.app, '/refresh', {
      method: 'POST',
      headers: { Cookie: `kvl_refresh=${oldCookie}` },
    })
    expect(r1.status).toBe(200)
    const newCookie = extractRefreshCookie(r1.headers.get('set-cookie'))
    expect(newCookie).toBeTruthy()
    expect(newCookie).not.toBe(oldCookie)

    // Token mới hoạt động. Phải kiểm tra TRƯỚC khi dùng lại token cũ, vì
    // rotateRefreshToken có reuse detection: phát hiện token đã thu hồi được
    // dùng lại thì thu hồi toàn bộ token family của user.
    const r2 = await request(env.app, '/refresh', {
      method: 'POST',
      headers: { Cookie: `kvl_refresh=${newCookie}` },
    })
    expect(r2.status).toBe(200)

    // Token cũ đã bị thu hồi → 401, đồng thời kích hoạt reuse detection.
    const r3 = await request(env.app, '/refresh', {
      method: 'POST',
      headers: { Cookie: `kvl_refresh=${oldCookie}` },
    })
    expect(r3.status).toBe(401)

    // Sau reuse detection, token của lần rotate cuối cũng mất hiệu lực.
    const latestCookie = extractRefreshCookie(r2.headers.get('set-cookie'))
    const r4 = await request(env.app, '/refresh', {
      method: 'POST',
      headers: { Cookie: `kvl_refresh=${latestCookie}` },
    })
    expect(r4.status).toBe(401)
  })

  it('refresh không có cookie trả 401', async () => {
    const res = await request(env.app, '/refresh', { method: 'POST' })
    expect(res.status).toBe(401)
  })

  it('logout xoá cookie và làm refresh token mất hiệu lực', async () => {
    const reg = await request(env.app, '/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validRegister),
    })
    const cookie = extractRefreshCookie(reg.headers.get('set-cookie'))
    const out = await request(env.app, '/logout', {
      method: 'POST',
      headers: { Cookie: `kvl_refresh=${cookie}` },
    })
    expect(out.status).toBe(204)

    const after = await request(env.app, '/refresh', {
      method: 'POST',
      headers: { Cookie: `kvl_refresh=${cookie}` },
    })
    expect(after.status).toBe(401)
  })
})

function extractRefreshCookie(setCookieHeader: string | null): string {
  if (!setCookieHeader) return ''
  const match = setCookieHeader.match(/kvl_refresh=([^;]+)/)
  return match?.[1] ?? ''
}

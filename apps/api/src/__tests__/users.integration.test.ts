import { and, eq, isNull } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { auditLogs, refreshTokens, users } from '@kiotviet-lite/shared'

import { createUsersRoutes } from '../routes/users.routes.js'
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
  app: ReturnType<typeof createUsersRoutes>
}

async function setup(): Promise<Env> {
  const base = await createTestEnv()
  const app = createUsersRoutes({ db: base.db })
  return { base, app }
}

const validNewUser = {
  name: 'Nhân viên mới',
  phone: '0904444444',
  role: 'staff' as const,
  pin: '654321',
}

describe('POST /users (createUser)', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Owner tạo NV thành công, response không leak pinHash/passwordHash', async () => {
    const res = await env.app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...env.base.owner.authHeader },
      body: JSON.stringify(validNewUser),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data.name).toBe(validNewUser.name)
    expect(body.data.phone).toBe(validNewUser.phone)
    expect(body.data.role).toBe('staff')
    expect(body.data.isActive).toBe(true)
    expect(body.data).not.toHaveProperty('pinHash')
    expect(body.data).not.toHaveProperty('passwordHash')
    expect(body.data).not.toHaveProperty('failedPinAttempts')
    expect(body.data).not.toHaveProperty('pinLockedUntil')

    // DB lưu PIN dưới dạng hash, không plaintext
    const created = await env.base.db.query.users.findFirst({
      where: eq(users.id, body.data.id as string),
    })
    expect(created?.pinHash).toBeTruthy()
    expect(created?.pinHash).not.toBe(validNewUser.pin)
  })

  it('Manager gọi POST /users → 403', async () => {
    const res = await env.app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...env.base.manager.authHeader },
      body: JSON.stringify(validNewUser),
    })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('FORBIDDEN')
  })

  it('Staff gọi POST /users → 403', async () => {
    const res = await env.app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...env.base.staff.authHeader },
      body: JSON.stringify(validNewUser),
    })
    expect(res.status).toBe(403)
  })

  it('không có Authorization header → 401', async () => {
    const res = await env.app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validNewUser),
    })
    expect(res.status).toBe(401)
  })

  it('tạo NV trùng phone trong store → 409 với field=phone', async () => {
    // owner đã có phone 0901111111 trong seed
    const res = await env.app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...env.base.owner.authHeader },
      body: JSON.stringify({ ...validNewUser, phone: '0901111111' }),
    })
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: { code: string; details?: { field?: string } } }
    expect(body.error.code).toBe('CONFLICT')
    expect(body.error.details?.field).toBe('phone')
  })

  it('phone sai format → 400 VALIDATION_ERROR', async () => {
    const res = await env.app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...env.base.owner.authHeader },
      body: JSON.stringify({ ...validNewUser, phone: 'abc' }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('PIN không đủ 6 số → 400 VALIDATION_ERROR', async () => {
    const res = await env.app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...env.base.owner.authHeader },
      body: JSON.stringify({ ...validNewUser, pin: '12' }),
    })
    expect(res.status).toBe(400)
  })
})

describe('GET /users (listUsers)', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Owner xem list, không có pinHash/passwordHash', async () => {
    const res = await env.app.request('/', { headers: env.base.owner.authHeader })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Array<Record<string, unknown>> }
    expect(body.data.length).toBe(3)
    for (const u of body.data) {
      expect(u).not.toHaveProperty('pinHash')
      expect(u).not.toHaveProperty('passwordHash')
    }
  })

  it('Manager → 403', async () => {
    const res = await env.app.request('/', { headers: env.base.manager.authHeader })
    expect(res.status).toBe(403)
  })

  it('Staff → 403', async () => {
    const res = await env.app.request('/', { headers: env.base.staff.authHeader })
    expect(res.status).toBe(403)
  })
})

describe('PATCH /users/:id (updateUser)', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Owner sửa role chính mình từ owner → manager → 422', async () => {
    const res = await env.app.request(`/${env.base.owner.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...env.base.owner.authHeader },
      body: JSON.stringify({ role: 'manager' }),
    })
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('BUSINESS_RULE_VIOLATION')
    expect(body.error.message).toContain('Owner không thể tự hạ vai trò')
  })

  it('Owner sửa role NV khác (manager → staff) thành công', async () => {
    const res = await env.app.request(`/${env.base.manager.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...env.base.owner.authHeader },
      body: JSON.stringify({ role: 'staff' }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { role: string } }
    expect(body.data.role).toBe('staff')
  })

  it('Owner đổi tên NV thành công, ghi audit user.updated', async () => {
    const res = await env.app.request(`/${env.base.staff.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...env.base.owner.authHeader },
      body: JSON.stringify({ name: 'Tên mới của staff' }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { name: string } }
    expect(body.data.name).toBe('Tên mới của staff')

    const logs = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'user.updated'))
    expect(logs.length).toBeGreaterThan(0)
  })

  it('Owner reset PIN cho NV → ghi audit user.pin_reset, không log PIN plaintext', async () => {
    const res = await env.app.request(`/${env.base.staff.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...env.base.owner.authHeader },
      body: JSON.stringify({ pin: '999999' }),
    })
    expect(res.status).toBe(200)

    const logs = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'user.pin_reset'))
    expect(logs.length).toBe(1)
    const changes = JSON.stringify(logs[0]?.changes)
    expect(changes).toContain('reset')
    expect(changes).not.toContain('999999')
  })

  it('Manager PATCH /users/:id → 403', async () => {
    const res = await env.app.request(`/${env.base.staff.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...env.base.manager.authHeader },
      body: JSON.stringify({ name: 'X' }),
    })
    expect(res.status).toBe(403)
  })

  it('PATCH user thuộc store khác → 404 (multi-tenant safety)', async () => {
    // Tạo store + user khác
    const otherEnv = await createTestEnv()
    const otherUserId = otherEnv.staff.id

    const res = await env.app.request(`/${otherUserId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...env.base.owner.authHeader },
      body: JSON.stringify({ name: 'Hack' }),
    })
    expect(res.status).toBe(404)
    await otherEnv.close()
  })
})

describe('POST /users/:id/lock + unlock', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Owner khoá NV → isActive=false + tất cả refresh tokens revoked', async () => {
    // Phát hành 2 refresh token cho staff
    await env.base.issueRefreshToken(env.base.staff.id)
    await env.base.issueRefreshToken(env.base.staff.id)

    const res = await env.app.request(`/${env.base.staff.id}/lock`, {
      method: 'POST',
      headers: env.base.owner.authHeader,
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { isActive: boolean } }
    expect(body.data.isActive).toBe(false)

    const dbUser = await env.base.db.query.users.findFirst({
      where: eq(users.id, env.base.staff.id),
    })
    expect(dbUser?.isActive).toBe(false)

    const activeTokens = await env.base.db
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.userId, env.base.staff.id), isNull(refreshTokens.revokedAt)))
    expect(activeTokens.length).toBe(0)
  })

  it('Owner khoá chính mình → 422', async () => {
    const res = await env.app.request(`/${env.base.owner.id}/lock`, {
      method: 'POST',
      headers: env.base.owner.authHeader,
    })
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('BUSINESS_RULE_VIOLATION')
    expect(body.error.message).toContain('tự khoá')
  })

  it('Manager khoá NV → 403', async () => {
    const res = await env.app.request(`/${env.base.staff.id}/lock`, {
      method: 'POST',
      headers: env.base.manager.authHeader,
    })
    expect(res.status).toBe(403)
  })

  it('Owner mở khoá NV → reset failedPinAttempts + pinLockedUntil', async () => {
    // Set staff bị khoá PIN trước
    await env.base.db
      .update(users)
      .set({
        isActive: false,
        failedPinAttempts: 5,
        pinLockedUntil: new Date(Date.now() + 1_000_000),
      })
      .where(eq(users.id, env.base.staff.id))

    const res = await env.app.request(`/${env.base.staff.id}/unlock`, {
      method: 'POST',
      headers: env.base.owner.authHeader,
    })
    expect(res.status).toBe(200)

    const after = await env.base.db.query.users.findFirst({
      where: eq(users.id, env.base.staff.id),
    })
    expect(after?.isActive).toBe(true)
    expect(after?.failedPinAttempts).toBe(0)
    expect(after?.pinLockedUntil).toBeNull()
  })

  it('PATCH /:id với isActive=false trên chính mình → 422', async () => {
    const res = await env.app.request(`/${env.base.owner.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...env.base.owner.authHeader },
      body: JSON.stringify({ isActive: false }),
    })
    expect(res.status).toBe(422)
  })
})

describe('POST /users/verify-pin (AC4)', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('PIN đúng → 200 { ok: true } + reset failedPinAttempts', async () => {
    // Set vài lần sai trước
    await env.base.db
      .update(users)
      .set({ failedPinAttempts: 2 })
      .where(eq(users.id, env.base.staff.id))

    const res = await env.app.request('/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...env.base.staff.authHeader },
      body: JSON.stringify({ pin: env.base.staff.pin }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { ok: boolean } }
    expect(body.data.ok).toBe(true)

    const after = await env.base.db.query.users.findFirst({
      where: eq(users.id, env.base.staff.id),
    })
    expect(after?.failedPinAttempts).toBe(0)
    expect(after?.pinLockedUntil).toBeNull()
  })

  it('PIN sai 1 lần → 401 với details.remaining = 4', async () => {
    const res = await env.app.request('/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...env.base.staff.authHeader },
      body: JSON.stringify({ pin: '000000' }),
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: { code: string; details?: { remaining?: number } } }
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(body.error.details?.remaining).toBe(4)
  })

  it('PIN sai 5 lần liên tiếp → khoá 15 phút, lần thứ 5 trả 422', async () => {
    let lastStatus = 0
    for (let i = 1; i <= 5; i++) {
      const r = await env.app.request('/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...env.base.staff.authHeader },
        body: JSON.stringify({ pin: '000000' }),
      })
      lastStatus = r.status
    }
    expect(lastStatus).toBe(422)

    const after = await env.base.db.query.users.findFirst({
      where: eq(users.id, env.base.staff.id),
    })
    expect(after?.failedPinAttempts).toBe(5)
    expect(after?.pinLockedUntil).not.toBeNull()
    expect(after?.pinLockedUntil!.getTime()).toBeGreaterThan(Date.now() + 14 * 60 * 1000)
  })

  it('Đang lock → request mới trả 422 dù PIN đúng', async () => {
    await env.base.db
      .update(users)
      .set({
        failedPinAttempts: 5,
        pinLockedUntil: new Date(Date.now() + 10 * 60 * 1000),
      })
      .where(eq(users.id, env.base.staff.id))

    const res = await env.app.request('/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...env.base.staff.authHeader },
      body: JSON.stringify({ pin: env.base.staff.pin }),
    })
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('BUSINESS_RULE_VIOLATION')
  })

  it('Lock đã hết hạn → cho phép thử lại (lazy reset)', async () => {
    await env.base.db
      .update(users)
      .set({
        failedPinAttempts: 5,
        pinLockedUntil: new Date(Date.now() - 1000),
      })
      .where(eq(users.id, env.base.staff.id))

    const res = await env.app.request('/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...env.base.staff.authHeader },
      body: JSON.stringify({ pin: env.base.staff.pin }),
    })
    expect(res.status).toBe(200)
  })

  it('PIN không đủ 6 số → 400 VALIDATION_ERROR', async () => {
    const res = await env.app.request('/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...env.base.staff.authHeader },
      body: JSON.stringify({ pin: '12' }),
    })
    expect(res.status).toBe(400)
  })

  it('Không có Authorization → 401', async () => {
    const res = await env.app.request('/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '111111' }),
    })
    expect(res.status).toBe(401)
  })
})

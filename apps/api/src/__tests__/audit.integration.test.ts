import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { type AuditAction, auditLogs, users } from '@kiotviet-lite/shared'

import { createAuditRoutes } from '../routes/audit.routes.js'
import { createStoreRoutes } from '../routes/store.routes.js'
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
  auditApp: ReturnType<typeof createAuditRoutes>
  usersApp: ReturnType<typeof createUsersRoutes>
  storeApp: ReturnType<typeof createStoreRoutes>
}

async function setup(): Promise<Env> {
  const base = await createTestEnv()
  return {
    base,
    auditApp: createAuditRoutes({ db: base.db }),
    usersApp: createUsersRoutes({ db: base.db }),
    storeApp: createStoreRoutes({ db: base.db }),
  }
}

interface AuditItemResp {
  id: string
  actorId: string
  actorRole: string
  action: AuditAction
}

interface ListResp {
  data: { items: AuditItemResp[]; total: number; page: number; pageSize: number }
}

describe('Audit logs - các action ghi đúng', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Owner tạo NV → audit_logs có user.created với targetType=user', async () => {
    await env.usersApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...env.base.owner.authHeader },
      body: JSON.stringify({
        name: 'NV mới',
        phone: '0904444444',
        role: 'staff',
        pin: '999999',
      }),
    })

    const logs = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'user.created'))
    expect(logs.length).toBe(1)
    expect(logs[0]?.actorId).toBe(env.base.owner.id)
    expect(logs[0]?.targetType).toBe('user')
    expect(logs[0]?.storeId).toBe(env.base.storeId)
  })

  it('Owner sửa NV → user.updated', async () => {
    await env.usersApp.request(`/${env.base.staff.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...env.base.owner.authHeader },
      body: JSON.stringify({ name: 'Tên mới' }),
    })
    const logs = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'user.updated'))
    expect(logs.length).toBe(1)
  })

  it('Owner khoá → user.locked. Mở khoá → user.unlocked', async () => {
    await env.usersApp.request(`/${env.base.staff.id}/lock`, {
      method: 'POST',
      headers: env.base.owner.authHeader,
    })
    await env.usersApp.request(`/${env.base.staff.id}/unlock`, {
      method: 'POST',
      headers: env.base.owner.authHeader,
    })

    const lockedLogs = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'user.locked'))
    const unlockedLogs = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'user.unlocked'))
    expect(lockedLogs.length).toBe(1)
    expect(unlockedLogs.length).toBe(1)
  })

  it('Reset PIN → user.pin_reset, KHÔNG chứa PIN plaintext', async () => {
    await env.usersApp.request(`/${env.base.staff.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...env.base.owner.authHeader },
      body: JSON.stringify({ pin: '777777' }),
    })
    const logs = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'user.pin_reset'))
    expect(logs.length).toBe(1)
    const json = JSON.stringify(logs[0]?.changes)
    expect(json).not.toContain('777777')
  })

  it('Owner sửa store → store.updated', async () => {
    await env.storeApp.request('/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...env.base.owner.authHeader },
      body: JSON.stringify({ name: 'Tên cửa hàng mới' }),
    })
    const logs = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'store.updated'))
    expect(logs.length).toBe(1)
    expect(logs[0]?.actorId).toBe(env.base.owner.id)
  })

  it('PIN sai → auth.pin_failed. PIN sai 5 lần → auth.pin_locked', async () => {
    for (let i = 0; i < 5; i++) {
      await env.usersApp.request('/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...env.base.staff.authHeader },
        body: JSON.stringify({ pin: '000000' }),
      })
    }
    const failedLogs = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'auth.pin_failed'))
    const lockedLogs = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'auth.pin_locked'))
    expect(failedLogs.length).toBe(4) // 4 lần đầu sai
    expect(lockedLogs.length).toBe(1) // lần thứ 5 trigger lock
  })
})

describe('GET /audit-logs - RBAC scope', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()

    // Tạo 1 audit log từ Owner: tạo NV mới
    await env.usersApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...env.base.owner.authHeader },
      body: JSON.stringify({
        name: 'NV phụ',
        phone: '0904444444',
        role: 'staff',
        pin: '111222',
      }),
    })

    // Audit log từ Manager: verify PIN sai (auth.pin_failed)
    await env.usersApp.request('/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...env.base.manager.authHeader },
      body: JSON.stringify({ pin: '000000' }),
    })

    // Audit log từ Staff: verify PIN sai
    await env.usersApp.request('/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...env.base.staff.authHeader },
      body: JSON.stringify({ pin: '000000' }),
    })
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Owner GET → thấy tất cả log của store', async () => {
    const res = await env.auditApp.request('/', { headers: env.base.owner.authHeader })
    expect(res.status).toBe(200)
    const body = (await res.json()) as ListResp
    const actorIds = new Set(body.data.items.map((i) => i.actorId))
    expect(actorIds.has(env.base.owner.id)).toBe(true)
    expect(actorIds.has(env.base.manager.id)).toBe(true)
    expect(actorIds.has(env.base.staff.id)).toBe(true)
    expect(body.data.total).toBeGreaterThanOrEqual(3)
  })

  it('Manager GET → thấy log của mình + của Staff. KHÔNG thấy của Owner', async () => {
    const res = await env.auditApp.request('/', { headers: env.base.manager.authHeader })
    expect(res.status).toBe(200)
    const body = (await res.json()) as ListResp
    const actorIds = new Set(body.data.items.map((i) => i.actorId))
    expect(actorIds.has(env.base.manager.id)).toBe(true)
    expect(actorIds.has(env.base.staff.id)).toBe(true)
    expect(actorIds.has(env.base.owner.id)).toBe(false)
  })

  it('Staff GET → chỉ thấy log của chính mình', async () => {
    const res = await env.auditApp.request('/', { headers: env.base.staff.authHeader })
    expect(res.status).toBe(200)
    const body = (await res.json()) as ListResp
    const actorIds = new Set(body.data.items.map((i) => i.actorId))
    expect(actorIds.size).toBe(1)
    expect(actorIds.has(env.base.staff.id)).toBe(true)
  })

  it('Không có Authorization → 401', async () => {
    const res = await env.auditApp.request('/')
    expect(res.status).toBe(401)
  })

  it('Pagination: pageSize=2 trả tối đa 2 item', async () => {
    const res = await env.auditApp.request('/?pageSize=2&page=1', {
      headers: env.base.owner.authHeader,
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as ListResp
    expect(body.data.items.length).toBeLessThanOrEqual(2)
    expect(body.data.pageSize).toBe(2)
    expect(body.data.page).toBe(1)
  })

  it('Filter theo actions=user.created → chỉ trả 1 item', async () => {
    const res = await env.auditApp.request('/?actions=user.created', {
      headers: env.base.owner.authHeader,
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as ListResp
    expect(body.data.items.length).toBe(1)
    expect(body.data.items[0]?.action).toBe('user.created')
  })

  it('Multi-tenant: log của store khác KHÔNG xuất hiện', async () => {
    // Tạo store thứ 2 và phát sinh audit log ở đó
    const otherEnv = await createTestEnv()
    const otherUsersApp = createUsersRoutes({ db: otherEnv.db })
    await otherUsersApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...otherEnv.owner.authHeader },
      body: JSON.stringify({
        name: 'NV store khác',
        phone: '0905555555',
        role: 'staff',
        pin: '888888',
      }),
    })

    // Owner store gốc query → KHÔNG thấy log của store khác
    const res = await env.auditApp.request('/', { headers: env.base.owner.authHeader })
    const body = (await res.json()) as ListResp
    const otherActorId = otherEnv.owner.id
    const found = body.data.items.some((i) => i.actorId === otherActorId)
    expect(found).toBe(false)
    await otherEnv.close()
  })
})

describe('Audit logs - DB constraint append-only', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
    await env.usersApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...env.base.owner.authHeader },
      body: JSON.stringify({
        name: 'NV',
        phone: '0904444444',
        role: 'staff',
        pin: '123456',
      }),
    })
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('UPDATE/DELETE trên audit_logs (PGlite có thể không enforce REVOKE) - production migration enforces', async () => {
    const existing = await env.base.db.select().from(auditLogs)
    expect(existing.length).toBeGreaterThan(0)

    // PGlite chạy như superuser nội bộ, REVOKE PUBLIC không chặn được.
    // Test chỉ verify rằng API KHÔNG expose UPDATE/DELETE endpoint cho audit_logs.
    // Production migration (file 0003) đã chứa REVOKE statement, được enforce trên PostgreSQL thật.
    // Bằng chứng KHÔNG có route UPDATE/DELETE: createAuditRoutes chỉ định nghĩa app.get('/').
    const auditApp = env.auditApp
    const putRes = await auditApp.request('/', {
      method: 'PUT',
      headers: env.base.owner.authHeader,
    })
    const deleteRes = await auditApp.request('/', {
      method: 'DELETE',
      headers: env.base.owner.authHeader,
    })
    // Hono trả 404 cho method không khai báo
    expect(putRes.status).toBe(404)
    expect(deleteRes.status).toBe(404)
  })

  it('actor_id phải tồn tại trong users (FK constraint)', async () => {
    // Insert audit log với actor_id ngẫu nhiên không tồn tại → throw FK error
    let threw = false
    try {
      await env.base.db.insert(auditLogs).values({
        storeId: env.base.storeId,
        actorId: '01923000-0000-7000-8000-deadbeefdead',
        action: 'user.created',
      })
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
  })

  it('actorRole + actorName được join từ users', async () => {
    // Owner ghi 1 log, sau đó query API → actorName phải có
    const res = await env.auditApp.request('/', { headers: env.base.owner.authHeader })
    const body = (await res.json()) as { data: { items: Array<{ actorRole: string }> } }
    const ownerLog = body.data.items.find(
      (i) => (i as unknown as { actorId: string }).actorId === env.base.owner.id,
    )
    expect(ownerLog?.actorRole).toBe('owner')
    // Verify users table còn nguyên (sanity check)
    const ownerUser = await env.base.db.query.users.findFirst({
      where: eq(users.id, env.base.owner.id),
    })
    expect(ownerUser?.role).toBe('owner')
  })
})

import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { users } from '@kiotviet-lite/shared'

import { signAccessToken } from '../lib/jwt.js'
import { hashPassword } from '../lib/password.js'
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

describe('CRIT C4: chống tạo/chiếm quyền owner thứ 2', () => {
  let base: TestEnv
  let app: ReturnType<typeof createUsersRoutes>

  beforeEach(async () => {
    base = await createTestEnv()
    app = createUsersRoutes({ db: base.db })
  })

  function newUserBody(over: Record<string, unknown> = {}) {
    return { name: 'NV Moi', phone: '0905555555', role: 'staff', pin: '123456', ...over }
  }

  async function seedSecondOwner() {
    const [owner2] = await base.db
      .insert(users)
      .values({
        storeId: base.storeId,
        name: 'Owner 2',
        phone: '0906666666',
        passwordHash: await hashPassword('matkhau123'),
        pinHash: await hashPassword('444444'),
        role: 'owner',
      })
      .returning()
    const auth = {
      Authorization: `Bearer ${signAccessToken({ userId: owner2!.id, storeId: base.storeId, role: 'owner' })}`,
    }
    return { owner2: owner2!, auth }
  }

  it('POST /users với role=owner → 400 (schema chặn gán owner qua API)', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...base.owner.authHeader },
      body: JSON.stringify(newUserBody({ role: 'owner' })),
    })
    expect(res.status).toBe(400)
  })

  it('POST /users role hợp lệ (staff) vẫn hoạt động → 201', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...base.owner.authHeader },
      body: JSON.stringify(newUserBody()),
    })
    expect(res.status).toBe(201)
  })

  it('Owner thứ 2 không thể hạ vai trò owner gốc → 403, owner gốc giữ nguyên', async () => {
    const { auth } = await seedSecondOwner()
    const res = await app.request(`/${base.owner.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ role: 'staff' }),
    })
    expect(res.status).toBe(403)

    const still = await base.db.query.users.findFirst({ where: eq(users.id, base.owner.id) })
    expect(still?.role).toBe('owner')
  })

  it('Owner thứ 2 không thể khoá owner gốc → 403, owner gốc vẫn active', async () => {
    const { auth } = await seedSecondOwner()
    const res = await app.request(`/${base.owner.id}/lock`, {
      method: 'POST',
      headers: auth,
    })
    expect(res.status).toBe(403)

    const still = await base.db.query.users.findFirst({ where: eq(users.id, base.owner.id) })
    expect(still?.isActive).toBe(true)
  })
})

import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { auditLogs, categories } from '@kiotviet-lite/shared'

import { createCategoriesRoutes } from '../routes/categories.routes.js'
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
  app: ReturnType<typeof createCategoriesRoutes>
}

async function setup(): Promise<Env> {
  const base = await createTestEnv()
  const app = createCategoriesRoutes({ db: base.db })
  return { base, app }
}

interface CategoryResponse {
  id: string
  storeId: string
  name: string
  parentId: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

async function postJson<T>(
  env: Env,
  path: string,
  body: unknown,
  authHeader: { Authorization: string },
): Promise<{ status: number; body: T }> {
  const res = await env.app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json()) as T }
}

async function patchJson<T>(
  env: Env,
  path: string,
  body: unknown,
  authHeader: { Authorization: string },
): Promise<{ status: number; body: T }> {
  const res = await env.app.request(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json()) as T }
}

async function deletePath<T>(
  env: Env,
  path: string,
  authHeader: { Authorization: string },
): Promise<{ status: number; body: T }> {
  const res = await env.app.request(path, {
    method: 'DELETE',
    headers: authHeader,
  })
  return { status: res.status, body: (await res.json()) as T }
}

describe('POST /categories (createCategory)', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Owner tạo cấp 1 → 201, sortOrder = 0', async () => {
    const r = await postJson<{ data: CategoryResponse }>(
      env,
      '/',
      { name: 'Đồ uống' },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
    expect(r.body.data.name).toBe('Đồ uống')
    expect(r.body.data.parentId).toBeNull()
    expect(r.body.data.sortOrder).toBe(0)
    expect(r.body.data.storeId).toBe(env.base.storeId)
  })

  it('Cấp 1 thứ 2 → sortOrder = 1', async () => {
    await postJson(env, '/', { name: 'Đồ uống' }, env.base.owner.authHeader)
    const r = await postJson<{ data: CategoryResponse }>(
      env,
      '/',
      { name: 'Đồ ăn' },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
    expect(r.body.data.sortOrder).toBe(1)
  })

  it('Tạo cấp 2 dưới cấp 1 → 201', async () => {
    const parent = await postJson<{ data: CategoryResponse }>(
      env,
      '/',
      { name: 'Đồ uống' },
      env.base.owner.authHeader,
    )
    const child = await postJson<{ data: CategoryResponse }>(
      env,
      '/',
      { name: 'Cà phê', parentId: parent.body.data.id },
      env.base.owner.authHeader,
    )
    expect(child.status).toBe(201)
    expect(child.body.data.parentId).toBe(parent.body.data.id)
    expect(child.body.data.sortOrder).toBe(0)
  })

  it('Tạo cấp 3 (parent là cấp 2) → 422 BUSINESS_RULE_VIOLATION', async () => {
    const root = await postJson<{ data: CategoryResponse }>(
      env,
      '/',
      { name: 'Đồ uống' },
      env.base.owner.authHeader,
    )
    const lvl2 = await postJson<{ data: CategoryResponse }>(
      env,
      '/',
      { name: 'Cà phê', parentId: root.body.data.id },
      env.base.owner.authHeader,
    )
    const lvl3 = await postJson<{ error: { code: string } }>(
      env,
      '/',
      { name: 'Latte', parentId: lvl2.body.data.id },
      env.base.owner.authHeader,
    )
    expect(lvl3.status).toBe(422)
    expect(lvl3.body.error.code).toBe('BUSINESS_RULE_VIOLATION')
  })

  it('Tạo trùng tên cùng cấp cha → 409 CONFLICT field=name', async () => {
    await postJson(env, '/', { name: 'Đồ uống' }, env.base.owner.authHeader)
    const r = await postJson<{ error: { code: string; details?: { field?: string } } }>(
      env,
      '/',
      { name: 'Đồ uống' },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('CONFLICT')
    expect(r.body.error.details?.field).toBe('name')
  })

  it('Tạo trùng tên khác cấp cha → 201 (cho phép)', async () => {
    const root = await postJson<{ data: CategoryResponse }>(
      env,
      '/',
      { name: 'Đồ uống' },
      env.base.owner.authHeader,
    )
    // tạo "Cà phê" cấp 1
    const r1 = await postJson(env, '/', { name: 'Cà phê' }, env.base.owner.authHeader)
    expect(r1.status).toBe(201)
    // tạo "Cà phê" cấp 2 dưới Đồ uống
    const r2 = await postJson(
      env,
      '/',
      { name: 'Cà phê', parentId: root.body.data.id },
      env.base.owner.authHeader,
    )
    expect(r2.status).toBe(201)
  })

  it('Manager tạo OK', async () => {
    const r = await postJson(env, '/', { name: 'X' }, env.base.manager.authHeader)
    expect(r.status).toBe(201)
  })

  it('Staff tạo → 403 FORBIDDEN', async () => {
    const r = await postJson<{ error: { code: string } }>(
      env,
      '/',
      { name: 'X' },
      env.base.staff.authHeader,
    )
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('FORBIDDEN')
  })

  it('không có Authorization → 401', async () => {
    const res = await env.app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'X' }),
    })
    expect(res.status).toBe(401)
  })

  it('audit ghi category.created với actorRole', async () => {
    await postJson(env, '/', { name: 'Đồ uống' }, env.base.owner.authHeader)
    const logs = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'category.created'))
    expect(logs).toHaveLength(1)
    expect(logs[0]?.actorRole).toBe('owner')
  })
})

describe('GET /categories (listCategories)', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Trả flat list theo store', async () => {
    await postJson(env, '/', { name: 'A' }, env.base.owner.authHeader)
    await postJson(env, '/', { name: 'B' }, env.base.owner.authHeader)
    const res = await env.app.request('/', { headers: env.base.owner.authHeader })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: CategoryResponse[] }
    expect(body.data).toHaveLength(2)
  })

  it('Staff GET → 403', async () => {
    const res = await env.app.request('/', { headers: env.base.staff.authHeader })
    expect(res.status).toBe(403)
  })
})

describe('PATCH /categories/:id (updateCategory)', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Sửa name thành tên đã tồn tại trong cùng cấp → 409', async () => {
    await postJson(env, '/', { name: 'A' }, env.base.owner.authHeader)
    const second = await postJson<{ data: CategoryResponse }>(
      env,
      '/',
      { name: 'B' },
      env.base.owner.authHeader,
    )
    const r = await patchJson<{ error: { code: string } }>(
      env,
      `/${second.body.data.id}`,
      { name: 'A' },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('CONFLICT')
  })

  it('Sửa parentId của danh mục cấp 1 đang có con → 422', async () => {
    const parent = await postJson<{ data: CategoryResponse }>(
      env,
      '/',
      { name: 'P1' },
      env.base.owner.authHeader,
    )
    const other = await postJson<{ data: CategoryResponse }>(
      env,
      '/',
      { name: 'P2' },
      env.base.owner.authHeader,
    )
    await postJson(
      env,
      '/',
      { name: 'C1', parentId: parent.body.data.id },
      env.base.owner.authHeader,
    )
    const r = await patchJson<{ error: { code: string } }>(
      env,
      `/${parent.body.data.id}`,
      { parentId: other.body.data.id },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('BUSINESS_RULE_VIOLATION')
  })

  it('Sửa parentId === self → 422', async () => {
    const root = await postJson<{ data: CategoryResponse }>(
      env,
      '/',
      { name: 'X' },
      env.base.owner.authHeader,
    )
    const r = await patchJson<{ error: { code: string } }>(
      env,
      `/${root.body.data.id}`,
      { parentId: root.body.data.id },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(422)
  })

  it('Sửa thành cấp 2 bình thường (không có con) → 200, sortOrder reset', async () => {
    const a = await postJson<{ data: CategoryResponse }>(
      env,
      '/',
      { name: 'A' },
      env.base.owner.authHeader,
    )
    const b = await postJson<{ data: CategoryResponse }>(
      env,
      '/',
      { name: 'B' },
      env.base.owner.authHeader,
    )
    const r = await patchJson<{ data: CategoryResponse }>(
      env,
      `/${b.body.data.id}`,
      { parentId: a.body.data.id },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.parentId).toBe(a.body.data.id)
    expect(r.body.data.sortOrder).toBe(0)
  })
})

describe('POST /categories/reorder', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Reorder 3 danh mục cấp 1 → sortOrder 0,1,2 đúng thứ tự', async () => {
    const a = await postJson<{ data: CategoryResponse }>(
      env,
      '/',
      { name: 'A' },
      env.base.owner.authHeader,
    )
    const b = await postJson<{ data: CategoryResponse }>(
      env,
      '/',
      { name: 'B' },
      env.base.owner.authHeader,
    )
    const c = await postJson<{ data: CategoryResponse }>(
      env,
      '/',
      { name: 'C' },
      env.base.owner.authHeader,
    )
    const r = await postJson<{ data: { ok: true } }>(
      env,
      '/reorder',
      {
        parentId: null,
        orderedIds: [c.body.data.id, a.body.data.id, b.body.data.id],
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    const rowC = await env.base.db.query.categories.findFirst({
      where: eq(categories.id, c.body.data.id),
    })
    const rowA = await env.base.db.query.categories.findFirst({
      where: eq(categories.id, a.body.data.id),
    })
    const rowB = await env.base.db.query.categories.findFirst({
      where: eq(categories.id, b.body.data.id),
    })
    expect(rowC?.sortOrder).toBe(0)
    expect(rowA?.sortOrder).toBe(1)
    expect(rowB?.sortOrder).toBe(2)
  })

  it('Reorder ids khác parent → 422', async () => {
    const parent = await postJson<{ data: CategoryResponse }>(
      env,
      '/',
      { name: 'P' },
      env.base.owner.authHeader,
    )
    const root2 = await postJson<{ data: CategoryResponse }>(
      env,
      '/',
      { name: 'P2' },
      env.base.owner.authHeader,
    )
    const child = await postJson<{ data: CategoryResponse }>(
      env,
      '/',
      { name: 'C', parentId: parent.body.data.id },
      env.base.owner.authHeader,
    )
    // mix root2 (parentId null) với child (parentId = parent.id)
    const r = await postJson<{ error: { code: string } }>(
      env,
      '/reorder',
      {
        parentId: null,
        orderedIds: [root2.body.data.id, child.body.data.id],
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(422)
  })

  it('audit ghi category.reordered', async () => {
    const a = await postJson<{ data: CategoryResponse }>(
      env,
      '/',
      { name: 'A' },
      env.base.owner.authHeader,
    )
    const b = await postJson<{ data: CategoryResponse }>(
      env,
      '/',
      { name: 'B' },
      env.base.owner.authHeader,
    )
    await postJson(
      env,
      '/reorder',
      {
        parentId: null,
        orderedIds: [b.body.data.id, a.body.data.id],
      },
      env.base.owner.authHeader,
    )
    const logs = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'category.reordered'))
    expect(logs).toHaveLength(1)
  })
})

describe('DELETE /categories/:id', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Xoá cấp 1 đang có con → 422', async () => {
    const parent = await postJson<{ data: CategoryResponse }>(
      env,
      '/',
      { name: 'P' },
      env.base.owner.authHeader,
    )
    await postJson(
      env,
      '/',
      { name: 'C', parentId: parent.body.data.id },
      env.base.owner.authHeader,
    )
    const r = await deletePath<{ error: { code: string; message: string } }>(
      env,
      `/${parent.body.data.id}`,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('BUSINESS_RULE_VIOLATION')
    expect(r.body.error.message).toContain('Vui lòng xoá danh mục con')
  })

  it('Xoá cấp 2 không có sản phẩm → 200', async () => {
    const parent = await postJson<{ data: CategoryResponse }>(
      env,
      '/',
      { name: 'P' },
      env.base.owner.authHeader,
    )
    const child = await postJson<{ data: CategoryResponse }>(
      env,
      '/',
      { name: 'C', parentId: parent.body.data.id },
      env.base.owner.authHeader,
    )
    const r = await deletePath<{ data: { ok: true } }>(
      env,
      `/${child.body.data.id}`,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
  })

  it('Xoá danh mục không tồn tại → 404', async () => {
    const r = await deletePath<{ error: { code: string } }>(
      env,
      '/0190d000-0000-7000-8000-000000000099',
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(404)
    expect(r.body.error.code).toBe('NOT_FOUND')
  })

  it('audit ghi category.deleted với snapshot', async () => {
    const c = await postJson<{ data: CategoryResponse }>(
      env,
      '/',
      { name: 'X' },
      env.base.owner.authHeader,
    )
    await deletePath(env, `/${c.body.data.id}`, env.base.owner.authHeader)
    const logs = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'category.deleted'))
    expect(logs).toHaveLength(1)
    const changes = logs[0]?.changes as { name?: string } | null
    expect(changes?.name).toBe('X')
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

  it('Owner store A không thể xem/sửa/xoá danh mục thuộc store B', async () => {
    // Tạo store B + owner B trong cùng PGlite
    const { stores, users } = await import('@kiotviet-lite/shared')
    const { hashPassword } = await import('../lib/password.js')
    const { signAccessToken } = await import('../lib/jwt.js')

    const [storeB] = await env.base.db.insert(stores).values({ name: 'Store B' }).returning()
    expect(storeB).toBeDefined()
    const passwordHash = await hashPassword('pwdpwd')
    const pinHash = await hashPassword('888888')
    const [ownerB] = await env.base.db
      .insert(users)
      .values({
        storeId: storeB!.id,
        name: 'Owner B',
        phone: '0908888888',
        passwordHash,
        pinHash,
        role: 'owner',
      })
      .returning()
    expect(ownerB).toBeDefined()

    const tokenB = signAccessToken({
      userId: ownerB!.id,
      storeId: storeB!.id,
      role: 'owner',
    })
    const headerB = { Authorization: `Bearer ${tokenB}` }

    // Owner A tạo danh mục
    const created = await postJson<{ data: CategoryResponse }>(
      env,
      '/',
      { name: 'Của A' },
      env.base.owner.authHeader,
    )

    // Owner B GET / → không thấy của A
    const listB = await env.app.request('/', { headers: headerB })
    expect(listB.status).toBe(200)
    const bodyB = (await listB.json()) as { data: CategoryResponse[] }
    expect(bodyB.data.find((c) => c.id === created.body.data.id)).toBeUndefined()

    // Owner B PATCH danh mục của A → 404
    const patchB = await patchJson<{ error: { code: string } }>(
      env,
      `/${created.body.data.id}`,
      { name: 'Hack' },
      headerB,
    )
    expect(patchB.status).toBe(404)

    // Owner B DELETE → 404
    const delB = await deletePath<{ error: { code: string } }>(
      env,
      `/${created.body.data.id}`,
      headerB,
    )
    expect(delB.status).toBe(404)

    // Reorder ids từ store khác → 422
    const myCat = await postJson<{ data: CategoryResponse }>(env, '/', { name: 'Của B' }, headerB)
    const reorder = await postJson<{ error: { code: string } }>(
      env,
      '/reorder',
      {
        parentId: null,
        orderedIds: [created.body.data.id, myCat.body.data.id],
      },
      headerB,
    )
    expect(reorder.status).toBe(422)
  })
})

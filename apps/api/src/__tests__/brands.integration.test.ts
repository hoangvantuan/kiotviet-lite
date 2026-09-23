import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { auditLogs, stores, users } from '@kiotviet-lite/shared'

import { signAccessToken } from '../lib/jwt.js'
import { type BrandsApp, createBrandsRoutes } from '../routes/brands.routes.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
})

type Brand = { id: string; name: string; storeId: string; deletedAt: string | null }
type Result = {
  data: Brand[]
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

async function request(
  app: BrandsApp,
  method: string,
  url: string,
  auth: { Authorization: string },
  body?: object,
) {
  return app.request(url, {
    method,
    headers: { ...auth, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

describe('brand management', () => {
  let base: TestEnv
  let app: BrandsApp
  beforeEach(async () => {
    base = await createTestEnv()
    app = createBrandsRoutes({ db: base.db })
  })
  afterEach(async () => base.close())

  it('owner and manager create, rename, soft delete and restore; all mutations are audited', async () => {
    const created = await request(app, 'POST', '/', base.owner.authHeader, { name: '  Acme  ' })
    expect(created.status).toBe(201)
    const brand = ((await created.json()) as { data: Brand }).data
    expect(brand.name).toBe('Acme')

    const renamed = await request(app, 'PATCH', `/${brand.id}`, base.manager.authHeader, {
      name: 'New Acme',
    })
    expect(renamed.status).toBe(200)
    expect(((await renamed.json()) as { data: Brand }).data.name).toBe('New Acme')

    expect((await request(app, 'DELETE', `/${brand.id}`, base.manager.authHeader)).status).toBe(200)
    const active = await request(app, 'GET', '/', base.owner.authHeader)
    expect(((await active.json()) as Result).data).toEqual([])
    const trashed = await request(app, 'GET', '/?status=trashed', base.owner.authHeader)
    expect(((await trashed.json()) as Result).data.map((item) => item.id)).toEqual([brand.id])

    const restored = await request(app, 'POST', `/${brand.id}/restore`, base.owner.authHeader)
    expect(restored.status).toBe(200)
    expect(((await restored.json()) as { data: Brand }).data.deletedAt).toBeNull()
    const logs = await base.db.select().from(auditLogs).where(eq(auditLogs.targetId, brand.id))
    expect(logs.map((log) => log.action)).toEqual([
      'brand.created',
      'brand.updated',
      'brand.deleted',
      'brand.restored',
    ])
    expect(logs.map((log) => log.actorRole)).toEqual(['owner', 'manager', 'manager', 'owner'])
  })

  it('staff cannot create, edit, delete, restore or list brands', async () => {
    const created = await request(app, 'POST', '/', base.owner.authHeader, { name: 'Sony' })
    const id = ((await created.json()) as { data: Brand }).data.id
    for (const [method, path, body] of [
      ['POST', '/', { name: 'Other' }],
      ['PATCH', `/${id}`, { name: 'Other' }],
      ['DELETE', `/${id}`, undefined],
      ['POST', `/${id}/restore`, undefined],
      ['GET', '/', undefined],
    ] as const) {
      expect((await request(app, method, path, base.staff.authHeader, body)).status).toBe(403)
    }
  })

  it('case-insensitive active names conflict; deleted names are free but restore conflicts', async () => {
    const created = await request(app, 'POST', '/', base.owner.authHeader, { name: 'Nike' })
    const original = ((await created.json()) as { data: Brand }).data
    const duplicate = await request(app, 'POST', '/', base.owner.authHeader, { name: 'NIKE' })
    expect(duplicate.status).toBe(409)
    expect(
      ((await duplicate.json()) as { error: { details: { field: string } } }).error.details.field,
    ).toBe('name')

    const second = await request(app, 'POST', '/', base.owner.authHeader, { name: 'Adidas' })
    const other = ((await second.json()) as { data: Brand }).data
    expect(
      (await request(app, 'PATCH', `/${other.id}`, base.owner.authHeader, { name: 'nike' })).status,
    ).toBe(409)

    expect((await request(app, 'DELETE', `/${original.id}`, base.owner.authHeader)).status).toBe(
      200,
    )
    expect((await request(app, 'POST', '/', base.owner.authHeader, { name: 'nike' })).status).toBe(
      201,
    )
    expect(
      (await request(app, 'POST', `/${original.id}/restore`, base.owner.authHeader)).status,
    ).toBe(409)
    const trashed = await request(app, 'GET', '/?status=trashed', base.owner.authHeader)
    expect(((await trashed.json()) as Result).data.map((brand) => brand.id)).toContain(original.id)
  })

  it('store A cannot see or mutate B; identical names in separate stores are allowed', async () => {
    const [storeB] = await base.db.insert(stores).values({ name: 'Cửa hàng B' }).returning()
    const [ownerB] = await base.db
      .insert(users)
      .values({
        storeId: storeB!.id,
        name: 'Owner B',
        phone: '0904444444',
        passwordHash: 'not-used',
        role: 'owner',
      })
      .returning()
    const authB = {
      Authorization: `Bearer ${signAccessToken({ userId: ownerB!.id, storeId: storeB!.id, role: 'owner' })}`,
    }
    const a = await request(app, 'POST', '/', base.owner.authHeader, { name: 'Apple' })
    const brandA = ((await a.json()) as { data: Brand }).data
    const b = await request(app, 'POST', '/', authB, { name: 'APPLE' })
    const brandB = ((await b.json()) as { data: Brand }).data
    expect(b.status).toBe(201)
    const listA = await request(app, 'GET', '/', base.owner.authHeader)
    const listB = await request(app, 'GET', '/', authB)
    expect(((await listA.json()) as Result).data.map((brand) => brand.id)).toEqual([brandA.id])
    expect(((await listB.json()) as Result).data.map((brand) => brand.id)).toEqual([brandB.id])
    expect(
      (await request(app, 'PATCH', `/${brandB.id}`, base.owner.authHeader, { name: 'Mine' }))
        .status,
    ).toBe(404)
    expect((await request(app, 'DELETE', `/${brandB.id}`, base.owner.authHeader)).status).toBe(404)
    expect((await request(app, 'DELETE', `/${brandA.id}`, base.owner.authHeader)).status).toBe(200)
    expect((await request(app, 'POST', `/${brandA.id}/restore`, authB)).status).toBe(404)
  })

  it('searches escaped text and pages active and trashed brands independently', async () => {
    for (const name of ['A_1', 'AB1', 'Alpha', 'Beta']) {
      await request(app, 'POST', '/', base.owner.authHeader, { name })
    }
    const found = await request(app, 'GET', '/?search=A_&pageSize=1', base.owner.authHeader)
    expect(((await found.json()) as Result).data.map((brand) => brand.name)).toEqual(['A_1'])
    const page2 = await request(app, 'GET', '/?page=2&pageSize=2', base.owner.authHeader)
    const result = (await page2.json()) as Result
    expect(result.meta).toEqual({ page: 2, pageSize: 2, total: 4, totalPages: 2 })
    expect(result.data).toHaveLength(2)
    const deleted = result.data[0]!
    await request(app, 'DELETE', `/${deleted.id}`, base.owner.authHeader)
    const trashed = await request(app, 'GET', '/?status=trashed&search=a', base.owner.authHeader)
    expect(((await trashed.json()) as Result).data.map((brand) => brand.id)).toContain(deleted.id)
  })
})

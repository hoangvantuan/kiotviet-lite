/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createBrandsRoutes } from '../routes/brands.routes.js'
import { createProductsRoutes } from '../routes/products.routes.js'
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
  app: ReturnType<typeof createProductsRoutes>
  brandsApp: ReturnType<typeof createBrandsRoutes>
}

async function setup(): Promise<Env> {
  const base = await createTestEnv()
  const app = createProductsRoutes({ db: base.db })
  const brandsApp = createBrandsRoutes({ db: base.db })
  return { base, app, brandsApp }
}

interface ApiRes {
  data: any
  error: any
}

async function jsonRequest<T = ApiRes>(
  app: any,
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
  const res = await app.request(path, init)
  return { status: res.status, body: await res.json() }
}

async function getRequest<T = ApiRes>(
  app: any,
  path: string,
  authHeader: { Authorization: string },
): Promise<{ status: number; body: T }> {
  const res = await app.request(path, { method: 'GET', headers: authHeader })
  return { status: res.status, body: await res.json() }
}

describe('Products - Brand Constraints', () => {
  let env: Env

  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Kiểm tra vòng đời thương hiệu, lọc none và validate weight', async () => {
    // 1. Create a brand
    const brandRes = await jsonRequest(
      env.brandsApp,
      'POST',
      '/',
      { name: 'Apple' },
      env.base.owner.authHeader,
    )
    const brandId = brandRes.body.data.id

    // 2. Create product with brandId, weight, description
    const createRes = await jsonRequest(
      env.app,
      'POST',
      '/',
      {
        name: 'iPhone 15',
        sellingPrice: 20000000,
        brandId,
        weight: 171,
        description: 'Mới 100%',
      },
      env.base.owner.authHeader,
    )

    expect(createRes.status).toBe(201)
    expect(createRes.body.data.brandId).toBe(brandId)
    expect(createRes.body.data.brandName).toBe('Apple')
    expect(createRes.body.data.weight).toBe(171)
    expect(createRes.body.data.description).toBe('Mới 100%')

    const productId = createRes.body.data.id

    // 2.1 Smoke edit: Update with multiline description
    const multilineDesc = 'Dòng 1\nDòng 2\n\nDòng 4'
    const patchRes = await jsonRequest(
      env.app,
      'PATCH',
      `/${productId}`,
      { description: multilineDesc },
      env.base.owner.authHeader,
    )
    expect(patchRes.status).toBe(200)
    expect(patchRes.body.data.description).toBe(multilineDesc)

    // 3. Fetch list and filter by brandId
    const listRes = await getRequest(env.app, `/?brandId=${brandId}`, env.base.owner.authHeader)
    expect(listRes.body.data).toHaveLength(1)
    expect(listRes.body.data[0].brandName).toBe('Apple')

    // 4. Create an unassigned product
    await jsonRequest(
      env.app,
      'POST',
      '/',
      { name: 'Generic Case', sellingPrice: 50000 },
      env.base.owner.authHeader,
    )

    // 5. Filter by brandId: 'none' finds the unassigned product
    const listNone = await getRequest(env.app, `/?brandId=none`, env.base.owner.authHeader)
    expect(listNone.body.data).toHaveLength(1)
    expect(listNone.body.data[0].name).toBe('Generic Case')

    // 6. Rename the brand and verify product reflects it
    await jsonRequest(
      env.brandsApp,
      'PATCH',
      `/${brandId}`,
      { name: 'Apple Inc.' },
      env.base.owner.authHeader,
    )
    const listUpdated = await getRequest(env.app, `/?brandId=${brandId}`, env.base.owner.authHeader)
    expect(listUpdated.body.data[0].brandName).toBe('Apple Inc.')

    // 7. Prevent deleting brand if linked to a product
    const delRes = await jsonRequest(
      env.brandsApp,
      'DELETE',
      `/${brandId}`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(delRes.status).toBe(422)
    expect(delRes.body.error.code).toBe('BUSINESS_RULE_VIOLATION')

    // 8. Validate weight rejects negative or fractional
    const invalidWeight1 = await jsonRequest(
      env.app,
      'POST',
      '/',
      { name: 'Invalid 1', sellingPrice: 100, weight: -5 },
      env.base.owner.authHeader,
    )
    expect(invalidWeight1.status).toBe(400)

    const invalidWeight2 = await jsonRequest(
      env.app,
      'POST',
      '/',
      { name: 'Invalid 2', sellingPrice: 100, weight: 1.5 },
      env.base.owner.authHeader,
    )
    expect(invalidWeight2.status).toBe(400)
  })

  it('Bắt lỗi khi dùng brandId của store khác', async () => {
    // 1. Other store creates a brand in the SAME database
    const { stores, brands } = await import('@kiotviet-lite/shared')
    const [otherStore] = await env.base.db
      .insert(stores)
      .values({ name: 'Other Store' })
      .returning()
    const [otherBrand] = await env.base.db
      .insert(brands)
      .values({ storeId: otherStore!.id, name: 'Samsung' })
      .returning()
    const otherBrandId = otherBrand!.id

    // 2. Main store tries to use it
    const createRes = await jsonRequest(
      env.app,
      'POST',
      '/',
      {
        name: 'Galaxy S24',
        sellingPrice: 15000000,
        brandId: otherBrandId,
      },
      env.base.owner.authHeader,
    )

    expect(createRes.status).toBe(404)
    expect(createRes.body.error.code).toBe('NOT_FOUND')
  })

  it('Bắt lỗi khi gán thương hiệu đã bị xoá', async () => {
    // 1. Create a brand
    const brandRes = await jsonRequest(
      env.brandsApp,
      'POST',
      '/',
      { name: 'Nokia' },
      env.base.owner.authHeader,
    )
    const brandId = brandRes.body.data.id

    // 2. Delete the brand
    await jsonRequest(env.brandsApp, 'DELETE', `/${brandId}`, undefined, env.base.owner.authHeader)

    // 3. Try to assign the deleted brand
    const createRes = await jsonRequest(
      env.app,
      'POST',
      '/',
      {
        name: 'Nokia 3310',
        sellingPrice: 500000,
        brandId,
      },
      env.base.owner.authHeader,
    )

    expect(createRes.status).toBe(404)
    expect(createRes.body.error.code).toBe('NOT_FOUND')
  })
})

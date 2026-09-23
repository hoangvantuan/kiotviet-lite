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

async function jsonRequest<T>(
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

async function getRequest<T>(
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

  it('Cho phép tạo và đọc sản phẩm có brandId, weight, description', async () => {
    // 1. Create a brand
    const brandRes = await jsonRequest<any>(
      env.brandsApp,
      'POST',
      '/',
      { name: 'Apple' },
      env.base.owner.authHeader,
    )
    console.log('brandRes', brandRes)
    const brandId = brandRes.body.data.id

    // 2. Create product with brandId, weight, description
    const createRes = await jsonRequest<any>(
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
    console.log('createRes', createRes)

    expect(createRes.status).toBe(201)
    expect(createRes.body.data.brandId).toBe(brandId)
    expect(createRes.body.data.brandName).toBe('Apple')
    expect(createRes.body.data.weight).toBe(171)
    expect(createRes.body.data.description).toBe('Mới 100%')

    // 3. Fetch list and filter by brandId
    const listRes = await getRequest<any>(
      env.app,
      `/?brandId=${brandId}`,
      env.base.owner.authHeader,
    )
    expect(listRes.body.data).toHaveLength(1)
    expect(listRes.body.data[0].brandName).toBe('Apple')

    // 4. Filter by brandId: 'none'
    const listNone = await getRequest<any>(env.app, `/?brandId=none`, env.base.owner.authHeader)
    expect(listNone.body.data).toHaveLength(0)
  })

  it('Bắt lỗi khi dùng brandId của store khác', async () => {
    // Other store creates a brand
    const otherEnv = await setup()
    const otherBrandRes = await jsonRequest<any>(
      otherEnv.brandsApp,
      'POST',
      '/',
      { name: 'Samsung' },
      otherEnv.base.owner.authHeader,
    )
    const otherBrandId = otherBrandRes.body.data.id

    // Main store tries to use it
    const createRes = await jsonRequest<any>(
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

    await otherEnv.base.close()
  })
})

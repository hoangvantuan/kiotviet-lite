import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { auditLogs, productUnitConversions } from '@kiotviet-lite/shared'

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

interface UnitConversionResp {
  id: string
  productId: string
  unit: string
  conversionFactor: number
  sellingPrice: number
  sortOrder: number
  createdAt: string
  updatedAt: string
}

interface ProductResp {
  id: string
  unit: string
  unitConversions: UnitConversionResp[]
  hasVariants: boolean
}

interface RequestableApp {
  request: (path: string, init?: RequestInit) => Response | Promise<Response>
}

async function jsonRequest<T>(
  app: RequestableApp,
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
  const text = await res.text()
  return { status: res.status, body: text ? (JSON.parse(text) as T) : (undefined as T) }
}

interface Env {
  base: TestEnv
  app: ReturnType<typeof createProductsRoutes>
}

async function setup(): Promise<Env> {
  const base = await createTestEnv()
  return { base, app: createProductsRoutes({ db: base.db }) }
}

async function createSimpleProduct(env: Env, name = 'Coca lon', sku = 'COCA-001') {
  const r = await jsonRequest<{ data: ProductResp }>(
    env.app,
    'POST',
    '/',
    { name, sku, sellingPrice: 10000, unit: 'Lon' },
    env.base.owner.authHeader,
  )
  return r.body.data
}

describe('Unit conversions CRUD', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Create unit conversion valid → 201 + audit', async () => {
    const product = await createSimpleProduct(env)
    const r = await jsonRequest<{ data: UnitConversionResp }>(
      env.app,
      'POST',
      `/${product.id}/unit-conversions`,
      { unit: 'Thùng', conversionFactor: 24, sellingPrice: 240000 },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
    expect(r.body.data.unit).toBe('Thùng')
    expect(r.body.data.conversionFactor).toBe(24)

    const audits = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'product.unit_conversion_created'))
    expect(audits.length).toBe(1)
  })

  it('Unit trùng products.unit (case-insensitive) → 400', async () => {
    const product = await createSimpleProduct(env)
    const r = await jsonRequest<{ error: { code: string } }>(
      env.app,
      'POST',
      `/${product.id}/unit-conversions`,
      { unit: 'lon', conversionFactor: 6, sellingPrice: 0 },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('conversionFactor = 1 → 400 (Zod fail)', async () => {
    const product = await createSimpleProduct(env)
    const r = await jsonRequest<{ error: { code: string } }>(
      env.app,
      'POST',
      `/${product.id}/unit-conversions`,
      { unit: 'X', conversionFactor: 1, sellingPrice: 0 },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
  })

  it('Tạo đơn vị thứ 4 → 422 BUSINESS_RULE_VIOLATION', async () => {
    const product = await createSimpleProduct(env)
    for (const [u, f] of [
      ['Lốc', 6],
      ['Thùng', 24],
      ['Pallet', 240],
    ] as const) {
      await jsonRequest(
        env.app,
        'POST',
        `/${product.id}/unit-conversions`,
        { unit: u, conversionFactor: f, sellingPrice: 0 },
        env.base.owner.authHeader,
      )
    }
    const r = await jsonRequest<{ error: { code: string } }>(
      env.app,
      'POST',
      `/${product.id}/unit-conversions`,
      { unit: 'Container', conversionFactor: 1000, sellingPrice: 0 },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('BUSINESS_RULE_VIOLATION')
  })

  it('Trùng đơn vị quy đổi (case-insensitive Thùng vs thùng) → 409', async () => {
    const product = await createSimpleProduct(env)
    await jsonRequest(
      env.app,
      'POST',
      `/${product.id}/unit-conversions`,
      { unit: 'Thùng', conversionFactor: 24, sellingPrice: 0 },
      env.base.owner.authHeader,
    )
    const r = await jsonRequest<{ error: { code: string } }>(
      env.app,
      'POST',
      `/${product.id}/unit-conversions`,
      { unit: 'thùng', conversionFactor: 12, sellingPrice: 0 },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('CONFLICT')
  })

  it('Update unit conversion → 200 + audit', async () => {
    const product = await createSimpleProduct(env)
    const c = await jsonRequest<{ data: UnitConversionResp }>(
      env.app,
      'POST',
      `/${product.id}/unit-conversions`,
      { unit: 'Thùng', conversionFactor: 24, sellingPrice: 240000 },
      env.base.owner.authHeader,
    )
    const id = c.body.data.id
    const r = await jsonRequest<{ data: UnitConversionResp }>(
      env.app,
      'PATCH',
      `/${product.id}/unit-conversions/${id}`,
      { sellingPrice: 230000 },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.sellingPrice).toBe(230000)
    const audits = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'product.unit_conversion_updated'))
    expect(audits.length).toBe(1)
  })

  it('Delete unit conversion → 204', async () => {
    const product = await createSimpleProduct(env)
    const c = await jsonRequest<{ data: UnitConversionResp }>(
      env.app,
      'POST',
      `/${product.id}/unit-conversions`,
      { unit: 'Thùng', conversionFactor: 24, sellingPrice: 240000 },
      env.base.owner.authHeader,
    )
    const id = c.body.data.id
    const r = await jsonRequest<undefined>(
      env.app,
      'DELETE',
      `/${product.id}/unit-conversions/${id}`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(204)
    const remain = await env.base.db
      .select()
      .from(productUnitConversions)
      .where(eq(productUnitConversions.id, id))
    expect(remain).toHaveLength(0)
  })

  it('List unit conversions theo sortOrder, createdAt', async () => {
    const product = await createSimpleProduct(env)
    await jsonRequest(
      env.app,
      'POST',
      `/${product.id}/unit-conversions`,
      { unit: 'Thùng', conversionFactor: 24, sellingPrice: 0, sortOrder: 2 },
      env.base.owner.authHeader,
    )
    await jsonRequest(
      env.app,
      'POST',
      `/${product.id}/unit-conversions`,
      { unit: 'Lốc', conversionFactor: 6, sellingPrice: 0, sortOrder: 1 },
      env.base.owner.authHeader,
    )
    const r = await jsonRequest<{ data: UnitConversionResp[] }>(
      env.app,
      'GET',
      `/${product.id}/unit-conversions`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data).toHaveLength(2)
    expect(r.body.data[0]!.unit).toBe('Lốc')
    expect(r.body.data[1]!.unit).toBe('Thùng')
  })

  it('Permission: Staff bị 403', async () => {
    const product = await createSimpleProduct(env)
    const r = await jsonRequest<{ error: { code: string } }>(
      env.app,
      'POST',
      `/${product.id}/unit-conversions`,
      { unit: 'Thùng', conversionFactor: 24, sellingPrice: 0 },
      env.base.staff.authHeader,
    )
    expect(r.status).toBe(403)
  })

  it('Tạo product với unitConversions inline (3 cái) → 201 product detail có 3 UoM', async () => {
    const r = await jsonRequest<{ data: ProductResp }>(
      env.app,
      'POST',
      '/',
      {
        name: 'Coca lon 2',
        sku: 'COCA-002',
        sellingPrice: 10000,
        unit: 'Lon',
        unitConversions: [
          { unit: 'Lốc', conversionFactor: 6, sellingPrice: 60000 },
          { unit: 'Thùng', conversionFactor: 24, sellingPrice: 240000 },
          { unit: 'Pallet', conversionFactor: 240, sellingPrice: 2400000 },
        ],
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
    expect(r.body.data.unitConversions).toHaveLength(3)
  })

  it('Tạo product với unitConversions = 4 cái → 400 (Zod max 3)', async () => {
    const r = await jsonRequest<{ error: { code: string } }>(
      env.app,
      'POST',
      '/',
      {
        name: 'Coca lon 3',
        sku: 'COCA-003',
        sellingPrice: 10000,
        unit: 'Lon',
        unitConversions: [
          { unit: 'A', conversionFactor: 2, sellingPrice: 0 },
          { unit: 'B', conversionFactor: 3, sellingPrice: 0 },
          { unit: 'C', conversionFactor: 4, sellingPrice: 0 },
          { unit: 'D', conversionFactor: 5, sellingPrice: 0 },
        ],
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
  })
})

import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { auditLogs, products, stores, volumePrices } from '@kiotviet-lite/shared'

import { createVolumePricesRoutes } from '../routes/volume-prices.routes.js'
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
  app: ReturnType<typeof createVolumePricesRoutes>
  productIds: string[]
}

async function setup(): Promise<Env> {
  const base = await createTestEnv()
  const app = createVolumePricesRoutes({ db: base.db })

  const insertedProducts = await base.db
    .insert(products)
    .values(
      Array.from({ length: 3 }, (_, i) => ({
        storeId: base.storeId,
        name: `Sản phẩm ${i + 1}`,
        sku: `SKU${i + 1}`,
        sellingPrice: 100000 + i * 10000,
        costPrice: 50000,
      })),
    )
    .returning({ id: products.id })

  return {
    base,
    app,
    productIds: insertedProducts.map((p) => p.id),
  }
}

async function reqJson<T>(
  env: Env,
  method: string,
  path: string,
  body: unknown | undefined,
  authHeader: { Authorization: string },
): Promise<{ status: number; body: T }> {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeader },
  }
  if (body !== undefined) init.body = JSON.stringify(body)
  const res = await env.app.request(path, init)
  return { status: res.status, body: (await res.json()) as T }
}

const get = <T>(env: Env, path: string, ah: { Authorization: string }) =>
  reqJson<T>(env, 'GET', path, undefined, ah)
const put = <T>(env: Env, path: string, body: unknown, ah: { Authorization: string }) =>
  reqJson<T>(env, 'PUT', path, body, ah)

describe('PUT /volume-prices/products/:productId', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Owner replace 5 tier hợp lệ → 200, sort ASC', async () => {
    const r = await put<{
      data: { productId: string; tiers: Array<{ minQty: number; price: number }> }
    }>(
      env,
      `/products/${env.productIds[0]}`,
      {
        tiers: [
          { minQty: 200, price: 30000 },
          { minQty: 1, price: 50000 },
          { minQty: 50, price: 40000 },
          { minQty: 10, price: 45000 },
          { minQty: 100, price: 35000 },
        ],
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.tiers.length).toBe(5)
    expect(r.body.data.tiers.map((t) => t.minQty)).toEqual([1, 10, 50, 100, 200])
    expect(r.body.data.tiers.map((t) => t.price)).toEqual([50000, 45000, 40000, 35000, 30000])
  })

  it('Manager OK', async () => {
    const r = await put(
      env,
      `/products/${env.productIds[0]}`,
      { tiers: [{ minQty: 1, price: 50000 }] },
      env.base.manager.authHeader,
    )
    expect(r.status).toBe(200)
  })

  it('Staff → 403', async () => {
    const r = await put(
      env,
      `/products/${env.productIds[0]}`,
      { tiers: [{ minQty: 1, price: 50000 }] },
      env.base.staff.authHeader,
    )
    expect(r.status).toBe(403)
  })

  it('Replace với tiers=[] → DELETE all + audit tierCountAfter=0', async () => {
    // First seed
    await put(
      env,
      `/products/${env.productIds[0]}`,
      {
        tiers: [
          { minQty: 1, price: 50000 },
          { minQty: 10, price: 45000 },
        ],
      },
      env.base.owner.authHeader,
    )
    // Replace empty
    const r = await put<{ data: { tiers: unknown[] } }>(
      env,
      `/products/${env.productIds[0]}`,
      { tiers: [] },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.tiers.length).toBe(0)

    const remaining = await env.base.db
      .select()
      .from(volumePrices)
      .where(eq(volumePrices.productId, env.productIds[0]!))
    expect(remaining.length).toBe(0)

    const audits = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.targetId, env.productIds[0]!))
    const last = audits[audits.length - 1]
    expect(last?.action).toBe('volume_prices.replaced')
    const changes = last?.changes as { tierCountBefore: number; tierCountAfter: number }
    expect(changes.tierCountBefore).toBe(2)
    expect(changes.tierCountAfter).toBe(0)
  })

  it('Replace 6 tier → 400 "Tối đa 5"', async () => {
    const r = await put<{ error: { code: string; details: unknown } }>(
      env,
      `/products/${env.productIds[0]}`,
      {
        tiers: [
          { minQty: 1, price: 60000 },
          { minQty: 10, price: 55000 },
          { minQty: 50, price: 50000 },
          { minQty: 100, price: 45000 },
          { minQty: 200, price: 40000 },
          { minQty: 500, price: 35000 },
        ],
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('Duplicate minQty → 400', async () => {
    const r = await put<{ error: { code: string } }>(
      env,
      `/products/${env.productIds[0]}`,
      {
        tiers: [
          { minQty: 10, price: 50000 },
          { minQty: 10, price: 45000 },
        ],
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
  })

  it('Giá KHÔNG giảm dần → 400', async () => {
    const r = await put<{ error: { code: string } }>(
      env,
      `/products/${env.productIds[0]}`,
      {
        tiers: [
          { minQty: 1, price: 50000 },
          { minQty: 10, price: 45000 },
          { minQty: 50, price: 45000 },
        ],
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
  })

  it('minQty=0 → 400', async () => {
    const r = await put<{ error: { code: string } }>(
      env,
      `/products/${env.productIds[0]}`,
      { tiers: [{ minQty: 0, price: 50000 }] },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
  })

  it('DB CHECK: raw INSERT min_qty=0 → throw error', async () => {
    let threw = false
    try {
      await env.base.db.insert(volumePrices).values({
        storeId: env.base.storeId,
        productId: env.productIds[0]!,
        minQty: 0,
        price: 50000,
      })
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
  })

  it('Replace cùng productId 2 lần → ghi đè hoàn toàn', async () => {
    await put(
      env,
      `/products/${env.productIds[0]}`,
      {
        tiers: [
          { minQty: 1, price: 50000 },
          { minQty: 10, price: 45000 },
        ],
      },
      env.base.owner.authHeader,
    )
    const r = await put<{ data: { tiers: Array<{ minQty: number; price: number }> } }>(
      env,
      `/products/${env.productIds[0]}`,
      { tiers: [{ minQty: 5, price: 30000 }] },
      env.base.owner.authHeader,
    )
    expect(r.body.data.tiers.length).toBe(1)
    expect(r.body.data.tiers[0]?.minQty).toBe(5)
    expect(r.body.data.tiers[0]?.price).toBe(30000)
  })

  it('Product không cùng store → 404', async () => {
    const [otherStore] = await env.base.db
      .insert(stores)
      .values({ name: 'Cửa hàng khác' })
      .returning()
    const [otherProduct] = await env.base.db
      .insert(products)
      .values({
        storeId: otherStore!.id,
        name: 'SP khác',
        sku: 'OTHER',
        sellingPrice: 1000,
      })
      .returning()
    const r = await put<{ error: { code: string } }>(
      env,
      `/products/${otherProduct!.id}`,
      { tiers: [{ minQty: 1, price: 50000 }] },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(404)
  })
})

describe('GET /volume-prices/products/:productId', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
    await put(
      env,
      `/products/${env.productIds[0]}`,
      {
        tiers: [
          { minQty: 1, price: 50000 },
          { minQty: 10, price: 45000 },
          { minQty: 50, price: 40000 },
        ],
      },
      env.base.owner.authHeader,
    )
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('trả tiers sorted minQty ASC + product info', async () => {
    const r = await get<{
      data: {
        productId: string
        productName: string
        productSku: string
        productSellingPrice: number
        productCostPrice: number | null
        tiers: Array<{ minQty: number; price: number }>
      }
    }>(env, `/products/${env.productIds[0]}`, env.base.owner.authHeader)
    expect(r.status).toBe(200)
    expect(r.body.data.productName).toBe('Sản phẩm 1')
    expect(r.body.data.productSku).toBe('SKU1')
    expect(r.body.data.productSellingPrice).toBe(100000)
    expect(r.body.data.productCostPrice).toBe(50000)
    expect(r.body.data.tiers.map((t) => t.minQty)).toEqual([1, 10, 50])
  })

  it('SP chưa có tier → tiers: []', async () => {
    const r = await get<{ data: { tiers: unknown[] } }>(
      env,
      `/products/${env.productIds[1]}`,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.tiers).toEqual([])
  })

  it('SP không cùng store → 404', async () => {
    const [otherStore] = await env.base.db.insert(stores).values({ name: 'X' }).returning()
    const [otherProduct] = await env.base.db
      .insert(products)
      .values({ storeId: otherStore!.id, name: 'SP', sku: 'X', sellingPrice: 1 })
      .returning()
    const r = await get<{ error: { code: string } }>(
      env,
      `/products/${otherProduct!.id}`,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(404)
  })
})

describe('GET /volume-prices (list)', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
    // Seed 2 SP có volume prices (P0, P1) còn P2 không có
    await put(
      env,
      `/products/${env.productIds[0]}`,
      {
        tiers: [
          { minQty: 1, price: 50000 },
          { minQty: 10, price: 45000 },
          { minQty: 50, price: 40000 },
          { minQty: 100, price: 35000 },
        ],
      },
      env.base.owner.authHeader,
    )
    await put(
      env,
      `/products/${env.productIds[1]}`,
      {
        tiers: [
          { minQty: 1, price: 60000 },
          { minQty: 10, price: 50000 },
        ],
      },
      env.base.owner.authHeader,
    )
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('chỉ liệt kê SP có tier (không SP P2)', async () => {
    const r = await get<{
      data: Array<{
        productId: string
        productName: string
        tierCount: number
        minPrice: number
        maxPrice: number
        topTiers: Array<{ minQty: number }>
      }>
      meta: { total: number }
    }>(env, '/', env.base.owner.authHeader)
    expect(r.status).toBe(200)
    expect(r.body.meta.total).toBe(2)
    const p0 = r.body.data.find((d) => d.productId === env.productIds[0])
    expect(p0?.tierCount).toBe(4)
    expect(p0?.minPrice).toBe(35000)
    expect(p0?.maxPrice).toBe(50000)
    expect(p0?.topTiers.length).toBe(3)
    expect(p0?.topTiers.map((t) => t.minQty)).toEqual([1, 10, 50])
  })

  it('search theo tên SP', async () => {
    const r = await get<{ data: Array<{ productName: string }>; meta: { total: number } }>(
      env,
      `/?search=Sản phẩm 1`,
      env.base.owner.authHeader,
    )
    expect(r.body.meta.total).toBe(1)
  })

  it('loại SP đã soft delete', async () => {
    await env.base.db
      .update(products)
      .set({ deletedAt: new Date() })
      .where(eq(products.id, env.productIds[0]!))
    const r = await get<{ meta: { total: number } }>(env, '/', env.base.owner.authHeader)
    expect(r.body.meta.total).toBe(1)
  })
})

describe('Multi-tenant + Cascade', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
    await put(
      env,
      `/products/${env.productIds[0]}`,
      { tiers: [{ minQty: 1, price: 50000 }] },
      env.base.owner.authHeader,
    )
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Store khác KHÔNG thấy volume_prices store này', async () => {
    const [otherStore] = await env.base.db
      .insert(stores)
      .values({ name: 'Cửa hàng khác' })
      .returning()
    const { signAccessToken } = await import('../lib/jwt.js')
    const { hashPassword } = await import('../lib/password.js')
    const { users } = await import('@kiotviet-lite/shared')
    const pwd = await hashPassword('matkhau123')
    const pin = await hashPassword('111111')
    const [otherOwner] = await env.base.db
      .insert(users)
      .values({
        storeId: otherStore!.id,
        name: 'Owner B',
        phone: '0944444444',
        passwordHash: pwd,
        pinHash: pin,
        role: 'owner',
      })
      .returning()
    const token = signAccessToken({
      userId: otherOwner!.id,
      storeId: otherStore!.id,
      role: 'owner',
    })
    const ah = { Authorization: `Bearer ${token}` }
    const r = await get<{ meta: { total: number } }>(env, '/', ah)
    expect(r.body.meta.total).toBe(0)
  })

  it('Hard delete product → volume_prices CASCADE bị xoá', async () => {
    await env.base.db.delete(products).where(eq(products.id, env.productIds[0]!))
    const remaining = await env.base.db
      .select({ count: sql<number>`count(*)::int` })
      .from(volumePrices)
      .where(eq(volumePrices.productId, env.productIds[0]!))
    expect(remaining[0]?.count).toBe(0)
  })
})

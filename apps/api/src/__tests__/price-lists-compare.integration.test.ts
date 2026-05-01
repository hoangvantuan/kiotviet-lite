import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { ComparePriceListsResponse } from '@kiotviet-lite/shared'
import { products } from '@kiotviet-lite/shared'

import { createPriceListsRoutes } from '../routes/price-lists.routes.js'
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
  app: ReturnType<typeof createPriceListsRoutes>
  productIds: string[]
}

async function setup(): Promise<Env> {
  const base = await createTestEnv()
  const app = createPriceListsRoutes({ db: base.db })
  // Seed 5 products in store; product index 4 has cost_price = null to test margin null
  const inserted = await base.db
    .insert(products)
    .values([
      {
        storeId: base.storeId,
        name: 'Sản phẩm 1',
        sku: 'SP1',
        sellingPrice: 100000,
        costPrice: 50000,
      },
      {
        storeId: base.storeId,
        name: 'Sản phẩm 2',
        sku: 'SP2',
        sellingPrice: 200000,
        costPrice: 100000,
      },
      {
        storeId: base.storeId,
        name: 'Sản phẩm 3',
        sku: 'SP3',
        sellingPrice: 300000,
        costPrice: 150000,
      },
      {
        storeId: base.storeId,
        name: 'Sản phẩm 4',
        sku: 'SP4',
        sellingPrice: 400000,
        costPrice: 200000,
      },
      {
        storeId: base.storeId,
        name: 'Sản phẩm 5',
        sku: 'SP5',
        sellingPrice: 500000,
        costPrice: null,
      },
    ])
    .returning({ id: products.id })
  return { base, app, productIds: inserted.map((p) => p.id) }
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
const post = <T>(env: Env, path: string, body: unknown, ah: { Authorization: string }) =>
  reqJson<T>(env, 'POST', path, body, ah)
const del = <T>(env: Env, path: string, ah: { Authorization: string }) =>
  reqJson<T>(env, 'DELETE', path, undefined, ah)

interface IdEnvelope {
  data: { id: string }
}

async function createDirect(env: Env, name: string, items: { productId: string; price: number }[]) {
  const r = await post<IdEnvelope>(
    env,
    '/',
    { name, method: 'direct', items },
    env.base.owner.authHeader,
  )
  expect(r.status).toBe(201)
  return r.body.data.id
}

describe('GET /price-lists/compare', () => {
  let env: Env
  let aId: string
  let bId: string
  let cId: string

  beforeEach(async () => {
    env = await setup()
    // A: 5 SP (tất cả) với giá X
    aId = await createDirect(env, 'Bảng A', [
      { productId: env.productIds[0]!, price: 100000 },
      { productId: env.productIds[1]!, price: 200000 },
      { productId: env.productIds[2]!, price: 300000 },
      { productId: env.productIds[3]!, price: 400000 },
      { productId: env.productIds[4]!, price: 500000 },
    ])
    // B: formula percent_decrease 10% (1000 = 10%) trên A → 5 SP, giá giảm 10%
    const bRes = await post<IdEnvelope>(
      env,
      '/',
      {
        name: 'Bảng B',
        method: 'formula',
        baseListId: aId,
        formulaType: 'percent_decrease',
        formulaValue: 1000,
        roundingRule: 'none',
      },
      env.base.owner.authHeader,
    )
    expect(bRes.status).toBe(201)
    bId = bRes.body.data.id
    // C: direct với 3 SP (overlap 3 SP đầu)
    cId = await createDirect(env, 'Bảng C', [
      { productId: env.productIds[0]!, price: 80000 },
      { productId: env.productIds[1]!, price: 160000 },
      { productId: env.productIds[2]!, price: 240000 },
    ])
  })

  afterEach(async () => {
    await env.base.close()
  })

  it('Happy path: A vs B (formula -10%) → 5 rows, mỗi row diffPercent ≈ -10', async () => {
    const r = await get<{ data: ComparePriceListsResponse }>(
      env,
      `/compare?listAId=${aId}&listBId=${bId}`,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.rows.length).toBe(5)
    expect(r.body.data.summary.totalProducts).toBe(5)
    expect(r.body.data.summary.bothCount).toBe(5)
    expect(r.body.data.summary.onlyACount).toBe(0)
    expect(r.body.data.summary.onlyBCount).toBe(0)
    for (const row of r.body.data.rows) {
      expect(row.diffPercent).toBe(-10)
      expect(row.isMissingA).toBe(false)
      expect(row.isMissingB).toBe(false)
    }
    // Sản phẩm 5 costPrice null → margin null
    const sp5 = r.body.data.rows.find((row) => row.productSku === 'SP5')
    expect(sp5?.marginA).toBe(null)
    expect(sp5?.marginB).toBe(null)
    expect(sp5?.isBelowCostA).toBe(false)
    expect(sp5?.isBelowCostB).toBe(false)
  })

  it('A vs C (overlap 3 SP) → 5 rows (5 ∪ 3 = 5), summary đúng', async () => {
    const r = await get<{ data: ComparePriceListsResponse }>(
      env,
      `/compare?listAId=${aId}&listBId=${cId}`,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.rows.length).toBe(5)
    expect(r.body.data.summary.bothCount).toBe(3)
    expect(r.body.data.summary.onlyACount).toBe(2)
    expect(r.body.data.summary.onlyBCount).toBe(0)
  })

  it('VALIDATION_ERROR khi listAId === listBId', async () => {
    const r = await get<{ error: { code: string; message: string } }>(
      env,
      `/compare?listAId=${aId}&listBId=${aId}`,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('VALIDATION_ERROR khi listAId không phải uuid', async () => {
    const r = await get<{ error: { code: string } }>(
      env,
      `/compare?listAId=not-uuid&listBId=${bId}`,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('404 khi 1 bảng đã bị xoá', async () => {
    const delR = await del(env, `/${cId}`, env.base.owner.authHeader)
    expect(delR.status).toBe(200)
    const r = await get<{ error: { code: string } }>(
      env,
      `/compare?listAId=${aId}&listBId=${cId}`,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(404)
  })

  it('Cross-store: listB thuộc store khác → 404', async () => {
    const env2 = await setup()
    try {
      const otherListId = await createDirect(env2, 'Bảng store2', [
        { productId: env2.productIds[0]!, price: 50000 },
      ])
      const r = await get<{ error: { code: string } }>(
        env,
        `/compare?listAId=${aId}&listBId=${otherListId}`,
        env.base.owner.authHeader,
      )
      expect(r.status).toBe(404)
    } finally {
      await env2.base.close()
    }
  })

  it('isBelowCostB=true khi priceB < costPrice', async () => {
    // Tạo bảng D với 1 SP có giá thấp hơn cost
    const dId = await createDirect(env, 'Bảng D', [
      { productId: env.productIds[0]!, price: 30000 }, // costPrice = 50000 > 30000
    ])
    const r = await get<{ data: ComparePriceListsResponse }>(
      env,
      `/compare?listAId=${aId}&listBId=${dId}`,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    const target = r.body.data.rows.find((row) => row.productSku === 'SP1')
    expect(target?.isBelowCostB).toBe(true)
    expect(target?.priceA).toBe(100000)
    expect(target?.priceB).toBe(30000)
    expect(r.body.data.summary.belowCostBCount).toBe(1)
  })

  it('Soft-deleted product bị bỏ qua (orphan items skip)', async () => {
    const { eq } = await import('drizzle-orm')
    await env.base.db
      .update(products)
      .set({ deletedAt: new Date() })
      .where(eq(products.id, env.productIds[0]!))
    const r = await get<{ data: ComparePriceListsResponse }>(
      env,
      `/compare?listAId=${aId}&listBId=${bId}`,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.rows.length).toBe(4)
    expect(r.body.data.rows.find((row) => row.productSku === 'SP1')).toBeUndefined()
  })

  it('priceA = 0 → diffPercent = null, marginA = null', async () => {
    const zeroId = await createDirect(env, 'Bảng Zero', [
      { productId: env.productIds[0]!, price: 0 },
    ])
    const r = await get<{ data: ComparePriceListsResponse }>(
      env,
      `/compare?listAId=${zeroId}&listBId=${aId}`,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    const sp1 = r.body.data.rows.find((row) => row.productSku === 'SP1')
    expect(sp1?.priceA).toBe(0)
    expect(sp1?.diffPercent).toBe(null)
    expect(sp1?.marginA).toBe(null)
  })

  it('Cả 2 bảng rỗng → rows = [], summary toàn 0', async () => {
    const emptyA = await createDirect(env, 'Empty A', [])
    const emptyB = await createDirect(env, 'Empty B', [])
    const r = await get<{ data: ComparePriceListsResponse }>(
      env,
      `/compare?listAId=${emptyA}&listBId=${emptyB}`,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.rows).toEqual([])
    expect(r.body.data.summary.totalProducts).toBe(0)
    expect(r.body.data.summary.bothCount).toBe(0)
  })

  it('Sort theo productName ASC', async () => {
    const r = await get<{ data: ComparePriceListsResponse }>(
      env,
      `/compare?listAId=${aId}&listBId=${bId}`,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    const names = r.body.data.rows.map((row) => row.productName)
    const sorted = [...names].sort((a, b) => a.localeCompare(b, 'vi'))
    expect(names).toEqual(sorted)
  })
})

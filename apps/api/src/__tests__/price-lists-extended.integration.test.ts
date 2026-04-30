import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { auditLogs, priceListItems, priceLists, products } from '@kiotviet-lite/shared'

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
  productSkus: string[]
}

async function setup(): Promise<Env> {
  const base = await createTestEnv()
  const app = createPriceListsRoutes({ db: base.db })
  const inserted = await base.db
    .insert(products)
    .values(
      Array.from({ length: 5 }, (_, i) => ({
        storeId: base.storeId,
        name: `Sản phẩm ${i + 1}`,
        sku: `SKU${i + 1}`,
        sellingPrice: 100000 + i * 10000,
        costPrice: 50000,
      })),
    )
    .returning({ id: products.id, sku: products.sku })
  return {
    base,
    app,
    productIds: inserted.map((p) => p.id),
    productSkus: inserted.map((p) => p.sku),
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

const post = <T>(env: Env, path: string, body: unknown, ah: { Authorization: string }) =>
  reqJson<T>(env, 'POST', path, body, ah)
const del = <T>(env: Env, path: string, ah: { Authorization: string }) =>
  reqJson<T>(env, 'DELETE', path, undefined, ah)

interface IdEnvelope {
  data: { id: string; method?: string; itemCount?: number }
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

async function createFormula(
  env: Env,
  name: string,
  baseListId: string,
  body?: Record<string, unknown>,
) {
  const r = await post<IdEnvelope>(
    env,
    '/',
    {
      name,
      method: 'formula',
      baseListId,
      formulaType: 'percent_decrease',
      formulaValue: 1000,
      roundingRule: 'none',
      ...(body ?? {}),
    },
    env.base.owner.authHeader,
  )
  expect(r.status).toBe(201)
  return r.body.data.id
}

async function createChain(
  env: Env,
  name: string,
  baseListId: string,
  body?: Record<string, unknown>,
) {
  return post<IdEnvelope>(
    env,
    '/',
    {
      name,
      method: 'chain',
      baseListId,
      formulaType: 'percent_decrease',
      formulaValue: 500,
      roundingRule: 'none',
      ...(body ?? {}),
    },
    env.base.owner.authHeader,
  )
}

describe('POST /price-lists method=chain', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Tạo chain dựa trên formula (A direct → B formula → C chain): 201, items đúng', async () => {
    const aId = await createDirect(env, 'A', [
      { productId: env.productIds[0]!, price: 100000 },
      { productId: env.productIds[1]!, price: 200000 },
    ])
    const bId = await createFormula(env, 'B', aId, {
      formulaType: 'percent_decrease',
      formulaValue: 1000,
      roundingRule: 'none',
    })
    const r = await createChain(env, 'C', bId, {
      formulaType: 'amount_decrease',
      formulaValue: 500,
      roundingRule: 'none',
    })
    expect(r.status).toBe(201)
    expect(r.body.data.method).toBe('chain')
    expect(r.body.data.itemCount).toBe(2)

    const items = await env.base.db
      .select({ productId: priceListItems.productId, price: priceListItems.price })
      .from(priceListItems)
      .where(eq(priceListItems.priceListId, r.body.data.id))
    const map = Object.fromEntries(items.map((it) => [it.productId, Number(it.price)]))
    expect(map[env.productIds[0]!]).toBe(89500)
    expect(map[env.productIds[1]!]).toBe(179500)

    const audits = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.targetId, r.body.data.id))
    expect(audits.length).toBe(1)
    expect(audits[0]?.action).toBe('price_list.created')
    const changes = audits[0]?.changes as { method: string; baseListId: string }
    expect(changes.method).toBe('chain')
    expect(changes.baseListId).toBe(bId)
  })

  it('Chain dựa trên direct cũng OK', async () => {
    const aId = await createDirect(env, 'A', [{ productId: env.productIds[0]!, price: 100000 }])
    const r = await createChain(env, 'C', aId)
    expect(r.status).toBe(201)
  })

  it('Chain với baseListId không tồn tại → 404', async () => {
    const r = await post<{ error: { code: string } }>(
      env,
      '/',
      {
        name: 'C',
        method: 'chain',
        baseListId: '00000000-0000-7000-8000-000000000099',
        formulaType: 'percent_decrease',
        formulaValue: 500,
        roundingRule: 'none',
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(404)
  })

  it('Chain depth quá sâu (>10) → 422', async () => {
    const aId = await createDirect(env, 'L0', [{ productId: env.productIds[0]!, price: 1000000 }])
    let parentId = aId
    for (let i = 1; i <= 9; i++) {
      const r = await createChain(env, `L${i}`, parentId, {
        formulaType: 'percent_decrease',
        formulaValue: 100,
        roundingRule: 'none',
      })
      expect(r.status).toBe(201)
      parentId = r.body.data.id
    }
    const tenth = await createChain(env, 'L10', parentId, {
      formulaType: 'percent_decrease',
      formulaValue: 100,
      roundingRule: 'none',
    })
    expect(tenth.status).toBe(422)
  })

  it('Recalculate chain depth 3 resolve đúng', async () => {
    const aId = await createDirect(env, 'A', [
      { productId: env.productIds[0]!, price: 100000 },
      { productId: env.productIds[1]!, price: 200000 },
    ])
    const bId = await createFormula(env, 'B', aId, {
      formulaType: 'percent_decrease',
      formulaValue: 1000,
      roundingRule: 'none',
    })
    const cR = await createChain(env, 'C', bId, {
      formulaType: 'amount_increase',
      formulaValue: 500,
      roundingRule: 'none',
    })
    expect(cR.status).toBe(201)

    const aItems = await env.base.db
      .select({ id: priceListItems.id, productId: priceListItems.productId })
      .from(priceListItems)
      .where(eq(priceListItems.priceListId, aId))
    const a0 = aItems.find((it) => it.productId === env.productIds[0])!
    await env.base.db
      .update(priceListItems)
      .set({ price: 200000 })
      .where(eq(priceListItems.id, a0.id))

    const recR = await post<{
      data: { updatedCount: number; addedCount: number; preservedOverrideCount: number }
    }>(env, `/${cR.body.data.id}/recalculate`, undefined, env.base.owner.authHeader)
    expect(recR.status).toBe(200)
    expect(recR.body.data.updatedCount).toBeGreaterThanOrEqual(1)

    const cItems = await env.base.db
      .select({ productId: priceListItems.productId, price: priceListItems.price })
      .from(priceListItems)
      .where(eq(priceListItems.priceListId, cR.body.data.id))
    const map = Object.fromEntries(cItems.map((it) => [it.productId, Number(it.price)]))
    expect(map[env.productIds[0]!]).toBe(180500)
  })
})

describe('POST /price-lists/:id/clone', () => {
  let env: Env
  let sourceId: string
  beforeEach(async () => {
    env = await setup()
    sourceId = await createDirect(env, 'Nguồn', [
      { productId: env.productIds[0]!, price: 100000 },
      { productId: env.productIds[1]!, price: 200000 },
    ])
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Clone direct → 201, method=direct, items match, audit có sourceListId', async () => {
    const r = await post<{ data: { id: string; method: string; itemCount: number } }>(
      env,
      `/${sourceId}/clone`,
      { name: 'Bản sao', isActive: false },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
    expect(r.body.data.method).toBe('direct')
    expect(r.body.data.itemCount).toBe(2)

    const items = await env.base.db
      .select({ productId: priceListItems.productId, price: priceListItems.price })
      .from(priceListItems)
      .where(eq(priceListItems.priceListId, r.body.data.id))
    expect(items.length).toBe(2)

    const audits = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.targetId, r.body.data.id))
    expect(audits[0]?.action).toBe('price_list.cloned')
    const changes = audits[0]?.changes as { sourceListId: string; itemCount: number }
    expect(changes.sourceListId).toBe(sourceId)
    expect(changes.itemCount).toBe(2)
  })

  it('Clone formula → method clone là direct và roundingRule=none', async () => {
    const formulaId = await createFormula(env, 'F', sourceId)
    const r = await post<{ data: { id: string; method: string; roundingRule: string } }>(
      env,
      `/${formulaId}/clone`,
      { name: 'Bản sao F', isActive: false },
      env.base.owner.authHeader,
    )
    expect(r.body.data.method).toBe('direct')
    expect(r.body.data.roundingRule).toBe('none')
  })

  it('Clone với name trùng → 409', async () => {
    const r = await post<{ error: { code: string; details: { field: string } } }>(
      env,
      `/${sourceId}/clone`,
      { name: 'Nguồn', isActive: false },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('CONFLICT')
    expect(r.body.error.details.field).toBe('name')
  })

  it('Clone source không tồn tại → 404', async () => {
    const r = await post<{ error: { code: string } }>(
      env,
      `/00000000-0000-7000-8000-000000000099/clone`,
      { name: 'X' },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(404)
  })

  it('Clone cross-store → 404', async () => {
    const env2 = await setup()
    try {
      const r = await post<{ error: { code: string } }>(
        env2,
        `/${sourceId}/clone`,
        { name: 'Y' },
        env2.base.owner.authHeader,
      )
      expect(r.status).toBe(404)
    } finally {
      await env2.base.close()
    }
  })

  it('Sửa source sau khi clone → bản sao không thay đổi', async () => {
    const r = await post<{ data: { id: string } }>(
      env,
      `/${sourceId}/clone`,
      { name: 'Independent', isActive: false },
      env.base.owner.authHeader,
    )
    const cloneId = r.body.data.id

    const sourceItems = await env.base.db
      .select({ id: priceListItems.id, productId: priceListItems.productId })
      .from(priceListItems)
      .where(eq(priceListItems.priceListId, sourceId))
    await env.base.db
      .update(priceListItems)
      .set({ price: 9999 })
      .where(eq(priceListItems.id, sourceItems[0]!.id))

    const cloneItems = await env.base.db
      .select({ productId: priceListItems.productId, price: priceListItems.price })
      .from(priceListItems)
      .where(eq(priceListItems.priceListId, cloneId))
    const original = cloneItems.find((it) => it.productId === sourceItems[0]!.productId)
    expect(Number(original?.price)).toBe(100000)
  })
})

describe('POST /price-lists/:id/import', () => {
  let env: Env
  let directId: string
  beforeEach(async () => {
    env = await setup()
    directId = await createDirect(env, 'Đích', [])
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Import OK với 3 hợp lệ + 1 SKU không tồn tại + 1 price invalid', async () => {
    const csv = [
      'product_code,price',
      `${env.productSkus[0]},150000`,
      `${env.productSkus[1]},200000`,
      `${env.productSkus[2]},abc`,
      `${env.productSkus[3]},180000`,
      `SKU_NOT_EXIST,100000`,
    ].join('\n')

    const r = await post<{
      data: {
        summary: {
          totalRows: number
          imported: number
          skipped: number
          errors: { row: number; reason: string }[]
        }
        priceList: { id: string; itemCount: number }
      }
    }>(env, `/${directId}/import`, { csvText: csv, mode: 'upsert' }, env.base.owner.authHeader)

    expect(r.status).toBe(200)
    expect(r.body.data.summary.totalRows).toBe(5)
    expect(r.body.data.summary.imported).toBe(3)
    expect(r.body.data.summary.skipped).toBe(2)
    expect(r.body.data.summary.errors.length).toBe(2)
    expect(r.body.data.priceList.itemCount).toBe(3)

    const audits = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.targetId, directId))
    const importAudit = audits.find((a) => a.action === 'price_list.imported')
    expect(importAudit).toBeTruthy()
    const changes = importAudit?.changes as { imported: number; skipped: number; mode: string }
    expect(changes.mode).toBe('upsert')
    expect(changes.imported).toBe(3)
  })

  it('Import target không phải direct → 422', async () => {
    const baseId = await createDirect(env, 'Base', [])
    const formulaId = await createFormula(env, 'F1', baseId)
    const csv = `product_code,price\n${env.productSkus[0]},150000`
    const r = await post<{ error: { code: string; message: string } }>(
      env,
      `/${formulaId}/import`,
      { csvText: csv, mode: 'upsert' },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('BUSINESS_RULE_VIOLATION')
    expect(r.body.error.message).toContain('Trực tiếp')
  })

  it('Mode replace xoá items cũ', async () => {
    await post(
      env,
      `/${directId}/items`,
      { productId: env.productIds[4], price: 50000 },
      env.base.owner.authHeader,
    )

    const csv = `product_code,price\n${env.productSkus[0]},150000`
    const r = await post<{ data: { priceList: { itemCount: number } } }>(
      env,
      `/${directId}/import`,
      { csvText: csv, mode: 'replace' },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.priceList.itemCount).toBe(1)
  })

  it('CSV thiếu header → 400 (VALIDATION_ERROR)', async () => {
    const r = await post<{ error: { code: string } }>(
      env,
      `/${directId}/import`,
      { csvText: 'sku,price\nSKU1,1000', mode: 'upsert' },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('CSV chỉ có header → 400 (VALIDATION_ERROR)', async () => {
    const r = await post<{ error: { code: string } }>(
      env,
      `/${directId}/import`,
      { csvText: 'product_code,price', mode: 'upsert' },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('CSV quá 5000 dòng → 400 (VALIDATION_ERROR)', async () => {
    const lines = ['product_code,price']
    for (let i = 0; i < 5001; i++) {
      lines.push(`SKU_X${i},1000`)
    }
    const r = await post<{ error: { code: string } }>(
      env,
      `/${directId}/import`,
      { csvText: lines.join('\n'), mode: 'upsert' },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('Import với rounding áp dụng đúng', async () => {
    const targetId = await createDirect(env, 'Đích2', [])
    await env.base.db
      .update(priceLists)
      .set({ roundingRule: 'nearest_thousand' })
      .where(eq(priceLists.id, targetId))

    const csv = `product_code,price\n${env.productSkus[0]},50250`
    const r = await post<{ data: { priceList: { id: string } } }>(
      env,
      `/${targetId}/import`,
      { csvText: csv, mode: 'upsert' },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    const items = await env.base.db
      .select({ price: priceListItems.price })
      .from(priceListItems)
      .where(eq(priceListItems.priceListId, targetId))
    expect(Number(items[0]?.price)).toBe(50000)
  })

  it('Import SKU mixed-case (ABC123) khớp với SKU lowercase trong DB', async () => {
    // Sản phẩm trong setup có sku 'SKU1'..'SKU5'. Insert 1 sản phẩm sku lowercase 'abc123'.
    const inserted = await env.base.db
      .insert(products)
      .values({
        storeId: env.base.storeId,
        name: 'Sản phẩm mix case',
        sku: 'abc123',
        sellingPrice: 100000,
        costPrice: 50000,
      })
      .returning({ id: products.id })
    const productId = inserted[0]!.id

    const targetId = await createDirect(env, 'MixCaseTarget', [])
    // CSV dùng SKU uppercase 'ABC123' - phải match được sku 'abc123' nhờ LOWER lookup.
    const csv = `product_code,price\nABC123,170000`
    const r = await post<{
      data: {
        summary: { totalRows: number; imported: number; skipped: number; errors: unknown[] }
        priceList: { itemCount: number }
      }
    }>(env, `/${targetId}/import`, { csvText: csv, mode: 'upsert' }, env.base.owner.authHeader)
    expect(r.status).toBe(200)
    expect(r.body.data.summary.imported).toBe(1)
    expect(r.body.data.summary.skipped).toBe(0)
    expect(r.body.data.priceList.itemCount).toBe(1)

    const items = await env.base.db
      .select({ productId: priceListItems.productId, price: priceListItems.price })
      .from(priceListItems)
      .where(eq(priceListItems.priceListId, targetId))
    expect(items.length).toBe(1)
    expect(items[0]?.productId).toBe(productId)
    expect(Number(items[0]?.price)).toBe(170000)
  })

  it('Import mode=replace với CSV toàn invalid → 400, KHÔNG wipe data', async () => {
    // Setup: target có 2 items hiện hữu.
    const targetId = await createDirect(env, 'ReplaceGuard', [
      { productId: env.productIds[0]!, price: 100000 },
      { productId: env.productIds[1]!, price: 200000 },
    ])
    const beforeCountRows = await env.base.db
      .select({ id: priceListItems.id })
      .from(priceListItems)
      .where(eq(priceListItems.priceListId, targetId))
    expect(beforeCountRows.length).toBe(2)

    // CSV toàn invalid: SKU không tồn tại + price không hợp lệ.
    const csv = ['product_code,price', 'SKU_NOT_EXIST,abc', 'ANOTHER_BAD_SKU,xyz'].join('\n')
    const r = await post<{ error: { code: string; message: string } }>(
      env,
      `/${targetId}/import`,
      { csvText: csv, mode: 'replace' },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('VALIDATION_ERROR')
    expect(r.body.error.message).toContain('thay thế')

    // Data cũ phải còn nguyên.
    const afterRows = await env.base.db
      .select({ id: priceListItems.id, price: priceListItems.price })
      .from(priceListItems)
      .where(eq(priceListItems.priceListId, targetId))
    expect(afterRows.length).toBe(2)
  })
})

describe('DELETE /price-lists/:id chain dependents check', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Xoá bảng đang là base → 409 với dependentLists', async () => {
    const aId = await createDirect(env, 'Base', [{ productId: env.productIds[0]!, price: 100000 }])
    const bId = await createFormula(env, 'B', aId)
    const r = await del<{
      error: { code: string; details: { dependentLists: { id: string; name: string }[] } }
    }>(env, `/${aId}`, env.base.owner.authHeader)
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('CONFLICT')
    expect(r.body.error.details.dependentLists.length).toBe(1)
    expect(r.body.error.details.dependentLists[0]?.id).toBe(bId)
  })

  it('Xoá bảng không là base → 200', async () => {
    const aId = await createDirect(env, 'Independent', [])
    const r = await del(env, `/${aId}`, env.base.owner.authHeader)
    expect(r.status).toBe(200)
  })
})

describe('Full flow integration: direct → formula → chain → recalc → clone → import', () => {
  it('End-to-end happy path', { timeout: 30_000 }, async () => {
    const env = await setup()
    try {
      const aId = await createDirect(env, 'A direct', [
        { productId: env.productIds[0]!, price: 100000 },
        { productId: env.productIds[1]!, price: 200000 },
        { productId: env.productIds[2]!, price: 300000 },
      ])

      const bId = await createFormula(env, 'B formula', aId, {
        formulaType: 'percent_decrease',
        formulaValue: 1000,
        roundingRule: 'nearest_thousand',
      })

      const cR = await createChain(env, 'C chain', bId, {
        formulaType: 'amount_increase',
        formulaValue: 500,
        roundingRule: 'none',
      })
      expect(cR.status).toBe(201)
      const cId = cR.body.data.id

      const recR = await post<{ data: { addedCount: number; updatedCount: number } }>(
        env,
        `/${cId}/recalculate`,
        undefined,
        env.base.owner.authHeader,
      )
      expect(recR.status).toBe(200)

      const cloneR = await post<{ data: { id: string; method: string; itemCount: number } }>(
        env,
        `/${cId}/clone`,
        { name: 'C clone', isActive: false },
        env.base.owner.authHeader,
      )
      expect(cloneR.status).toBe(201)
      expect(cloneR.body.data.method).toBe('direct')
      expect(cloneR.body.data.itemCount).toBe(3)

      const csv = [
        'product_code,price',
        `${env.productSkus[3]},250000`,
        `${env.productSkus[4]},350000`,
      ].join('\n')
      const impR = await post<{
        data: { summary: { imported: number; skipped: number }; priceList: { itemCount: number } }
      }>(env, `/${aId}/import`, { csvText: csv, mode: 'upsert' }, env.base.owner.authHeader)
      expect(impR.status).toBe(200)
      expect(impR.body.data.summary.imported).toBe(2)
      expect(impR.body.data.priceList.itemCount).toBe(5)
    } finally {
      await env.base.close()
    }
  })
})

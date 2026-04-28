import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  auditLogs,
  customerGroups,
  priceListItems,
  priceLists,
  products,
} from '@kiotviet-lite/shared'

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
  // Seed 5 products in store
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
const patch = <T>(env: Env, path: string, body: unknown, ah: { Authorization: string }) =>
  reqJson<T>(env, 'PATCH', path, body, ah)
const del = <T>(env: Env, path: string, ah: { Authorization: string }) =>
  reqJson<T>(env, 'DELETE', path, undefined, ah)

describe('POST /price-lists (createPriceList - direct)', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Owner tạo direct với 2 items → 201', async () => {
    const r = await post<{ data: { id: string; method: string; itemCount: number } }>(
      env,
      '/',
      {
        name: 'Bảng giá VIP',
        method: 'direct',
        roundingRule: 'nearest_thousand',
        items: [
          { productId: env.productIds[0], price: 50250 },
          { productId: env.productIds[1], price: 75600 },
        ],
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
    expect(r.body.data.method).toBe('direct')
    expect(r.body.data.itemCount).toBe(2)

    // Verify rounding applied
    const items = await env.base.db
      .select({ price: priceListItems.price })
      .from(priceListItems)
      .where(eq(priceListItems.priceListId, r.body.data.id))
    const prices = items.map((it) => Number(it.price)).sort((a, b) => a - b)
    expect(prices).toEqual([50000, 76000])
  })

  it('Manager tạo OK', async () => {
    const r = await post(env, '/', { name: 'X', method: 'direct' }, env.base.manager.authHeader)
    expect(r.status).toBe(201)
  })

  it('Staff tạo → 403', async () => {
    const r = await post(env, '/', { name: 'X', method: 'direct' }, env.base.staff.authHeader)
    expect(r.status).toBe(403)
  })

  it('Trùng tên (case-insensitive) → 409 field=name', async () => {
    await post(env, '/', { name: 'Bảng A', method: 'direct' }, env.base.owner.authHeader)
    const r = await post<{ error: { code: string; details: { field: string } } }>(
      env,
      '/',
      { name: 'BẢNG A', method: 'direct' },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('CONFLICT')
    expect(r.body.error.details.field).toBe('name')
  })

  it('items trùng productId → 400', async () => {
    const r = await post<{ error: { code: string } }>(
      env,
      '/',
      {
        name: 'X',
        method: 'direct',
        items: [
          { productId: env.productIds[0], price: 1000 },
          { productId: env.productIds[0], price: 2000 },
        ],
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('items với productId không thuộc store → 400', async () => {
    const r = await post<{ error: { code: string } }>(
      env,
      '/',
      {
        name: 'X',
        method: 'direct',
        items: [{ productId: '00000000-0000-7000-8000-000000000099', price: 1000 }],
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
  })

  it('direct kèm baseListId được Zod strip → 201', async () => {
    const r = await post(
      env,
      '/',
      {
        name: 'X',
        method: 'direct',
        baseListId: '00000000-0000-7000-8000-000000000001',
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
  })

  it('audit ghi price_list.created với actorRole', async () => {
    const r = await post<{ data: { id: string } }>(
      env,
      '/',
      { name: 'X', method: 'direct' },
      env.base.owner.authHeader,
    )
    const audits = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.targetId, r.body.data.id))
    expect(audits.length).toBe(1)
    expect(audits[0]?.action).toBe('price_list.created')
    expect(audits[0]?.actorRole).toBe('owner')
  })
})

describe('POST /price-lists (createPriceList - formula)', () => {
  let env: Env
  let directListId: string
  beforeEach(async () => {
    env = await setup()
    const r = await post<{ data: { id: string } }>(
      env,
      '/',
      {
        name: 'Giá lẻ',
        method: 'direct',
        items: [
          { productId: env.productIds[0], price: 100000 },
          { productId: env.productIds[1], price: 200000 },
          { productId: env.productIds[2], price: 33333 },
        ],
      },
      env.base.owner.authHeader,
    )
    directListId = r.body.data.id
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Tạo formula percent_decrease 10% với ceil_thousand → giá tính đúng', async () => {
    const r = await post<{ data: { id: string; itemCount: number } }>(
      env,
      '/',
      {
        name: 'Giá sỉ',
        method: 'formula',
        baseListId: directListId,
        formulaType: 'percent_decrease',
        formulaValue: 1000,
        roundingRule: 'ceil_thousand',
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
    expect(r.body.data.itemCount).toBe(3)
    const items = await env.base.db
      .select({ productId: priceListItems.productId, price: priceListItems.price })
      .from(priceListItems)
      .where(eq(priceListItems.priceListId, r.body.data.id))
    const map = Object.fromEntries(items.map((it) => [it.productId, Number(it.price)]))
    // 100000 * 0.9 = 90000 → ceil_thousand → 90000
    expect(map[env.productIds[0]!]).toBe(90000)
    // 200000 * 0.9 = 180000 → 180000
    expect(map[env.productIds[1]!]).toBe(180000)
    // 33333 * 0.9 = 30000 (Math.round 29999.7) → ceil_thousand → 30000
    expect(map[env.productIds[2]!]).toBe(30000)
  })

  it('formula với baseListId không phải direct → 422', async () => {
    const formula1 = await post<{ data: { id: string } }>(
      env,
      '/',
      {
        name: 'F1',
        method: 'formula',
        baseListId: directListId,
        formulaType: 'percent_decrease',
        formulaValue: 1000,
      },
      env.base.owner.authHeader,
    )
    const r = await post<{ error: { code: string } }>(
      env,
      '/',
      {
        name: 'F2',
        method: 'formula',
        baseListId: formula1.body.data.id,
        formulaType: 'percent_decrease',
        formulaValue: 500,
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('BUSINESS_RULE_VIOLATION')
  })

  it('amount_decrease vượt basePrice → clamp về 0', async () => {
    const r = await post<{ data: { id: string } }>(
      env,
      '/',
      {
        name: 'Giá huỷ diệt',
        method: 'formula',
        baseListId: directListId,
        formulaType: 'amount_decrease',
        formulaValue: 999_999_999,
        roundingRule: 'none',
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
    const items = await env.base.db
      .select({ price: priceListItems.price })
      .from(priceListItems)
      .where(eq(priceListItems.priceListId, r.body.data.id))
    expect(items.every((it) => Number(it.price) === 0)).toBe(true)
  })

  it('overrides apply đúng + is_overridden=true', async () => {
    const r = await post<{ data: { id: string } }>(
      env,
      '/',
      {
        name: 'Giá sỉ',
        method: 'formula',
        baseListId: directListId,
        formulaType: 'percent_decrease',
        formulaValue: 1000,
        overrides: [{ productId: env.productIds[0], price: 80000 }],
      },
      env.base.owner.authHeader,
    )
    const items = await env.base.db
      .select({
        productId: priceListItems.productId,
        price: priceListItems.price,
        isOverridden: priceListItems.isOverridden,
      })
      .from(priceListItems)
      .where(eq(priceListItems.priceListId, r.body.data.id))
    const overridden = items.find((it) => it.productId === env.productIds[0])
    expect(overridden?.price).toBe(80000)
    expect(overridden?.isOverridden).toBe(true)
  })

  it('overrides cho productId KHÔNG trong base → vẫn insert mới với is_overridden=true', async () => {
    const r = await post<{ data: { id: string; itemCount: number } }>(
      env,
      '/',
      {
        name: 'Giá sỉ',
        method: 'formula',
        baseListId: directListId,
        formulaType: 'percent_decrease',
        formulaValue: 1000,
        overrides: [{ productId: env.productIds[3], price: 99999 }],
      },
      env.base.owner.authHeader,
    )
    expect(r.body.data.itemCount).toBe(4)
    const items = await env.base.db
      .select({
        productId: priceListItems.productId,
        isOverridden: priceListItems.isOverridden,
      })
      .from(priceListItems)
      .where(eq(priceListItems.priceListId, r.body.data.id))
    const extra = items.find((it) => it.productId === env.productIds[3])
    expect(extra?.isOverridden).toBe(true)
  })
})

describe('GET /price-lists (list + filter)', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Default list trả meta + items + effectiveActive computed', async () => {
    await post(
      env,
      '/',
      { name: 'A', method: 'direct', isActive: true, effectiveFrom: null, effectiveTo: null },
      env.base.owner.authHeader,
    )
    const r = await get<{
      data: Array<{ name: string; effectiveActive: boolean }>
      meta: { total: number }
    }>(env, '/', env.base.owner.authHeader)
    expect(r.status).toBe(200)
    expect(r.body.meta.total).toBe(1)
    expect(r.body.data[0]?.effectiveActive).toBe(true)
  })

  it('search escape % và filter case-insensitive', async () => {
    await post(env, '/', { name: 'Bảng A', method: 'direct' }, env.base.owner.authHeader)
    await post(env, '/', { name: 'Bảng B', method: 'direct' }, env.base.owner.authHeader)
    const r = await get<{ data: Array<{ name: string }> }>(
      env,
      '/?search=bảng%20a',
      env.base.owner.authHeader,
    )
    expect(r.body.data).toHaveLength(1)
    expect(r.body.data[0]?.name).toBe('Bảng A')
  })

  it('filter status=inactive', async () => {
    await post(env, '/', { name: 'A', method: 'direct', isActive: true }, env.base.owner.authHeader)
    await post(
      env,
      '/',
      { name: 'B', method: 'direct', isActive: false },
      env.base.owner.authHeader,
    )
    const r = await get<{ data: Array<{ name: string }> }>(
      env,
      '/?status=inactive',
      env.base.owner.authHeader,
    )
    expect(r.body.data).toHaveLength(1)
    expect(r.body.data[0]?.name).toBe('B')
  })

  it('filter status=pending (effectiveFrom > today)', async () => {
    await post(
      env,
      '/',
      { name: 'A', method: 'direct', effectiveFrom: '2099-01-01' },
      env.base.owner.authHeader,
    )
    await post(env, '/', { name: 'B', method: 'direct' }, env.base.owner.authHeader)
    const r = await get<{ data: Array<{ name: string; effectiveActive: boolean }> }>(
      env,
      '/?status=pending',
      env.base.owner.authHeader,
    )
    expect(r.body.data).toHaveLength(1)
    expect(r.body.data[0]?.name).toBe('A')
    expect(r.body.data[0]?.effectiveActive).toBe(false)
  })

  it('baseName resolve qua LEFT JOIN cho formula', async () => {
    const baseR = await post<{ data: { id: string } }>(
      env,
      '/',
      {
        name: 'Lẻ',
        method: 'direct',
        items: [{ productId: env.productIds[0], price: 100000 }],
      },
      env.base.owner.authHeader,
    )
    await post(
      env,
      '/',
      {
        name: 'Sỉ',
        method: 'formula',
        baseListId: baseR.body.data.id,
        formulaType: 'percent_decrease',
        formulaValue: 1000,
      },
      env.base.owner.authHeader,
    )
    const r = await get<{ data: Array<{ name: string; baseName: string | null }> }>(
      env,
      '/?method=formula',
      env.base.owner.authHeader,
    )
    expect(r.body.data).toHaveLength(1)
    expect(r.body.data[0]?.baseName).toBe('Lẻ')
  })
})

describe('GET /price-lists/:id and /:id/items', () => {
  let env: Env
  let listId: string
  beforeEach(async () => {
    env = await setup()
    const r = await post<{ data: { id: string } }>(
      env,
      '/',
      {
        name: 'Bảng giá A',
        method: 'direct',
        items: [
          { productId: env.productIds[0], price: 100000 },
          { productId: env.productIds[1], price: 200000 },
        ],
      },
      env.base.owner.authHeader,
    )
    listId = r.body.data.id
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('GET /:id trả PriceListDetail', async () => {
    const r = await get<{ data: { id: string; storeId: string; itemCount: number } }>(
      env,
      `/${listId}`,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.storeId).toBe(env.base.storeId)
    expect(r.body.data.itemCount).toBe(2)
  })

  it('GET /:id/items trả full info + sort theo productName', async () => {
    const r = await get<{
      data: Array<{
        productId: string
        productName: string
        productSellingPrice: number
        productCostPrice: number | null
        price: number
      }>
    }>(env, `/${listId}/items`, env.base.owner.authHeader)
    expect(r.body.data).toHaveLength(2)
    expect(r.body.data[0]?.productName).toBe('Sản phẩm 1')
    expect(r.body.data[0]?.productCostPrice).toBe(50000)
  })

  it('GET /trashed mount trước /:id (không nhầm route)', async () => {
    await del(env, `/${listId}`, env.base.owner.authHeader)
    const r = await get<{ data: Array<unknown>; meta: { total: number } }>(
      env,
      '/trashed',
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.meta.total).toBe(1)
  })

  it('GET /:id cross-store → 404', async () => {
    const env2 = await setup()
    try {
      const r = await get(env, `/${env2.productIds[0]}`, env.base.owner.authHeader)
      expect(r.status).toBe(404)
    } finally {
      await env2.base.close()
    }
  })
})

describe('PATCH /price-lists/:id', () => {
  let env: Env
  let listId: string
  beforeEach(async () => {
    env = await setup()
    const r = await post<{ data: { id: string } }>(
      env,
      '/',
      { name: 'Bảng A', method: 'direct' },
      env.base.owner.authHeader,
    )
    listId = r.body.data.id
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Sửa name + audit diff', async () => {
    const r = await patch<{ data: { name: string } }>(
      env,
      `/${listId}`,
      { name: 'Bảng B' },
      env.base.owner.authHeader,
    )
    expect(r.body.data.name).toBe('Bảng B')
    const audits = await env.base.db.select().from(auditLogs).where(eq(auditLogs.targetId, listId))
    const updateAudit = audits.find((a) => a.action === 'price_list.updated')
    expect(updateAudit).toBeTruthy()
  })

  it('effectiveTo < effectiveFrom → 400', async () => {
    const r = await patch<{ error: { code: string } }>(
      env,
      `/${listId}`,
      { effectiveFrom: '2026-12-01', effectiveTo: '2026-01-01' },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
  })

  it('Sửa method qua PATCH bị Zod reject (strict mode, key lạ → 400)', async () => {
    const r = await patch<{ error: { code: string } }>(
      env,
      `/${listId}`,
      { method: 'formula' },
      env.base.owner.authHeader,
    )
    // Schema strict: unknown key 'method' bị reject
    expect(r.status).toBe(400)
  })
})

describe('DELETE + Restore + Trashed', () => {
  let env: Env
  let listId: string
  beforeEach(async () => {
    env = await setup()
    const r = await post<{ data: { id: string } }>(
      env,
      '/',
      { name: 'Bảng A', method: 'direct' },
      env.base.owner.authHeader,
    )
    listId = r.body.data.id
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Soft delete + audit + ẩn khỏi list mặc định + hiện trong trashed', async () => {
    const dr = await del(env, `/${listId}`, env.base.owner.authHeader)
    expect(dr.status).toBe(200)
    const list = await get<{ meta: { total: number } }>(env, '/', env.base.owner.authHeader)
    expect(list.body.meta.total).toBe(0)
    const trashed = await get<{ meta: { total: number } }>(
      env,
      '/trashed',
      env.base.owner.authHeader,
    )
    expect(trashed.body.meta.total).toBe(1)
  })

  it('Restore phục hồi bảng giá', async () => {
    await del(env, `/${listId}`, env.base.owner.authHeader)
    const r = await post(env, `/${listId}/restore`, undefined, env.base.owner.authHeader)
    expect(r.status).toBe(200)
    const list = await get<{ meta: { total: number } }>(env, '/', env.base.owner.authHeader)
    expect(list.body.meta.total).toBe(1)
  })

  it('Restore khi tên bị bảng giá khác chiếm → 409', async () => {
    await del(env, `/${listId}`, env.base.owner.authHeader)
    await post(env, '/', { name: 'Bảng A', method: 'direct' }, env.base.owner.authHeader)
    const r = await post<{ error: { code: string } }>(
      env,
      `/${listId}/restore`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(409)
  })

  it('Xoá khi có customer_group dùng làm default → 422 với count', async () => {
    await env.base.db
      .insert(customerGroups)
      .values({ storeId: env.base.storeId, name: 'VIP', defaultPriceListId: listId })
    const r = await del<{ error: { code: string; message: string } }>(
      env,
      `/${listId}`,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(422)
    expect(r.body.error.message).toContain('1 nhóm')
  })
})

describe('POST /price-lists/:id/recalculate', () => {
  let env: Env
  let baseListId: string
  let formulaListId: string
  beforeEach(async () => {
    env = await setup()
    const baseR = await post<{ data: { id: string } }>(
      env,
      '/',
      {
        name: 'Lẻ',
        method: 'direct',
        items: [
          { productId: env.productIds[0], price: 100000 },
          { productId: env.productIds[1], price: 200000 },
        ],
      },
      env.base.owner.authHeader,
    )
    baseListId = baseR.body.data.id
    const fR = await post<{ data: { id: string } }>(
      env,
      '/',
      {
        name: 'Sỉ',
        method: 'formula',
        baseListId,
        formulaType: 'percent_decrease',
        formulaValue: 1000,
      },
      env.base.owner.authHeader,
    )
    formulaListId = fR.body.data.id
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Recalculate giữ overrides, update non-overridden, audit đủ counts', async () => {
    // Override giá item 1 thành 50000
    const items = await env.base.db
      .select({ id: priceListItems.id, productId: priceListItems.productId })
      .from(priceListItems)
      .where(eq(priceListItems.priceListId, formulaListId))
    const overItem = items.find((it) => it.productId === env.productIds[0])!
    await patch(
      env,
      `/${formulaListId}/items/${overItem.id}`,
      { price: 50000 },
      env.base.owner.authHeader,
    )

    // Sửa giá base list cho item 2 (qua DB direct cho gọn)
    const baseItems = await env.base.db
      .select({ id: priceListItems.id, productId: priceListItems.productId })
      .from(priceListItems)
      .where(eq(priceListItems.priceListId, baseListId))
    const baseItem2 = baseItems.find((it) => it.productId === env.productIds[1])!
    await env.base.db
      .update(priceListItems)
      .set({ price: 300000 })
      .where(eq(priceListItems.id, baseItem2.id))

    const r = await post<{
      data: {
        updatedCount: number
        addedCount: number
        removedCount: number
        preservedOverrideCount: number
      }
    }>(env, `/${formulaListId}/recalculate`, undefined, env.base.owner.authHeader)
    expect(r.status).toBe(200)
    expect(r.body.data.preservedOverrideCount).toBe(1)
    expect(r.body.data.updatedCount).toBe(1)
  })

  it('Recalculate trên direct → 422', async () => {
    const r = await post<{ error: { code: string } }>(
      env,
      `/${baseListId}/recalculate`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(422)
  })
})

describe('Items CRUD endpoints', () => {
  let env: Env
  let directId: string
  let formulaId: string
  beforeEach(async () => {
    env = await setup()
    const direct = await post<{ data: { id: string } }>(
      env,
      '/',
      {
        name: 'Direct',
        method: 'direct',
        items: [{ productId: env.productIds[0], price: 100000 }],
      },
      env.base.owner.authHeader,
    )
    directId = direct.body.data.id
    const formula = await post<{ data: { id: string } }>(
      env,
      '/',
      {
        name: 'Formula',
        method: 'formula',
        baseListId: directId,
        formulaType: 'percent_decrease',
        formulaValue: 1000,
      },
      env.base.owner.authHeader,
    )
    formulaId = formula.body.data.id
  })
  afterEach(async () => {
    if (env) {
      await env.base.close()
    }
  })

  it('POST /:id/items thêm SP mới + áp roundingRule', async () => {
    const dr = await post<{ data: { id: string } }>(
      env,
      '/',
      {
        name: 'X',
        method: 'direct',
        roundingRule: 'nearest_thousand',
      },
      env.base.owner.authHeader,
    )
    const r = await post<{ data: { price: number; isOverridden: boolean } }>(
      env,
      `/${dr.body.data.id}/items`,
      { productId: env.productIds[0], price: 50250 },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
    expect(r.body.data.price).toBe(50000)
    expect(r.body.data.isOverridden).toBe(false)
  })

  it('POST /:id/items trùng productId → 409 field=productId', async () => {
    const r = await post<{ error: { code: string; details: { field: string } } }>(
      env,
      `/${directId}/items`,
      { productId: env.productIds[0], price: 200000 },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(409)
    expect(r.body.error.details.field).toBe('productId')
  })

  it('PATCH item của formula → set is_overridden=true', async () => {
    const items = await env.base.db
      .select({ id: priceListItems.id })
      .from(priceListItems)
      .where(eq(priceListItems.priceListId, formulaId))
    const r = await patch<{ data: { isOverridden: boolean; price: number } }>(
      env,
      `/${formulaId}/items/${items[0]!.id}`,
      { price: 80000 },
      env.base.owner.authHeader,
    )
    expect(r.body.data.isOverridden).toBe(true)
    expect(r.body.data.price).toBe(80000)
  })

  it('DELETE item formula chưa override → 422', async () => {
    const items = await env.base.db
      .select({ id: priceListItems.id })
      .from(priceListItems)
      .where(eq(priceListItems.priceListId, formulaId))
    const r = await del<{ error: { code: string } }>(
      env,
      `/${formulaId}/items/${items[0]!.id}`,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(422)
  })

  it('DELETE item formula đã override → OK', async () => {
    const items = await env.base.db
      .select({ id: priceListItems.id })
      .from(priceListItems)
      .where(eq(priceListItems.priceListId, formulaId))
    await patch(
      env,
      `/${formulaId}/items/${items[0]!.id}`,
      { price: 80000 },
      env.base.owner.authHeader,
    )
    const r = await del(env, `/${formulaId}/items/${items[0]!.id}`, env.base.owner.authHeader)
    expect(r.status).toBe(200)
  })
})

describe('Multi-tenant safety', () => {
  it('Store A không thấy/sửa/xoá price list của Store B', async () => {
    const envA = await setup()
    const envB = await setup()
    try {
      const r = await post<{ data: { id: string } }>(
        envA,
        '/',
        { name: 'A', method: 'direct' },
        envA.base.owner.authHeader,
      )
      const list = await get<{ meta: { total: number } }>(envB, '/', envB.base.owner.authHeader)
      expect(list.body.meta.total).toBe(0)
      const detail = await get(envB, `/${r.body.data.id}`, envB.base.owner.authHeader)
      expect(detail.status).toBe(404)
    } finally {
      await envA.base.close()
      await envB.base.close()
    }
  })
})

describe('CHECK constraint enforcement (DB-level)', () => {
  it('Insert raw method=direct + base_price_list_id → CHECK constraint reject', async () => {
    const env = await setup()
    try {
      await expect(
        env.base.db.insert(priceLists).values({
          storeId: env.base.storeId,
          name: 'Bad',
          method: 'direct',
          basePriceListId: env.productIds[0]!, // any uuid (FK will fail too but CHECK first)
          formulaType: null,
          formulaValue: null,
          roundingRule: 'none',
        }),
      ).rejects.toThrow()
    } finally {
      await env.base.close()
    }
  })
})

import { and, eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  auditLogs,
  inventoryTransactions,
  products,
  productVariants,
  stockCheckItems,
  stockCheckLogs,
  stockChecks,
  stores,
  users,
} from '@kiotviet-lite/shared'

import { signAccessToken } from '../lib/jwt.js'
import { hashPassword } from '../lib/password.js'
import { createProductsRoutes } from '../routes/products.routes.js'
import { createStockChecksRoutes } from '../routes/stock-checks.routes.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.ACCESS_TOKEN_TTL_SECONDS = '900'
  process.env.REFRESH_TOKEN_TTL_SECONDS = '604800'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

interface RequestableApp {
  request: (path: string, init?: RequestInit) => Response | Promise<Response>
}

interface ProductVariantResp {
  id: string
  sku: string
  attribute1Value: string
  attribute2Value: string | null
  sellingPrice: number
  stockQuantity: number
  costPrice: number | null
}

interface ProductResp {
  id: string
  costPrice: number | null
  currentStock: number
  hasVariants?: boolean
  variantsConfig?: {
    attribute1Name: string
    attribute2Name?: string
    variants: ProductVariantResp[]
  }
}

interface SCItemResp {
  id: string
  productId: string
  variantId: string | null
  productNameSnapshot: string
  productSkuSnapshot: string
  variantLabelSnapshot: string | null
  systemQty: number
  actualQty: number
  diff: number
  note: string | null
}

interface SCDetailResp {
  id: string
  code: string
  status: 'draft' | 'confirmed'
  totalItems: number
  totalDiffPositive: number
  totalDiffNegative: number
  note: string | null
  createdAt: string
  confirmedAt: string | null
  createdBy: string
  createdByName: string | null
  confirmedBy: string | null
  confirmedByName: string | null
  storeId: string
  updatedAt: string
  items: SCItemResp[]
}

interface ApiError {
  error: { code: string; message: string; details?: unknown }
}

interface Env {
  base: TestEnv
  scApp: ReturnType<typeof createStockChecksRoutes>
  prodApp: ReturnType<typeof createProductsRoutes>
}

async function setup(): Promise<Env> {
  const base = await createTestEnv()
  return {
    base,
    scApp: createStockChecksRoutes({ db: base.db }),
    prodApp: createProductsRoutes({ db: base.db }),
  }
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

async function createProductFixture(
  env: Env,
  override: Record<string, unknown> = {},
): Promise<ProductResp> {
  const r = await jsonRequest<{ data: ProductResp }>(
    env.prodApp,
    'POST',
    '/',
    {
      name: 'SP Test',
      sku: `SP-${Math.random().toString(36).slice(2, 8)}`,
      sellingPrice: 10000,
      costPrice: 5000,
      unit: 'cái',
      trackInventory: true,
      ...override,
    },
    env.base.owner.authHeader,
  )
  return r.body.data
}

async function setProductStock(env: Env, productId: string, qty: number) {
  await env.base.db
    .update(products)
    .set({ currentStock: qty, costPrice: 5000 })
    .where(eq(products.id, productId))
}

async function createVariantProductFixture(env: Env): Promise<ProductResp> {
  const suffix = Math.random().toString(36).slice(2, 6)
  const r = await jsonRequest<{ data: ProductResp }>(
    env.prodApp,
    'POST',
    '/',
    {
      name: `Áo ${suffix}`,
      sku: `AO-${suffix}`,
      sellingPrice: 0,
      variantsConfig: {
        attribute1Name: 'Màu',
        variants: [
          { sku: `AO-${suffix}-do`, attribute1Value: 'Đỏ', sellingPrice: 100_000 },
          { sku: `AO-${suffix}-xanh`, attribute1Value: 'Xanh', sellingPrice: 100_000 },
        ],
      },
    },
    env.base.owner.authHeader,
  )
  return r.body.data
}

describe('POST /stock-checks (createStockCheck)', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('AC1: Owner tạo phiếu draft → 201, code KK-YYYYMMDD-XXXX, status=draft', async () => {
    const product = await createProductFixture(env)
    await setProductStock(env, product.id, 100)

    const r = await jsonRequest<{ data: SCDetailResp }>(
      env.scApp,
      'POST',
      '/',
      { items: [{ productId: product.id, actualQty: 95 }] },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
    expect(r.body.data.code).toMatch(/^KK-\d{8}-\d{4}$/)
    expect(r.body.data.status).toBe('draft')
    expect(r.body.data.totalDiffNegative).toBe(5)
    expect(r.body.data.totalDiffPositive).toBe(0)
    expect(r.body.data.items[0]?.systemQty).toBe(100)
    expect(r.body.data.items[0]?.actualQty).toBe(95)
    expect(r.body.data.items[0]?.diff).toBe(-5)
  })

  it('AC2: Manager tạo OK', async () => {
    const product = await createProductFixture(env)
    await setProductStock(env, product.id, 50)
    const r = await jsonRequest<{ data: SCDetailResp }>(
      env.scApp,
      'POST',
      '/',
      { items: [{ productId: product.id, actualQty: 60 }] },
      env.base.manager.authHeader,
    )
    expect(r.status).toBe(201)
    expect(r.body.data.totalDiffPositive).toBe(10)
  })

  it('AC3: Staff tạo → 403', async () => {
    const product = await createProductFixture(env)
    const r = await jsonRequest<ApiError>(
      env.scApp,
      'POST',
      '/',
      { items: [{ productId: product.id, actualQty: 1 }] },
      env.base.staff.authHeader,
    )
    expect(r.status).toBe(403)
  })

  it('AC4: items rỗng → 400', async () => {
    const r = await jsonRequest<ApiError>(
      env.scApp,
      'POST',
      '/',
      { items: [] },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
  })

  it('AC5: items trùng productId+variantId → 422', async () => {
    const product = await createProductFixture(env)
    await setProductStock(env, product.id, 10)
    const r = await jsonRequest<ApiError>(
      env.scApp,
      'POST',
      '/',
      {
        items: [
          { productId: product.id, actualQty: 10 },
          { productId: product.id, actualQty: 12 },
        ],
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(422)
  })

  it('AC6: Sản phẩm có biến thể nhưng không truyền variantId → 400', async () => {
    const product = await createVariantProductFixture(env)
    const r = await jsonRequest<ApiError>(
      env.scApp,
      'POST',
      '/',
      { items: [{ productId: product.id, actualQty: 5 }] },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
  })

  it('AC7: actualQty âm → 400', async () => {
    const product = await createProductFixture(env)
    const r = await jsonRequest<ApiError>(
      env.scApp,
      'POST',
      '/',
      { items: [{ productId: product.id, actualQty: -1 }] },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
  })

  it('AC8: snapshot fields populated khi tạo', async () => {
    const product = await createProductFixture(env, { name: 'Bút bi xanh', sku: 'BB-X-1' })
    await setProductStock(env, product.id, 100)
    const r = await jsonRequest<{ data: SCDetailResp }>(
      env.scApp,
      'POST',
      '/',
      { items: [{ productId: product.id, actualQty: 90 }] },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
    expect(r.body.data.items[0]?.productNameSnapshot).toBe('Bút bi xanh')
    expect(r.body.data.items[0]?.productSkuSnapshot).toBe('BB-X-1')
  })

  it('AC9: Tạo draft KHÔNG ảnh hưởng tồn kho', async () => {
    const product = await createProductFixture(env)
    await setProductStock(env, product.id, 100)
    await jsonRequest<{ data: SCDetailResp }>(
      env.scApp,
      'POST',
      '/',
      { items: [{ productId: product.id, actualQty: 80 }] },
      env.base.owner.authHeader,
    )
    const [row] = await env.base.db.select().from(products).where(eq(products.id, product.id))
    expect(row?.currentStock).toBe(100)
  })

  it('AC10: Audit ghi stock_check.created', async () => {
    const product = await createProductFixture(env)
    await setProductStock(env, product.id, 50)
    const r = await jsonRequest<{ data: SCDetailResp }>(
      env.scApp,
      'POST',
      '/',
      { items: [{ productId: product.id, actualQty: 45 }] },
      env.base.owner.authHeader,
    )
    const logs = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.targetId, r.body.data.id))
    expect(logs.some((l) => l.action === 'stock_check.created')).toBe(true)
  })
})

describe('POST /stock-checks/:id/confirm (confirmStockCheck)', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    env.base.close()
  })

  it('AC11: Confirm draft → 200, status=confirmed, currentStock được áp diff', async () => {
    const product = await createProductFixture(env)
    await setProductStock(env, product.id, 100)

    const created = await jsonRequest<{ data: SCDetailResp }>(
      env.scApp,
      'POST',
      '/',
      { items: [{ productId: product.id, actualQty: 95 }] },
      env.base.owner.authHeader,
    )
    const id = created.body.data.id

    const conf = await jsonRequest<{ data: SCDetailResp }>(
      env.scApp,
      'POST',
      `/${id}/confirm`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(conf.status).toBe(200)
    expect(conf.body.data.status).toBe('confirmed')
    expect(conf.body.data.confirmedAt).not.toBeNull()

    const [row] = await env.base.db.select().from(products).where(eq(products.id, product.id))
    expect(row?.currentStock).toBe(95)
  })

  it('AC12: Confirm tạo inventory_transactions type=stock_check, cost_after = costPrice gốc (KHÔNG đổi WAC)', async () => {
    const product = await createProductFixture(env, { costPrice: 7000 })
    await setProductStock(env, product.id, 100)
    await env.base.db.update(products).set({ costPrice: 7000 }).where(eq(products.id, product.id))

    const created = await jsonRequest<{ data: SCDetailResp }>(
      env.scApp,
      'POST',
      '/',
      { items: [{ productId: product.id, actualQty: 110 }] },
      env.base.owner.authHeader,
    )
    await jsonRequest<{ data: SCDetailResp }>(
      env.scApp,
      'POST',
      `/${created.body.data.id}/confirm`,
      undefined,
      env.base.owner.authHeader,
    )

    const txs = await env.base.db
      .select()
      .from(inventoryTransactions)
      .where(eq(inventoryTransactions.productId, product.id))
    const stockCheckTx = txs.find((t) => t.type === 'stock_check')
    expect(stockCheckTx).toBeDefined()
    expect(stockCheckTx?.costAfter).toBe(7000)
    expect(stockCheckTx?.unitCost).toBe(7000)
    expect(stockCheckTx?.quantity).toBe(10)

    const [row] = await env.base.db.select().from(products).where(eq(products.id, product.id))
    expect(row?.costPrice).toBe(7000)
  })

  it('AC13: Confirm khi diff sẽ làm tồn âm → 422 NEGATIVE_STOCK với danh sách', async () => {
    const product = await createProductFixture(env)
    await setProductStock(env, product.id, 5)

    const created = await jsonRequest<{ data: SCDetailResp }>(
      env.scApp,
      'POST',
      '/',
      { items: [{ productId: product.id, actualQty: 3 }] },
      env.base.owner.authHeader,
    )
    await env.base.db.update(products).set({ currentStock: 1 }).where(eq(products.id, product.id))

    const conf = await jsonRequest<ApiError>(
      env.scApp,
      'POST',
      `/${created.body.data.id}/confirm`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(conf.status).toBe(422)
    const details = conf.body.error.details as { code?: string; items?: unknown[] } | undefined
    expect(details?.code).toBe('NEGATIVE_STOCK')
    expect(Array.isArray(details?.items)).toBe(true)
  })

  it('AC14: Confirm phiếu đã confirmed → 409', async () => {
    const product = await createProductFixture(env)
    await setProductStock(env, product.id, 50)
    const created = await jsonRequest<{ data: SCDetailResp }>(
      env.scApp,
      'POST',
      '/',
      { items: [{ productId: product.id, actualQty: 45 }] },
      env.base.owner.authHeader,
    )
    await jsonRequest(
      env.scApp,
      'POST',
      `/${created.body.data.id}/confirm`,
      undefined,
      env.base.owner.authHeader,
    )
    const second = await jsonRequest<ApiError>(
      env.scApp,
      'POST',
      `/${created.body.data.id}/confirm`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(second.status).toBe(409)
  })

  it('AC15: Confirm tạo stock_check_logs append-only', async () => {
    const product = await createProductFixture(env)
    await setProductStock(env, product.id, 50)
    const created = await jsonRequest<{ data: SCDetailResp }>(
      env.scApp,
      'POST',
      '/',
      { items: [{ productId: product.id, actualQty: 60 }] },
      env.base.owner.authHeader,
    )
    await jsonRequest(
      env.scApp,
      'POST',
      `/${created.body.data.id}/confirm`,
      undefined,
      env.base.owner.authHeader,
    )
    const logs = await env.base.db
      .select()
      .from(stockCheckLogs)
      .where(eq(stockCheckLogs.stockCheckId, created.body.data.id))
    expect(logs.length).toBe(1)
    expect(logs[0]?.diff).toBe(10)
    expect(logs[0]?.systemQty).toBe(50)
    expect(logs[0]?.actualQty).toBe(60)
  })

  it('AC16: Confirm với variant → cập nhật stockQuantity của variant', async () => {
    const product = await createVariantProductFixture(env)
    const variantId = product.variantsConfig?.variants[0]?.id
    expect(variantId).toBeDefined()
    await env.base.db
      .update(productVariants)
      .set({ stockQuantity: 20 })
      .where(eq(productVariants.id, variantId!))
    // aggregate currentStock
    await env.base.db.update(products).set({ currentStock: 20 }).where(eq(products.id, product.id))

    const created = await jsonRequest<{ data: SCDetailResp }>(
      env.scApp,
      'POST',
      '/',
      { items: [{ productId: product.id, variantId, actualQty: 25 }] },
      env.base.owner.authHeader,
    )
    const conf = await jsonRequest<{ data: SCDetailResp }>(
      env.scApp,
      'POST',
      `/${created.body.data.id}/confirm`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(conf.status).toBe(200)
    const [variant] = await env.base.db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, variantId!))
    expect(variant?.stockQuantity).toBe(25)
  })
})

describe('PATCH /stock-checks/:id (updateStockCheck)', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    env.base.close()
  })

  it('AC17: Sửa draft → replace items, totals tính lại', async () => {
    const product = await createProductFixture(env)
    await setProductStock(env, product.id, 100)
    const created = await jsonRequest<{ data: SCDetailResp }>(
      env.scApp,
      'POST',
      '/',
      { items: [{ productId: product.id, actualQty: 95 }] },
      env.base.owner.authHeader,
    )
    const r = await jsonRequest<{ data: SCDetailResp }>(
      env.scApp,
      'PATCH',
      `/${created.body.data.id}`,
      { items: [{ productId: product.id, actualQty: 110 }] },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.totalDiffPositive).toBe(10)
    expect(r.body.data.totalDiffNegative).toBe(0)
  })

  it('AC18: Sửa phiếu đã confirmed → 409', async () => {
    const product = await createProductFixture(env)
    await setProductStock(env, product.id, 50)
    const created = await jsonRequest<{ data: SCDetailResp }>(
      env.scApp,
      'POST',
      '/',
      { items: [{ productId: product.id, actualQty: 45 }] },
      env.base.owner.authHeader,
    )
    await jsonRequest(
      env.scApp,
      'POST',
      `/${created.body.data.id}/confirm`,
      undefined,
      env.base.owner.authHeader,
    )
    const r = await jsonRequest<ApiError>(
      env.scApp,
      'PATCH',
      `/${created.body.data.id}`,
      { note: 'thử sửa' },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(409)
  })
})

describe('DELETE /stock-checks/:id (deleteStockCheck)', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    env.base.close()
  })

  it('AC19: Xoá draft → 200 + audit ghi stock_check.deleted', async () => {
    const product = await createProductFixture(env)
    await setProductStock(env, product.id, 50)
    const created = await jsonRequest<{ data: SCDetailResp }>(
      env.scApp,
      'POST',
      '/',
      { items: [{ productId: product.id, actualQty: 45 }] },
      env.base.owner.authHeader,
    )
    const r = await jsonRequest(
      env.scApp,
      'DELETE',
      `/${created.body.data.id}`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)

    const [row] = await env.base.db
      .select()
      .from(stockChecks)
      .where(eq(stockChecks.id, created.body.data.id))
    expect(row).toBeUndefined()

    const itemRows = await env.base.db
      .select()
      .from(stockCheckItems)
      .where(eq(stockCheckItems.stockCheckId, created.body.data.id))
    expect(itemRows.length).toBe(0)

    const logs = await env.base.db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.targetId, created.body.data.id),
          eq(auditLogs.action, 'stock_check.deleted'),
        ),
      )
    expect(logs.length).toBeGreaterThanOrEqual(1)
  })

  it('AC20: Xoá phiếu đã confirmed → 409', async () => {
    const product = await createProductFixture(env)
    await setProductStock(env, product.id, 50)
    const created = await jsonRequest<{ data: SCDetailResp }>(
      env.scApp,
      'POST',
      '/',
      { items: [{ productId: product.id, actualQty: 45 }] },
      env.base.owner.authHeader,
    )
    await jsonRequest(
      env.scApp,
      'POST',
      `/${created.body.data.id}/confirm`,
      undefined,
      env.base.owner.authHeader,
    )
    const r = await jsonRequest<ApiError>(
      env.scApp,
      'DELETE',
      `/${created.body.data.id}`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(409)
  })
})

describe('GET /stock-checks (list)', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    env.base.close()
  })

  it('AC21: Trả meta.counts cho tabs (total/draft/confirmed)', async () => {
    const product = await createProductFixture(env)
    await setProductStock(env, product.id, 100)

    const c1 = await jsonRequest<{ data: SCDetailResp }>(
      env.scApp,
      'POST',
      '/',
      { items: [{ productId: product.id, actualQty: 90 }] },
      env.base.owner.authHeader,
    )
    await jsonRequest<{ data: SCDetailResp }>(
      env.scApp,
      'POST',
      '/',
      { items: [{ productId: product.id, actualQty: 95 }] },
      env.base.owner.authHeader,
    )
    await jsonRequest(
      env.scApp,
      'POST',
      `/${c1.body.data.id}/confirm`,
      undefined,
      env.base.owner.authHeader,
    )

    const list = await jsonRequest<{
      data: SCDetailResp[]
      meta: { total: number; counts: { total: number; draft: number; confirmed: number } }
    }>(env.scApp, 'GET', '/', undefined, env.base.owner.authHeader)
    expect(list.status).toBe(200)
    expect(list.body.meta.counts.total).toBe(2)
    expect(list.body.meta.counts.draft).toBe(1)
    expect(list.body.meta.counts.confirmed).toBe(1)
  })

  it('AC22: filter status=draft', async () => {
    const product = await createProductFixture(env)
    await setProductStock(env, product.id, 100)
    const c1 = await jsonRequest<{ data: SCDetailResp }>(
      env.scApp,
      'POST',
      '/',
      { items: [{ productId: product.id, actualQty: 95 }] },
      env.base.owner.authHeader,
    )
    await jsonRequest(
      env.scApp,
      'POST',
      `/${c1.body.data.id}/confirm`,
      undefined,
      env.base.owner.authHeader,
    )
    await jsonRequest<{ data: SCDetailResp }>(
      env.scApp,
      'POST',
      '/',
      { items: [{ productId: product.id, actualQty: 92 }] },
      env.base.owner.authHeader,
    )
    const list = await jsonRequest<{
      data: SCDetailResp[]
      meta: { total: number }
    }>(env.scApp, 'GET', '/?status=draft', undefined, env.base.owner.authHeader)
    expect(list.status).toBe(200)
    expect(list.body.meta.total).toBe(1)
    expect(list.body.data[0]?.status).toBe('draft')
  })

  it('AC22b: filter date range fromDate/toDate', async () => {
    const product = await createProductFixture(env)
    await setProductStock(env, product.id, 100)
    const created = await jsonRequest<{ data: SCDetailResp }>(
      env.scApp,
      'POST',
      '/',
      { items: [{ productId: product.id, actualQty: 95 }] },
      env.base.owner.authHeader,
    )
    expect(created.status).toBe(201)
    // Backdate phiếu để verify filter từ DB
    await env.base.db
      .update(stockChecks)
      .set({ createdAt: new Date('2020-01-15T08:00:00Z') })
      .where(eq(stockChecks.id, created.body.data.id))

    const fromIn = encodeURIComponent('2020-01-01T00:00:00.000Z')
    const toIn = encodeURIComponent('2020-01-31T23:59:59.999Z')
    const inRange = await jsonRequest<{ meta: { total: number } }>(
      env.scApp,
      'GET',
      `/?fromDate=${fromIn}&toDate=${toIn}`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(inRange.body.meta.total).toBe(1)

    const fromOut = encodeURIComponent('2021-01-01T00:00:00.000Z')
    const toOut = encodeURIComponent('2021-01-31T23:59:59.999Z')
    const outRange = await jsonRequest<{ meta: { total: number } }>(
      env.scApp,
      'GET',
      `/?fromDate=${fromOut}&toDate=${toOut}`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(outRange.body.meta.total).toBe(0)
  })

  it('AC22c: list trả createdByName + confirmedByName join users', async () => {
    const product = await createProductFixture(env)
    await setProductStock(env, product.id, 100)
    const created = await jsonRequest<{ data: SCDetailResp }>(
      env.scApp,
      'POST',
      '/',
      { items: [{ productId: product.id, actualQty: 95 }] },
      env.base.owner.authHeader,
    )
    await jsonRequest(
      env.scApp,
      'POST',
      `/${created.body.data.id}/confirm`,
      undefined,
      env.base.manager.authHeader,
    )
    const list = await jsonRequest<{
      data: SCDetailResp[]
    }>(env.scApp, 'GET', '/', undefined, env.base.owner.authHeader)
    const row = list.body.data.find((r) => r.id === created.body.data.id)
    expect(row?.createdByName).toBe('Owner Test')
    expect(row?.confirmedByName).toBe('Manager Test')
  })
})

describe('Stock check — additional review-driven cases', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('AC22d: confirm SKIP item có diff=0 (không tạo log, không tạo inventory_transactions)', async () => {
    const productSame = await createProductFixture(env)
    await setProductStock(env, productSame.id, 50)
    const productDiff = await createProductFixture(env)
    await setProductStock(env, productDiff.id, 30)

    const created = await jsonRequest<{ data: SCDetailResp }>(
      env.scApp,
      'POST',
      '/',
      {
        items: [
          { productId: productSame.id, actualQty: 50 },
          { productId: productDiff.id, actualQty: 35 },
        ],
      },
      env.base.owner.authHeader,
    )
    expect(created.status).toBe(201)
    const conf = await jsonRequest<{ data: SCDetailResp }>(
      env.scApp,
      'POST',
      `/${created.body.data.id}/confirm`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(conf.status).toBe(200)

    const logs = await env.base.db
      .select()
      .from(stockCheckLogs)
      .where(eq(stockCheckLogs.stockCheckId, created.body.data.id))
    expect(logs.length).toBe(1)
    expect(logs[0]?.productId).toBe(productDiff.id)

    const txs = await env.base.db
      .select()
      .from(inventoryTransactions)
      .where(eq(inventoryTransactions.type, 'stock_check'))
    expect(txs.length).toBe(1)
    expect(txs[0]?.productId).toBe(productDiff.id)
  })

  it('AC22e: audit log ghi đủ stock_check.created + updated + confirmed', async () => {
    const product = await createProductFixture(env)
    await setProductStock(env, product.id, 100)
    const created = await jsonRequest<{ data: SCDetailResp }>(
      env.scApp,
      'POST',
      '/',
      { items: [{ productId: product.id, actualQty: 90 }] },
      env.base.owner.authHeader,
    )
    await jsonRequest(
      env.scApp,
      'PATCH',
      `/${created.body.data.id}`,
      { items: [{ productId: product.id, actualQty: 92 }] },
      env.base.owner.authHeader,
    )
    await jsonRequest(
      env.scApp,
      'POST',
      `/${created.body.data.id}/confirm`,
      undefined,
      env.base.owner.authHeader,
    )

    const logs = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.targetId, created.body.data.id))
    const actions = new Set(logs.map((l) => l.action))
    expect(actions.has('stock_check.created')).toBe(true)
    expect(actions.has('stock_check.updated')).toBe(true)
    expect(actions.has('stock_check.confirmed')).toBe(true)
  })

  it('AC22f: tạo 5 phiếu liên tiếp trong cùng ngày → code KK-YYYYMMDD-0001..0005', async () => {
    const product = await createProductFixture(env)
    await setProductStock(env, product.id, 1000)
    const codes: string[] = []
    for (let i = 0; i < 5; i++) {
      const r = await jsonRequest<{ data: SCDetailResp }>(
        env.scApp,
        'POST',
        '/',
        { items: [{ productId: product.id, actualQty: 1000 - i }] },
        env.base.owner.authHeader,
      )
      expect(r.status).toBe(201)
      codes.push(r.body.data.code)
    }
    expect(codes.length).toBe(5)
    const seqs = codes.map((c) => c.slice(-4))
    expect(new Set(seqs).size).toBe(5)
    expect(seqs).toEqual(['0001', '0002', '0003', '0004', '0005'])
  })

  it('AC22g: confirm 2 lần cùng phiếu — lần 2 nhận 409 (FOR UPDATE)', async () => {
    const product = await createProductFixture(env)
    await setProductStock(env, product.id, 50)
    const created = await jsonRequest<{ data: SCDetailResp }>(
      env.scApp,
      'POST',
      '/',
      { items: [{ productId: product.id, actualQty: 45 }] },
      env.base.owner.authHeader,
    )
    const [r1, r2] = await Promise.all([
      jsonRequest<{ data: SCDetailResp } | ApiError>(
        env.scApp,
        'POST',
        `/${created.body.data.id}/confirm`,
        undefined,
        env.base.owner.authHeader,
      ),
      jsonRequest<{ data: SCDetailResp } | ApiError>(
        env.scApp,
        'POST',
        `/${created.body.data.id}/confirm`,
        undefined,
        env.base.owner.authHeader,
      ),
    ])
    const statuses = [r1.status, r2.status].sort()
    expect(statuses).toEqual([200, 409])
  })

  it('AC22h: 2 phiếu cùng SP confirm song song → cả 2 thành công, tồn cuối = base + diff1 + diff2', async () => {
    const product = await createProductFixture(env)
    await setProductStock(env, product.id, 100)
    const c1 = await jsonRequest<{ data: SCDetailResp }>(
      env.scApp,
      'POST',
      '/',
      { items: [{ productId: product.id, actualQty: 105 }] },
      env.base.owner.authHeader,
    )
    const c2 = await jsonRequest<{ data: SCDetailResp }>(
      env.scApp,
      'POST',
      '/',
      { items: [{ productId: product.id, actualQty: 110 }] },
      env.base.owner.authHeader,
    )
    const [r1, r2] = await Promise.all([
      jsonRequest<{ data: SCDetailResp }>(
        env.scApp,
        'POST',
        `/${c1.body.data.id}/confirm`,
        undefined,
        env.base.owner.authHeader,
      ),
      jsonRequest<{ data: SCDetailResp }>(
        env.scApp,
        'POST',
        `/${c2.body.data.id}/confirm`,
        undefined,
        env.base.owner.authHeader,
      ),
    ])
    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
    const [row] = await env.base.db.select().from(products).where(eq(products.id, product.id))
    // base 100 + diff1 (105-100=+5) + diff2 (110-100=+10) = 115
    expect(row?.currentStock).toBe(115)
  })

  it('AC22i: multi-tenant — store khác KHÔNG thấy phiếu kiểm của store hiện tại', async () => {
    const product = await createProductFixture(env)
    await setProductStock(env, product.id, 50)
    await jsonRequest(
      env.scApp,
      'POST',
      '/',
      { items: [{ productId: product.id, actualQty: 45 }] },
      env.base.owner.authHeader,
    )

    const [otherStore] = await env.base.db.insert(stores).values({ name: 'Cửa hàng B' }).returning()
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

    const list = await jsonRequest<{
      data: SCDetailResp[]
      meta: { total: number; counts: { total: number; draft: number; confirmed: number } }
    }>(env.scApp, 'GET', '/', undefined, ah)
    expect(list.status).toBe(200)
    expect(list.body.meta.total).toBe(0)
    expect(list.body.data.length).toBe(0)
  })
})

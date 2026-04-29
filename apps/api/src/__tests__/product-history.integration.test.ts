import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { products } from '@kiotviet-lite/shared'

import { createProductHistoryRoutes } from '../routes/product-history.routes.js'
import { createProductsRoutes } from '../routes/products.routes.js'
import { createPurchaseOrdersRoutes } from '../routes/purchase-orders.routes.js'
import { createStockChecksRoutes } from '../routes/stock-checks.routes.js'
import { createSuppliersRoutes } from '../routes/suppliers.routes.js'
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

interface Env {
  base: TestEnv
  prodApp: ReturnType<typeof createProductsRoutes>
  phApp: ReturnType<typeof createProductHistoryRoutes>
  poApp: ReturnType<typeof createPurchaseOrdersRoutes>
  supApp: ReturnType<typeof createSuppliersRoutes>
  scApp: ReturnType<typeof createStockChecksRoutes>
}

async function setup(): Promise<Env> {
  const base = await createTestEnv()
  return {
    base,
    prodApp: createProductsRoutes({ db: base.db }),
    phApp: createProductHistoryRoutes({ db: base.db }),
    poApp: createPurchaseOrdersRoutes({ db: base.db }),
    supApp: createSuppliersRoutes({ db: base.db }),
    scApp: createStockChecksRoutes({ db: base.db }),
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

async function createProductFixture(env: Env): Promise<{ id: string }> {
  const r = await jsonRequest<{ data: { id: string } }>(
    env.prodApp,
    'POST',
    '/',
    {
      name: 'SP Lịch sử',
      sku: `PH-${Math.random().toString(36).slice(2, 8)}`,
      sellingPrice: 10000,
      costPrice: 5000,
      unit: 'cái',
      trackInventory: true,
    },
    env.base.owner.authHeader,
  )
  return r.body.data
}

async function createSupplierFixture(env: Env): Promise<{ id: string }> {
  const r = await jsonRequest<{ data: { id: string } }>(
    env.supApp,
    'POST',
    '/',
    { name: 'NCC PH' },
    env.base.owner.authHeader,
  )
  return r.body.data
}

describe('GET /products/:productId/purchase-history', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('AC23: Trả lịch sử nhập đúng SP, kèm supplier và stockAfter', async () => {
    const product = await createProductFixture(env)
    const supplier = await createSupplierFixture(env)

    await jsonRequest(
      env.poApp,
      'POST',
      '/',
      {
        supplierId: supplier.id,
        items: [{ productId: product.id, quantity: 10, unitPrice: 50_000 }],
      },
      env.base.owner.authHeader,
    )
    await jsonRequest(
      env.poApp,
      'POST',
      '/',
      {
        supplierId: supplier.id,
        items: [{ productId: product.id, quantity: 5, unitPrice: 60_000 }],
      },
      env.base.owner.authHeader,
    )

    const r = await jsonRequest<{
      data: Array<{
        productNameSnapshot: string
        supplierName: string
        quantity: number
        unitPrice: number
        lineTotal: number
        stockAfter: number | null
        costAfter: number | null
      }>
      meta: { total: number }
    }>(env.phApp, 'GET', `/${product.id}/purchase-history`, undefined, env.base.owner.authHeader)
    expect(r.status).toBe(200)
    expect(r.body.meta.total).toBe(2)
    expect(r.body.data.length).toBe(2)
    expect(r.body.data[0]?.supplierName).toBe('NCC PH')
    expect(r.body.data[0]?.stockAfter).not.toBeNull()
    expect(r.body.data[0]?.costAfter).not.toBeNull()
  })

  it('AC24: Sản phẩm chưa từng nhập → mảng rỗng', async () => {
    const product = await createProductFixture(env)
    const r = await jsonRequest<{ data: unknown[]; meta: { total: number } }>(
      env.phApp,
      'GET',
      `/${product.id}/purchase-history`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.meta.total).toBe(0)
    expect(r.body.data).toEqual([])
  })
})

describe('GET /products/:productId/stock-check-history', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('AC25: Chỉ trả phiếu confirmed (qua stock_check_logs)', async () => {
    const product = await createProductFixture(env)
    await env.base.db.update(products).set({ currentStock: 100 }).where(eq(products.id, product.id))

    const draft = await jsonRequest<{ data: { id: string } }>(
      env.scApp,
      'POST',
      '/',
      { items: [{ productId: product.id, actualQty: 90 }] },
      env.base.owner.authHeader,
    )
    const confirmed = await jsonRequest<{ data: { id: string } }>(
      env.scApp,
      'POST',
      '/',
      { items: [{ productId: product.id, actualQty: 95 }] },
      env.base.owner.authHeader,
    )
    await jsonRequest(
      env.scApp,
      'POST',
      `/${confirmed.body.data.id}/confirm`,
      undefined,
      env.base.owner.authHeader,
    )

    const r = await jsonRequest<{
      data: Array<{
        stockCheckId: string
        stockCheckCode: string
        systemQty: number
        actualQty: number
        diff: number
      }>
      meta: { total: number }
    }>(env.phApp, 'GET', `/${product.id}/stock-check-history`, undefined, env.base.owner.authHeader)
    expect(r.status).toBe(200)
    expect(r.body.meta.total).toBe(1)
    expect(r.body.data[0]?.stockCheckId).toBe(confirmed.body.data.id)
    expect(r.body.data[0]?.diff).toBe(-5)
    expect(draft.body.data.id).not.toBe(confirmed.body.data.id)
  })

  it('AC26: Sản phẩm chưa từng kiểm → mảng rỗng', async () => {
    const product = await createProductFixture(env)
    const r = await jsonRequest<{ data: unknown[]; meta: { total: number } }>(
      env.phApp,
      'GET',
      `/${product.id}/stock-check-history`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.meta.total).toBe(0)
    expect(r.body.data).toEqual([])
  })
})

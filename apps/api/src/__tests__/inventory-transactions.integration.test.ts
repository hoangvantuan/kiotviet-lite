import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { auditLogs } from '@kiotviet-lite/shared'

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

interface ProductResp {
  id: string
  hasVariants: boolean
  costPrice: number | null
  currentStock: number
  trackInventory: boolean
  variantsConfig: { variants: Array<{ id: string; stockQuantity: number }> } | null
}

interface TxResp {
  id: string
  type: string
  quantity: number
  unitCost: number | null
  costAfter: number | null
  stockAfter: number | null
}

interface PurchaseResp {
  product: ProductResp
  transaction: TxResp
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

async function createSimpleProduct(env: Env, override: Record<string, unknown> = {}) {
  const r = await jsonRequest<{ data: ProductResp }>(
    env.app,
    'POST',
    '/',
    {
      name: 'Coca lon',
      sku: `COCA-${Math.random().toString(36).slice(2, 8)}`,
      sellingPrice: 10000,
      unit: 'Lon',
      trackInventory: true,
      minStock: 5,
      ...override,
    },
    env.base.owner.authHeader,
  )
  return r.body.data
}

describe('recordPurchaseTransaction (WAC)', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Lần đầu (costBefore = null) → WAC = unitCost', async () => {
    const p = await createSimpleProduct(env, { costPrice: null, initialStock: 0 })
    const r = await jsonRequest<{ data: PurchaseResp }>(
      env.app,
      'POST',
      `/${p.id}/inventory/purchase`,
      { quantity: 10, unitCost: 10000 },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
    expect(r.body.data.product.costPrice).toBe(10000)
    expect(r.body.data.product.currentStock).toBe(10)
  })

  it('Lần 2 với cost khác → WAC tròn integer', async () => {
    const p = await createSimpleProduct(env)
    await jsonRequest(
      env.app,
      'POST',
      `/${p.id}/inventory/purchase`,
      { quantity: 10, unitCost: 10000 },
      env.base.owner.authHeader,
    )
    const r = await jsonRequest<{ data: PurchaseResp }>(
      env.app,
      'POST',
      `/${p.id}/inventory/purchase`,
      { quantity: 20, unitCost: 20000 },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
    // (10*10000 + 20*20000) / 30 = 16666.66... → 16667
    expect(r.body.data.product.costPrice).toBe(16667)
    expect(r.body.data.product.currentStock).toBe(30)

    const audits = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'inventory.purchase_recorded'))
    expect(audits).toHaveLength(2)
  })

  it('hasVariants=true mà không truyền variantId → 400', async () => {
    const r0 = await jsonRequest<{ data: ProductResp }>(
      env.app,
      'POST',
      '/',
      {
        name: 'Áo',
        sku: 'AT-V1',
        sellingPrice: 0,
        trackInventory: true,
        minStock: 0,
        variantsConfig: {
          attribute1Name: 'Màu',
          variants: [
            { sku: 'AT-V1-do', attribute1Value: 'Đỏ', sellingPrice: 100, stockQuantity: 5 },
          ],
        },
      },
      env.base.owner.authHeader,
    )
    const product = r0.body.data
    const r = await jsonRequest<{ error: { code: string } }>(
      env.app,
      'POST',
      `/${product.id}/inventory/purchase`,
      { quantity: 5, unitCost: 1000 },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('hasVariants=false mà truyền variantId → 400', async () => {
    const p = await createSimpleProduct(env)
    const r = await jsonRequest<{ error: { code: string } }>(
      env.app,
      'POST',
      `/${p.id}/inventory/purchase`,
      {
        variantId: '00000000-0000-7000-8000-000000000001',
        quantity: 5,
        unitCost: 1000,
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
  })

  it('Purchase với variantId → variant.stockQuantity tăng + product.costPrice cập nhật', async () => {
    const r0 = await jsonRequest<{ data: ProductResp }>(
      env.app,
      'POST',
      '/',
      {
        name: 'Áo',
        sku: 'AT-V2',
        sellingPrice: 0,
        trackInventory: true,
        minStock: 0,
        variantsConfig: {
          attribute1Name: 'Màu',
          variants: [
            { sku: 'AT-V2-do', attribute1Value: 'Đỏ', sellingPrice: 100, stockQuantity: 0 },
          ],
        },
      },
      env.base.owner.authHeader,
    )
    const variantId = r0.body.data.variantsConfig!.variants[0]!.id
    const r = await jsonRequest<{ data: PurchaseResp }>(
      env.app,
      'POST',
      `/${r0.body.data.id}/inventory/purchase`,
      { variantId, quantity: 10, unitCost: 50000 },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
    expect(r.body.data.product.costPrice).toBe(50000)
    const variant = r.body.data.product.variantsConfig!.variants.find((v) => v.id === variantId)!
    expect(variant.stockQuantity).toBe(10)
  })
})

describe('recordManualAdjustment', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Delta âm khiến tồn về < 0 → 422', async () => {
    const p = await createSimpleProduct(env, { initialStock: 5 })
    const r = await jsonRequest<{ error: { code: string } }>(
      env.app,
      'POST',
      `/${p.id}/inventory/adjust`,
      { delta: -10, reason: 'Hỏng hàng' },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('BUSINESS_RULE_VIOLATION')
  })

  it('Delta hợp lệ → 200 KHÔNG đổi costPrice', async () => {
    const p = await createSimpleProduct(env, { initialStock: 10, costPrice: 1000 })
    const r = await jsonRequest<{ data: PurchaseResp }>(
      env.app,
      'POST',
      `/${p.id}/inventory/adjust`,
      { delta: -3, reason: 'Hỏng hàng' },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.product.currentStock).toBe(7)
    expect(r.body.data.product.costPrice).toBe(1000)

    const audits = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'inventory.manual_adjusted'))
    expect(audits).toHaveLength(1)
  })
})

describe('listInventoryTransactions', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Pagination + sort theo createdAt DESC', async () => {
    const p = await createSimpleProduct(env)
    await jsonRequest(
      env.app,
      'POST',
      `/${p.id}/inventory/purchase`,
      { quantity: 5, unitCost: 10000 },
      env.base.owner.authHeader,
    )
    await jsonRequest(
      env.app,
      'POST',
      `/${p.id}/inventory/adjust`,
      { delta: 3, reason: 'Phát hiện thêm' },
      env.base.owner.authHeader,
    )
    const r = await jsonRequest<{
      data: TxResp[]
      meta: { total: number }
    }>(
      env.app,
      'GET',
      `/${p.id}/inventory-transactions?page=1&pageSize=20`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.length).toBe(2)
    expect(r.body.meta.total).toBe(2)
  })
})

describe('low-stock endpoints', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('getLowStockCount đếm đúng products dưới định mức', async () => {
    // Product A: trackInventory=true, currentStock=2, minStock=5 → low
    await createSimpleProduct(env, {
      sku: 'LOW-A',
      trackInventory: true,
      initialStock: 2,
      minStock: 5,
    })
    // Product B: trackInventory=true, currentStock=10, minStock=5 → ok
    await createSimpleProduct(env, {
      sku: 'OK-B',
      trackInventory: true,
      initialStock: 10,
      minStock: 5,
    })
    // Product C: trackInventory=false → bỏ qua
    await createSimpleProduct(env, {
      sku: 'NOTRACK-C',
      trackInventory: false,
      minStock: 0,
    })
    const r = await jsonRequest<{ data: { count: number } }>(
      env.app,
      'GET',
      '/low-stock-count',
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.count).toBe(1)
  })

  it('listLowStockProducts trả về items đúng', async () => {
    await createSimpleProduct(env, {
      sku: 'LOW-X',
      trackInventory: true,
      initialStock: 1,
      minStock: 10,
    })
    const r = await jsonRequest<{ data: ProductResp[]; meta: { total: number } }>(
      env.app,
      'GET',
      '/low-stock?page=1&pageSize=50',
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.meta.total).toBe(1)
  })

  it('Staff không truy cập low-stock-count → 403', async () => {
    const r = await jsonRequest<{ error: { code: string } }>(
      env.app,
      'GET',
      '/low-stock-count',
      undefined,
      env.base.staff.authHeader,
    )
    expect(r.status).toBe(403)
  })
})

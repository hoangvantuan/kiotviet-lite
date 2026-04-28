import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { auditLogs, inventoryTransactions, productVariants } from '@kiotviet-lite/shared'

import { createCategoriesRoutes } from '../routes/categories.routes.js'
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

interface VariantItemResponse {
  id: string
  productId: string
  sku: string
  barcode: string | null
  attribute1Name: string
  attribute1Value: string
  attribute2Name: string | null
  attribute2Value: string | null
  sellingPrice: number
  costPrice: number | null
  stockQuantity: number
  status: 'active' | 'inactive'
  hasTransactions: boolean
  createdAt: string
  updatedAt: string
}

interface ProductResponse {
  id: string
  storeId: string
  name: string
  sku: string
  barcode: string | null
  hasVariants: boolean
  trackInventory: boolean
  currentStock: number
  sellingPrice: number
  variantsConfig: {
    attribute1Name: string
    attribute2Name: string | null
    variants: VariantItemResponse[]
  } | null
}

interface CategoryResponse {
  id: string
  name: string
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
  return { status: res.status, body: (await res.json()) as T }
}

async function getRequest<T>(
  app: RequestableApp,
  path: string,
  authHeader: { Authorization: string },
): Promise<{ status: number; body: T }> {
  const res = await app.request(path, { method: 'GET', headers: authHeader })
  return { status: res.status, body: (await res.json()) as T }
}

interface Env {
  base: TestEnv
  app: ReturnType<typeof createProductsRoutes>
  catApp: ReturnType<typeof createCategoriesRoutes>
}

async function setup(): Promise<Env> {
  const base = await createTestEnv()
  return {
    base,
    app: createProductsRoutes({ db: base.db }),
    catApp: createCategoriesRoutes({ db: base.db }),
  }
}

const variantsCreate = {
  name: 'Áo thun',
  sku: 'AT-001',
  sellingPrice: 0,
  variantsConfig: {
    attribute1Name: 'Màu sắc',
    variants: [
      { sku: 'AT-001-do', attribute1Value: 'Đỏ', sellingPrice: 100000 },
      { sku: 'AT-001-xanh', attribute1Value: 'Xanh', sellingPrice: 100000 },
      { sku: 'AT-001-vang', attribute1Value: 'Vàng', sellingPrice: 100000 },
    ],
  },
}

describe('POST /products with variantsConfig', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Tạo product với 1 thuộc tính, 3 variants → 201', async () => {
    const r = await jsonRequest<{ data: ProductResponse }>(
      env.app,
      'POST',
      '/',
      variantsCreate,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
    expect(r.body.data.hasVariants).toBe(true)
    expect(r.body.data.variantsConfig?.variants.length).toBe(3)
    const rows = await env.base.db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, r.body.data.id))
    expect(rows).toHaveLength(3)
  })

  it('Audit ghi product.variants_enabled + 3 product.variant_created', async () => {
    await jsonRequest(env.app, 'POST', '/', variantsCreate, env.base.owner.authHeader)
    const enabled = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'product.variants_enabled'))
    const created = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'product.variant_created'))
    expect(enabled).toHaveLength(1)
    expect(created).toHaveLength(3)
  })

  it('Tạo với 2 thuộc tính 9 variants → tất cả unique', async () => {
    const body = {
      name: 'Áo polo',
      sku: 'AP-001',
      sellingPrice: 0,
      variantsConfig: {
        attribute1Name: 'Màu',
        attribute2Name: 'Size',
        variants: [
          { sku: 'AP-do-s', attribute1Value: 'Đỏ', attribute2Value: 'S', sellingPrice: 100 },
          { sku: 'AP-do-m', attribute1Value: 'Đỏ', attribute2Value: 'M', sellingPrice: 100 },
          { sku: 'AP-do-l', attribute1Value: 'Đỏ', attribute2Value: 'L', sellingPrice: 100 },
          { sku: 'AP-xanh-s', attribute1Value: 'Xanh', attribute2Value: 'S', sellingPrice: 100 },
          { sku: 'AP-xanh-m', attribute1Value: 'Xanh', attribute2Value: 'M', sellingPrice: 100 },
          { sku: 'AP-xanh-l', attribute1Value: 'Xanh', attribute2Value: 'L', sellingPrice: 100 },
          { sku: 'AP-vang-s', attribute1Value: 'Vàng', attribute2Value: 'S', sellingPrice: 100 },
          { sku: 'AP-vang-m', attribute1Value: 'Vàng', attribute2Value: 'M', sellingPrice: 100 },
          { sku: 'AP-vang-l', attribute1Value: 'Vàng', attribute2Value: 'L', sellingPrice: 100 },
        ],
      },
    }
    const r = await jsonRequest<{ data: ProductResponse }>(
      env.app,
      'POST',
      '/',
      body,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
    expect(r.body.data.variantsConfig?.variants.length).toBe(9)
  })

  it('SKU variant trùng nhau trong array → 400 VALIDATION_ERROR', async () => {
    const body = {
      ...variantsCreate,
      variantsConfig: {
        attribute1Name: 'Màu',
        variants: [
          { sku: 'AT-do', attribute1Value: 'Đỏ', sellingPrice: 100 },
          { sku: 'AT-DO', attribute1Value: 'Xanh', sellingPrice: 100 },
        ],
      },
    }
    const r = await jsonRequest<{ error: { code: string } }>(
      env.app,
      'POST',
      '/',
      body,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('SKU variant trùng SKU variant của product khác → 409 CONFLICT field=sku', async () => {
    await jsonRequest(env.app, 'POST', '/', variantsCreate, env.base.owner.authHeader)
    const body2 = {
      name: 'Áo khác',
      sku: 'AT-002',
      sellingPrice: 0,
      variantsConfig: {
        attribute1Name: 'Màu',
        variants: [{ sku: 'AT-001-do', attribute1Value: 'Đỏ', sellingPrice: 100 }],
      },
    }
    const r = await jsonRequest<{ error: { code: string; details?: { field?: string } } }>(
      env.app,
      'POST',
      '/',
      body2,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(409)
    expect(r.body.error.details?.field).toBe('sku')
  })

  it('101 variants → 400 VALIDATION_ERROR', async () => {
    const variants = Array.from({ length: 101 }, (_, i) => ({
      sku: `AT-${String(i).padStart(3, '0')}`,
      attribute1Value: `V${i}`,
      sellingPrice: 100,
    }))
    const body = {
      name: 'Áo nhiều',
      sku: 'AN-001',
      sellingPrice: 0,
      variantsConfig: { attribute1Name: 'X', variants },
    }
    const r = await jsonRequest<{ error: { code: string } }>(
      env.app,
      'POST',
      '/',
      body,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
  })

  it('attribute2Name set nhưng variant attribute2Value=null → 400', async () => {
    const body = {
      name: 'X',
      sku: 'X-001',
      sellingPrice: 0,
      variantsConfig: {
        attribute1Name: 'Màu',
        attribute2Name: 'Size',
        variants: [{ sku: 'X-001-1', attribute1Value: 'Đỏ', sellingPrice: 100 }],
      },
    }
    const r = await jsonRequest<{ error: { code: string } }>(
      env.app,
      'POST',
      '/',
      body,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
  })

  it('trackInventory=true + variant stockQuantity=50 → tạo inventory_transactions', async () => {
    const body = {
      name: 'X',
      sku: 'X-002',
      sellingPrice: 0,
      trackInventory: true,
      variantsConfig: {
        attribute1Name: 'Màu',
        variants: [
          { sku: 'X-002-do', attribute1Value: 'Đỏ', sellingPrice: 100, stockQuantity: 50 },
        ],
      },
    }
    const r = await jsonRequest<{ data: ProductResponse }>(
      env.app,
      'POST',
      '/',
      body,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
    expect(r.body.data.currentStock).toBe(50)
    const variantId = r.body.data.variantsConfig?.variants[0]?.id
    const txs = await env.base.db
      .select()
      .from(inventoryTransactions)
      .where(eq(inventoryTransactions.variantId, variantId!))
    expect(txs).toHaveLength(1)
    expect(txs[0]?.type).toBe('initial_stock')
    expect(txs[0]?.quantity).toBe(50)
  })

  it('Staff tạo → 403', async () => {
    const r = await jsonRequest<{ error: { code: string } }>(
      env.app,
      'POST',
      '/',
      variantsCreate,
      env.base.staff.authHeader,
    )
    expect(r.status).toBe(403)
  })
})

describe('GET /products with variants', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('List: currentStock = SUM(variants.stockQuantity)', async () => {
    const body = {
      name: 'X',
      sku: 'X-100',
      sellingPrice: 0,
      trackInventory: true,
      variantsConfig: {
        attribute1Name: 'Màu',
        variants: [
          { sku: 'X-do', attribute1Value: 'Đỏ', sellingPrice: 100, stockQuantity: 10 },
          { sku: 'X-xanh', attribute1Value: 'Xanh', sellingPrice: 100, stockQuantity: 20 },
        ],
      },
    }
    await jsonRequest(env.app, 'POST', '/', body, env.base.owner.authHeader)
    const r = await getRequest<{ data: ProductResponse[] }>(env.app, '/', env.base.owner.authHeader)
    const found = r.body.data.find((p) => p.sku === 'X-100')
    expect(found?.currentStock).toBe(30)
  })

  it('Filter stockFilter=out_of_stock bắt product variants với SUM=0', async () => {
    const body = {
      name: 'X',
      sku: 'X-200',
      sellingPrice: 0,
      trackInventory: true,
      variantsConfig: {
        attribute1Name: 'Màu',
        variants: [{ sku: 'X-do', attribute1Value: 'Đỏ', sellingPrice: 100, stockQuantity: 0 }],
      },
    }
    await jsonRequest(env.app, 'POST', '/', body, env.base.owner.authHeader)
    const r = await getRequest<{ data: ProductResponse[] }>(
      env.app,
      '/?stockFilter=out_of_stock',
      env.base.owner.authHeader,
    )
    const found = r.body.data.find((p) => p.sku === 'X-200')
    expect(found).toBeDefined()
  })

  it('Detail trả variantsConfig đầy đủ', async () => {
    const created = await jsonRequest<{ data: ProductResponse }>(
      env.app,
      'POST',
      '/',
      variantsCreate,
      env.base.owner.authHeader,
    )
    const r = await getRequest<{ data: ProductResponse }>(
      env.app,
      `/${created.body.data.id}`,
      env.base.owner.authHeader,
    )
    expect(r.body.data.variantsConfig?.attribute1Name).toBe('Màu sắc')
    expect(r.body.data.variantsConfig?.variants.length).toBe(3)
  })
})

describe('PATCH /products variants CRUD', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  async function createBaseProduct() {
    const r = await jsonRequest<{ data: ProductResponse }>(
      env.app,
      'POST',
      '/',
      variantsCreate,
      env.base.owner.authHeader,
    )
    return r.body.data
  }

  it('Sửa giá 1 variant → audit product.variant_updated', async () => {
    const created = await createBaseProduct()
    const variants = created.variantsConfig!.variants
    const updatedList = variants.map((v, i) =>
      i === 0
        ? {
            id: v.id,
            sku: v.sku,
            attribute1Value: v.attribute1Value,
            sellingPrice: 200000,
          }
        : {
            id: v.id,
            sku: v.sku,
            attribute1Value: v.attribute1Value,
            sellingPrice: v.sellingPrice,
          },
    )
    const r = await jsonRequest<{ data: ProductResponse }>(
      env.app,
      'PATCH',
      `/${created.id}`,
      { variantsConfig: { attribute1Name: 'Màu sắc', variants: updatedList } },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.variantsConfig?.variants[0]?.sellingPrice).toBe(200000)
    const logs = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'product.variant_updated'))
    expect(logs.length).toBeGreaterThanOrEqual(1)
  })

  it('Thêm 1 variant mới (không có id)', async () => {
    const created = await createBaseProduct()
    const variants = created.variantsConfig!.variants
    const newVariants = [
      ...variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        attribute1Value: v.attribute1Value,
        sellingPrice: v.sellingPrice,
      })),
      { sku: 'AT-001-trang', attribute1Value: 'Trắng', sellingPrice: 100000 },
    ]
    const r = await jsonRequest<{ data: ProductResponse }>(
      env.app,
      'PATCH',
      `/${created.id}`,
      { variantsConfig: { attribute1Name: 'Màu sắc', variants: newVariants } },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.variantsConfig?.variants.length).toBe(4)
  })

  it('Xoá 1 variant chưa giao dịch → hard delete', async () => {
    const created = await createBaseProduct()
    const variants = created.variantsConfig!.variants
    const remaining = variants.slice(1).map((v) => ({
      id: v.id,
      sku: v.sku,
      attribute1Value: v.attribute1Value,
      sellingPrice: v.sellingPrice,
    }))
    await jsonRequest(
      env.app,
      'PATCH',
      `/${created.id}`,
      { variantsConfig: { attribute1Name: 'Màu sắc', variants: remaining } },
      env.base.owner.authHeader,
    )
    const rows = await env.base.db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, variants[0]!.id))
    expect(rows).toHaveLength(0)
    const logs = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'product.variant_deleted'))
    expect(logs).toHaveLength(1)
  })

  it('Xoá variant đã có giao dịch → soft delete', async () => {
    const created = await createBaseProduct()
    const variantId = created.variantsConfig!.variants[0]!.id
    // Insert manual transaction để biến variant thành "đã giao dịch"
    await env.base.db.insert(inventoryTransactions).values({
      storeId: env.base.storeId,
      productId: created.id,
      variantId,
      type: 'manual_adjustment',
      quantity: 5,
      createdBy: env.base.owner.id,
    })
    const remaining = created.variantsConfig!.variants.slice(1).map((v) => ({
      id: v.id,
      sku: v.sku,
      attribute1Value: v.attribute1Value,
      sellingPrice: v.sellingPrice,
    }))
    await jsonRequest(
      env.app,
      'PATCH',
      `/${created.id}`,
      { variantsConfig: { attribute1Name: 'Màu sắc', variants: remaining } },
      env.base.owner.authHeader,
    )
    const row = await env.base.db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, variantId))
    expect(row[0]?.deletedAt).not.toBeNull()
    expect(row[0]?.status).toBe('inactive')
  })

  it('PATCH gửi stockQuantity trong update → 400 VALIDATION_ERROR (H-3)', async () => {
    const created = await createBaseProduct()
    const variants = created.variantsConfig!.variants
    const tampered = variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      attribute1Value: v.attribute1Value,
      sellingPrice: v.sellingPrice,
      stockQuantity: 999,
    }))
    const r = await jsonRequest(
      env.app,
      'PATCH',
      `/${created.id}`,
      { variantsConfig: { attribute1Name: 'Màu sắc', variants: tampered } },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
    expect((r.body as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR')
  })

  it('GET detail trả hasTransactions=true cho variant đã có giao dịch (H-2)', async () => {
    const created = await createBaseProduct()
    const variantId = created.variantsConfig!.variants[0]!.id
    await env.base.db.insert(inventoryTransactions).values({
      storeId: env.base.storeId,
      productId: created.id,
      variantId,
      type: 'manual_adjustment',
      quantity: 5,
      createdBy: env.base.owner.id,
    })
    const r = await getRequest<{ data: ProductResponse }>(
      env.app,
      `/${created.id}`,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    const target = r.body.data.variantsConfig?.variants.find((v) => v.id === variantId)
    expect(target?.hasTransactions).toBe(true)
    const other = r.body.data.variantsConfig?.variants.find((v) => v.id !== variantId)
    expect(other?.hasTransactions).toBe(false)
  })
})

describe('Bật/Tắt biến thể', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Bật biến thể trên product currentStock>0 → 422', async () => {
    const created = await jsonRequest<{ data: ProductResponse }>(
      env.app,
      'POST',
      '/',
      { name: 'X', sellingPrice: 100, trackInventory: true, initialStock: 10 },
      env.base.owner.authHeader,
    )
    const r = await jsonRequest<{ error: { code: string } }>(
      env.app,
      'PATCH',
      `/${created.body.data.id}`,
      {
        variantsConfig: {
          attribute1Name: 'Màu',
          variants: [{ sku: 'X-do', attribute1Value: 'Đỏ', sellingPrice: 100 }],
        },
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('BUSINESS_RULE_VIOLATION')
  })

  it('Bật biến thể trên product currentStock=0 → 200', async () => {
    const created = await jsonRequest<{ data: ProductResponse }>(
      env.app,
      'POST',
      '/',
      { name: 'X', sellingPrice: 100 },
      env.base.owner.authHeader,
    )
    const r = await jsonRequest<{ data: ProductResponse }>(
      env.app,
      'PATCH',
      `/${created.body.data.id}`,
      {
        variantsConfig: {
          attribute1Name: 'Màu',
          variants: [{ sku: 'X-do', attribute1Value: 'Đỏ', sellingPrice: 100 }],
        },
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.hasVariants).toBe(true)
    const logs = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'product.variants_enabled'))
    expect(logs.length).toBeGreaterThanOrEqual(1)
  })

  it('Tắt biến thể (variantsConfig=null) khi mọi variant chưa giao dịch → 200', async () => {
    const created = await jsonRequest<{ data: ProductResponse }>(
      env.app,
      'POST',
      '/',
      variantsCreate,
      env.base.owner.authHeader,
    )
    const r = await jsonRequest<{ data: ProductResponse }>(
      env.app,
      'PATCH',
      `/${created.body.data.id}`,
      { variantsConfig: null },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.hasVariants).toBe(false)
    const logs = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'product.variants_disabled'))
    expect(logs).toHaveLength(1)
  })

  it('Tắt biến thể khi có variant đã giao dịch → 422', async () => {
    const created = await jsonRequest<{ data: ProductResponse }>(
      env.app,
      'POST',
      '/',
      variantsCreate,
      env.base.owner.authHeader,
    )
    const variantId = created.body.data.variantsConfig!.variants[0]!.id
    await env.base.db.insert(inventoryTransactions).values({
      storeId: env.base.storeId,
      productId: created.body.data.id,
      variantId,
      type: 'manual_adjustment',
      quantity: 5,
      createdBy: env.base.owner.id,
    })
    const r = await jsonRequest<{ error: { code: string } }>(
      env.app,
      'PATCH',
      `/${created.body.data.id}`,
      { variantsConfig: null },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(422)
  })
})

describe('Categories integration with variants', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Xoá danh mục có 1 product có 9 variants → block với count=1 product', async () => {
    const cat = await jsonRequest<{ data: CategoryResponse }>(
      env.catApp,
      'POST',
      '/',
      { name: 'Áo' },
      env.base.owner.authHeader,
    )
    const variants = []
    const colorMap: Record<string, string> = { Đỏ: 'do', Xanh: 'xanh', Vàng: 'vang' }
    for (const c of Object.keys(colorMap)) {
      for (const s of ['S', 'M', 'L']) {
        variants.push({
          sku: `AP-${colorMap[c]}-${s.toLowerCase()}`,
          attribute1Value: c,
          attribute2Value: s,
          sellingPrice: 100,
        })
      }
    }
    await jsonRequest(
      env.app,
      'POST',
      '/',
      {
        name: 'Áo polo',
        sku: 'AP-001',
        sellingPrice: 0,
        categoryId: cat.body.data.id,
        variantsConfig: {
          attribute1Name: 'Màu',
          attribute2Name: 'Size',
          variants,
        },
      },
      env.base.owner.authHeader,
    )
    const r = await env.catApp.request(`/${cat.body.data.id}`, {
      method: 'DELETE',
      headers: env.base.owner.authHeader,
    })
    expect(r.status).toBe(422)
    const body = (await r.json()) as { error: { message: string } }
    expect(body.error.message).toContain('1 sản phẩm')
  })
})

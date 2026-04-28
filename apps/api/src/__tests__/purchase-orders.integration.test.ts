import { and, eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  auditLogs,
  inventoryTransactions,
  products,
  productVariants,
  purchaseOrderItems,
  suppliers,
} from '@kiotviet-lite/shared'

import { createProductsRoutes } from '../routes/products.routes.js'
import { createPurchaseOrdersRoutes } from '../routes/purchase-orders.routes.js'
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

interface SupplierResp {
  id: string
  name: string
  currentDebt: number
  totalPurchased: number
  purchaseCount: number
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
interface POItemResp {
  productId: string
  quantity: number
  unitPrice: number
  discountAmount: number
  lineTotal: number
  costAfter: number | null
  stockAfter: number | null
  productNameSnapshot: string
  productSkuSnapshot: string
  variantLabelSnapshot: string | null
}
interface PODetailResp {
  id: string
  code: string
  supplierId: string
  supplierName: string
  itemCount: number
  subtotal: number
  discountTotal: number
  totalAmount: number
  paidAmount: number
  paymentStatus: 'unpaid' | 'partial' | 'paid'
  items: POItemResp[]
  supplier: { id: string; name: string; phone: string | null }
}
interface ApiError {
  error: { code: string; message: string; details?: { field?: string } }
}

interface Env {
  base: TestEnv
  poApp: ReturnType<typeof createPurchaseOrdersRoutes>
  supApp: ReturnType<typeof createSuppliersRoutes>
  prodApp: ReturnType<typeof createProductsRoutes>
}

async function setup(): Promise<Env> {
  const base = await createTestEnv()
  return {
    base,
    poApp: createPurchaseOrdersRoutes({ db: base.db }),
    supApp: createSuppliersRoutes({ db: base.db }),
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

async function createSupplierFixture(env: Env, name = 'NCC Test'): Promise<SupplierResp> {
  const r = await jsonRequest<{ data: SupplierResp }>(
    env.supApp,
    'POST',
    '/',
    { name },
    env.base.owner.authHeader,
  )
  return r.body.data
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
      unit: 'cái',
      trackInventory: true,
      ...override,
    },
    env.base.owner.authHeader,
  )
  return r.body.data
}

async function createVariantProductFixture(env: Env): Promise<ProductResp> {
  const suffix = Math.random().toString(36).slice(2, 6)
  const r = await jsonRequest<{ data: ProductResp }>(
    env.prodApp,
    'POST',
    '/',
    {
      name: `Áo thun ${suffix}`,
      sku: `AT-${suffix}`,
      sellingPrice: 0,
      variantsConfig: {
        attribute1Name: 'Màu',
        variants: [
          { sku: `AT-${suffix}-do`, attribute1Value: 'Đỏ', sellingPrice: 100_000 },
          { sku: `AT-${suffix}-xanh`, attribute1Value: 'Xanh', sellingPrice: 100_000 },
        ],
      },
    },
    env.base.owner.authHeader,
  )
  return r.body.data
}

describe('POST /purchase-orders (createPurchaseOrder)', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Owner tạo PO 1 dòng → 201, code đúng định dạng PN-YYYYMMDD-XXXX', async () => {
    const supplier = await createSupplierFixture(env)
    const product = await createProductFixture(env)
    const r = await jsonRequest<{ data: PODetailResp }>(
      env.poApp,
      'POST',
      '/',
      {
        supplierId: supplier.id,
        items: [
          {
            productId: product.id,
            quantity: 10,
            unitPrice: 78_000,
            discountType: 'amount',
            discountValue: 0,
          },
        ],
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
    expect(r.body.data.code).toMatch(/^PN-\d{8}-\d{4}$/)
    expect(r.body.data.itemCount).toBe(1)
    expect(r.body.data.subtotal).toBe(780_000)
    expect(r.body.data.totalAmount).toBe(780_000)
    expect(r.body.data.paymentStatus).toBe('unpaid')
  })

  it('Manager tạo OK', async () => {
    const supplier = await createSupplierFixture(env)
    const product = await createProductFixture(env)
    const r = await jsonRequest<{ data: PODetailResp }>(
      env.poApp,
      'POST',
      '/',
      {
        supplierId: supplier.id,
        items: [
          {
            productId: product.id,
            quantity: 5,
            unitPrice: 50_000,
          },
        ],
      },
      env.base.manager.authHeader,
    )
    expect(r.status).toBe(201)
  })

  it('Staff tạo → 403', async () => {
    const supplier = await createSupplierFixture(env)
    const product = await createProductFixture(env)
    const r = await jsonRequest<ApiError>(
      env.poApp,
      'POST',
      '/',
      {
        supplierId: supplier.id,
        items: [{ productId: product.id, quantity: 1, unitPrice: 1000 }],
      },
      env.base.staff.authHeader,
    )
    expect(r.status).toBe(403)
  })

  it('items rỗng → 400', async () => {
    const supplier = await createSupplierFixture(env)
    const r = await jsonRequest<ApiError>(
      env.poApp,
      'POST',
      '/',
      { supplierId: supplier.id, items: [] },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
  })

  it('supplierId không tồn tại → 404', async () => {
    const product = await createProductFixture(env)
    const r = await jsonRequest<ApiError>(
      env.poApp,
      'POST',
      '/',
      {
        supplierId: '00000000-0000-7000-8000-000000000000',
        items: [{ productId: product.id, quantity: 1, unitPrice: 1000 }],
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(404)
  })

  it('items trùng productId+variantId → 422', async () => {
    const supplier = await createSupplierFixture(env)
    const product = await createProductFixture(env)
    const r = await jsonRequest<ApiError>(
      env.poApp,
      'POST',
      '/',
      {
        supplierId: supplier.id,
        items: [
          { productId: product.id, quantity: 1, unitPrice: 1000 },
          { productId: product.id, quantity: 2, unitPrice: 1000 },
        ],
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(422)
  })

  it('paidAmount > totalAmount → 422', async () => {
    const supplier = await createSupplierFixture(env)
    const product = await createProductFixture(env)
    const r = await jsonRequest<ApiError>(
      env.poApp,
      'POST',
      '/',
      {
        supplierId: supplier.id,
        items: [{ productId: product.id, quantity: 1, unitPrice: 1000 }],
        paidAmount: 999_999,
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(422)
  })

  it('paymentStatus suy luận đúng: unpaid khi paidAmount=0, paid khi paidAmount=total', async () => {
    const supplier = await createSupplierFixture(env)
    const product = await createProductFixture(env)
    const r = await jsonRequest<{ data: PODetailResp }>(
      env.poApp,
      'POST',
      '/',
      {
        supplierId: supplier.id,
        items: [{ productId: product.id, quantity: 1, unitPrice: 100_000 }],
        paidAmount: 100_000,
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
    expect(r.body.data.paymentStatus).toBe('paid')

    const r2 = await jsonRequest<{ data: PODetailResp }>(
      env.poApp,
      'POST',
      '/',
      {
        supplierId: supplier.id,
        items: [{ productId: product.id, quantity: 1, unitPrice: 100_000 }],
        paidAmount: 30_000,
      },
      env.base.owner.authHeader,
    )
    expect(r2.body.data.paymentStatus).toBe('partial')
  })

  it('audit ghi purchase_order.created', async () => {
    const supplier = await createSupplierFixture(env)
    const product = await createProductFixture(env)
    const r = await jsonRequest<{ data: PODetailResp }>(
      env.poApp,
      'POST',
      '/',
      {
        supplierId: supplier.id,
        items: [{ productId: product.id, quantity: 1, unitPrice: 1000 }],
      },
      env.base.owner.authHeader,
    )
    const logs = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.targetId, r.body.data.id))
    const created = logs.find((l) => l.action === 'purchase_order.created')
    expect(created).toBeTruthy()
    expect(created?.actorRole).toBe('owner')
  })
})

describe('WAC computation', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Lần đầu: stockBefore=0, costBefore=null → costAfter = unitPrice', async () => {
    const supplier = await createSupplierFixture(env)
    const product = await createProductFixture(env, { sellingPrice: 10000 })
    const r = await jsonRequest<{ data: PODetailResp }>(
      env.poApp,
      'POST',
      '/',
      {
        supplierId: supplier.id,
        items: [{ productId: product.id, quantity: 10, unitPrice: 80_000 }],
      },
      env.base.owner.authHeader,
    )
    expect(r.body.data.items[0]?.costAfter).toBe(80_000)
    expect(r.body.data.items[0]?.stockAfter).toBe(10)
  })

  it('PO thứ hai: WAC tính từ stockBefore+costBefore, làm tròn Math.round', async () => {
    const supplier = await createSupplierFixture(env)
    const product = await createProductFixture(env, { sellingPrice: 10000 })
    // PO #1: 10 × 80_000 → cost = 80_000
    await jsonRequest(
      env.poApp,
      'POST',
      '/',
      {
        supplierId: supplier.id,
        items: [{ productId: product.id, quantity: 10, unitPrice: 80_000 }],
      },
      env.base.owner.authHeader,
    )
    // PO #2: 10 × 100_000 → WAC = (10*80000 + 10*100000) / 20 = 90_000
    const r = await jsonRequest<{ data: PODetailResp }>(
      env.poApp,
      'POST',
      '/',
      {
        supplierId: supplier.id,
        items: [{ productId: product.id, quantity: 10, unitPrice: 100_000 }],
      },
      env.base.owner.authHeader,
    )
    expect(r.body.data.items[0]?.costAfter).toBe(90_000)
    expect(r.body.data.items[0]?.stockAfter).toBe(20)
  })
})

describe('GET /purchase-orders (list)', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Trả flat list với meta pagination', async () => {
    const supplier = await createSupplierFixture(env)
    const product = await createProductFixture(env)
    await jsonRequest(
      env.poApp,
      'POST',
      '/',
      {
        supplierId: supplier.id,
        items: [{ productId: product.id, quantity: 1, unitPrice: 1000 }],
      },
      env.base.owner.authHeader,
    )
    const r = await jsonRequest<{ data: unknown[]; meta: { total: number } }>(
      env.poApp,
      'GET',
      '/',
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.meta.total).toBe(1)
  })
})

describe('Side-effects: products, supplier counters, inventory_transactions', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    env.base.close()
  })

  it('Cập nhật product.currentStock và product.costPrice', async () => {
    const supplier = await createSupplierFixture(env)
    const product = await createProductFixture(env)
    await jsonRequest(
      env.poApp,
      'POST',
      '/',
      {
        supplierId: supplier.id,
        items: [{ productId: product.id, quantity: 7, unitPrice: 50_000 }],
      },
      env.base.owner.authHeader,
    )
    const [row] = await env.base.db.select().from(products).where(eq(products.id, product.id))
    expect(row?.currentStock).toBe(7)
    expect(row?.costPrice).toBe(50_000)
  })

  it('Cập nhật supplier counters: purchaseCount, totalPurchased, currentDebt', async () => {
    const supplier = await createSupplierFixture(env)
    const product = await createProductFixture(env)
    await jsonRequest(
      env.poApp,
      'POST',
      '/',
      {
        supplierId: supplier.id,
        items: [{ productId: product.id, quantity: 10, unitPrice: 50_000 }],
        paidAmount: 200_000,
      },
      env.base.owner.authHeader,
    )
    const [row] = await env.base.db.select().from(suppliers).where(eq(suppliers.id, supplier.id))
    expect(row?.purchaseCount).toBe(1)
    expect(row?.totalPurchased).toBe(500_000)
    expect(row?.currentDebt).toBe(300_000)
  })

  it('Tạo inventory_transaction kèm note=mã phiếu', async () => {
    const supplier = await createSupplierFixture(env)
    const product = await createProductFixture(env)
    const r = await jsonRequest<{ data: PODetailResp }>(
      env.poApp,
      'POST',
      '/',
      {
        supplierId: supplier.id,
        items: [{ productId: product.id, quantity: 3, unitPrice: 12_000 }],
      },
      env.base.owner.authHeader,
    )
    const txs = await env.base.db
      .select()
      .from(inventoryTransactions)
      .where(
        and(
          eq(inventoryTransactions.productId, product.id),
          eq(inventoryTransactions.type, 'purchase'),
        ),
      )
    expect(txs.length).toBe(1)
    expect(txs[0]?.note).toBe(r.body.data.code)
  })

  it('Tạo purchase_order_items với đầy đủ snapshot fields', async () => {
    const supplier = await createSupplierFixture(env)
    const product = await createProductFixture(env, { name: 'Coca lon', sku: 'COCA-001' })
    const r = await jsonRequest<{ data: PODetailResp }>(
      env.poApp,
      'POST',
      '/',
      {
        supplierId: supplier.id,
        items: [{ productId: product.id, quantity: 5, unitPrice: 10_000 }],
      },
      env.base.owner.authHeader,
    )
    const rows = await env.base.db
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.purchaseOrderId, r.body.data.id))
    expect(rows[0]?.productNameSnapshot).toBe('Coca lon')
    expect(rows[0]?.productSkuSnapshot).toBe('COCA-001')
    expect(rows[0]?.variantLabelSnapshot).toBeNull()
  })
})

describe('Multi-tenant safety', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Store A không thấy PO store B', async () => {
    const { stores: storesSchema, users: usersSchema } = await import('@kiotviet-lite/shared')
    const { hashPassword } = await import('../lib/password.js')
    const { signAccessToken } = await import('../lib/jwt.js')

    const supplier = await createSupplierFixture(env)
    const product = await createProductFixture(env)
    const created = await jsonRequest<{ data: PODetailResp }>(
      env.poApp,
      'POST',
      '/',
      {
        supplierId: supplier.id,
        items: [{ productId: product.id, quantity: 1, unitPrice: 1000 }],
      },
      env.base.owner.authHeader,
    )

    const [storeB] = await env.base.db.insert(storesSchema).values({ name: 'Store B' }).returning()
    const [ownerB] = await env.base.db
      .insert(usersSchema)
      .values({
        storeId: storeB!.id,
        name: 'Owner B',
        phone: '0908888888',
        passwordHash: await hashPassword('pwdpwd'),
        pinHash: await hashPassword('888888'),
        role: 'owner',
      })
      .returning()
    const tokenB = signAccessToken({
      userId: ownerB!.id,
      storeId: storeB!.id,
      role: 'owner',
    })
    const authB = { Authorization: `Bearer ${tokenB}` }

    const r = await jsonRequest<ApiError>(
      env.poApp,
      'GET',
      `/${created.body.data.id}`,
      undefined,
      authB,
    )
    expect(r.status).toBe(404)
  })
})

describe('PO với sản phẩm có biến thể (variant flow)', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('PO với 1 variant item → variant.stockQuantity tăng, product.currentStock giữ nguyên 0', async () => {
    const supplier = await createSupplierFixture(env)
    const product = await createVariantProductFixture(env)
    const variants = product.variantsConfig?.variants ?? []
    expect(variants.length).toBe(2)
    const v0 = variants[0]!

    const r = await jsonRequest<{ data: PODetailResp }>(
      env.poApp,
      'POST',
      '/',
      {
        supplierId: supplier.id,
        items: [
          {
            productId: product.id,
            variantId: v0.id,
            quantity: 5,
            unitPrice: 80_000,
          },
        ],
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
    expect(r.body.data.items[0]?.costAfter).toBe(80_000)
    expect(r.body.data.items[0]?.stockAfter).toBe(5)
    expect(r.body.data.items[0]?.variantLabelSnapshot).toBe('Đỏ')

    const [variantRow] = await env.base.db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, v0.id))
    expect(variantRow?.stockQuantity).toBe(5)

    const [productRow] = await env.base.db
      .select()
      .from(products)
      .where(eq(products.id, product.id))
    // hasVariants → product.currentStock KHÔNG thay đổi
    expect(productRow?.currentStock).toBe(0)
    // costPrice cấp product được update theo WAC của tổng tồn
    expect(productRow?.costPrice).toBe(80_000)
  })

  it('PO với 2 items cùng product khác variant → cả 2 variant stock tăng', async () => {
    const supplier = await createSupplierFixture(env)
    const product = await createVariantProductFixture(env)
    const variants = product.variantsConfig?.variants ?? []
    const [v0, v1] = variants
    expect(v0).toBeTruthy()
    expect(v1).toBeTruthy()

    const r = await jsonRequest<{ data: PODetailResp }>(
      env.poApp,
      'POST',
      '/',
      {
        supplierId: supplier.id,
        items: [
          {
            productId: product.id,
            variantId: v0!.id,
            quantity: 3,
            unitPrice: 80_000,
          },
          {
            productId: product.id,
            variantId: v1!.id,
            quantity: 7,
            unitPrice: 100_000,
          },
        ],
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)

    const variantRows = await env.base.db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, product.id))
    const byId = new Map(variantRows.map((v) => [v.id, v]))
    expect(byId.get(v0!.id)?.stockQuantity).toBe(3)
    expect(byId.get(v1!.id)?.stockQuantity).toBe(7)

    const [productRow] = await env.base.db
      .select()
      .from(products)
      .where(eq(products.id, product.id))
    expect(productRow?.currentStock).toBe(0)
    // WAC sau item 2: stockBefore=3, costBefore=80_000, qty=7, unitCost=100_000
    // → (3*80_000 + 7*100_000) / 10 = (240_000 + 700_000)/10 = 94_000
    expect(productRow?.costPrice).toBe(94_000)
  })
})

describe('Discount edge cases', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Discount amount lớn hơn line subtotal → 422', async () => {
    const supplier = await createSupplierFixture(env)
    const product = await createProductFixture(env)
    const r = await jsonRequest<ApiError>(
      env.poApp,
      'POST',
      '/',
      {
        supplierId: supplier.id,
        items: [
          {
            productId: product.id,
            quantity: 2,
            unitPrice: 50_000,
            discountType: 'amount',
            discountValue: 200_000,
          },
        ],
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(422)
  })

  it('Discount percent type=percent value=500 → áp 5% line', async () => {
    const supplier = await createSupplierFixture(env)
    const product = await createProductFixture(env)
    const r = await jsonRequest<{ data: PODetailResp }>(
      env.poApp,
      'POST',
      '/',
      {
        supplierId: supplier.id,
        items: [
          {
            productId: product.id,
            quantity: 10,
            unitPrice: 100_000,
            discountType: 'percent',
            discountValue: 500,
          },
        ],
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
    // subtotal = 10 * 100_000 = 1_000_000, 5% = 50_000
    expect(r.body.data.items[0]?.discountAmount).toBe(50_000)
    expect(r.body.data.items[0]?.lineTotal).toBe(950_000)
  })
})

describe('Race code generation', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Concurrent tạo 2 PO → cả 2 success với code khác nhau', async () => {
    const supplier = await createSupplierFixture(env)
    const product = await createProductFixture(env)
    const body = {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: 1, unitPrice: 1000 }],
    }
    const [r1, r2] = await Promise.all([
      jsonRequest<{ data: PODetailResp }>(env.poApp, 'POST', '/', body, env.base.owner.authHeader),
      jsonRequest<{ data: PODetailResp }>(env.poApp, 'POST', '/', body, env.base.owner.authHeader),
    ])
    expect(r1.status).toBe(201)
    expect(r2.status).toBe(201)
    expect(r1.body.data.code).not.toBe(r2.body.data.code)
    expect(r1.body.data.code).toMatch(/^PN-\d{8}-\d{4}$/)
    expect(r2.body.data.code).toMatch(/^PN-\d{8}-\d{4}$/)
  })
})

describe('Transaction rollback', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Khi paidAmount > totalAmount → rollback, supplier counters không thay đổi', async () => {
    const supplier = await createSupplierFixture(env)
    const product = await createProductFixture(env)
    // Trước khi gọi: snapshot
    const [supBefore] = await env.base.db
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, supplier.id))
    const [prodBefore] = await env.base.db
      .select()
      .from(products)
      .where(eq(products.id, product.id))

    const r = await jsonRequest<ApiError>(
      env.poApp,
      'POST',
      '/',
      {
        supplierId: supplier.id,
        items: [{ productId: product.id, quantity: 5, unitPrice: 50_000 }],
        paidAmount: 999_999_999,
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(422)

    // Verify rollback: supplier counters + product stock + costPrice giữ nguyên
    const [supAfter] = await env.base.db
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, supplier.id))
    expect(supAfter?.currentDebt).toBe(supBefore?.currentDebt ?? 0)
    expect(supAfter?.purchaseCount).toBe(supBefore?.purchaseCount ?? 0)
    expect(supAfter?.totalPurchased).toBe(supBefore?.totalPurchased ?? 0)

    const [prodAfter] = await env.base.db.select().from(products).where(eq(products.id, product.id))
    expect(prodAfter?.currentStock).toBe(prodBefore?.currentStock ?? 0)
    expect(prodAfter?.costPrice).toBe(prodBefore?.costPrice ?? null)

    // Inventory transactions cũng rỗng
    const txs = await env.base.db
      .select()
      .from(inventoryTransactions)
      .where(eq(inventoryTransactions.productId, product.id))
    expect(txs.length).toBe(0)
  })
})

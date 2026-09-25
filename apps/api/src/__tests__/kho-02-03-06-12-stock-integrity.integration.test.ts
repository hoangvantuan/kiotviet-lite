import { and, eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  categories,
  inventoryTransactions,
  products,
  productVariants,
  stockCheckLogs,
  stores,
  suppliers,
} from '@kiotviet-lite/shared'

import { createProductsRoutes } from '../routes/products.routes.js'
import { createPurchaseOrdersRoutes } from '../routes/purchase-orders.routes.js'
import { createReportsRoutes } from '../routes/reports.routes.js'
import { createStockChecksRoutes } from '../routes/stock-checks.routes.js'
import {
  createCompletedOrder,
  createProduct,
  createVariant,
  resetFactorySeq,
} from './helpers/factories.js'
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

interface ErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown> }
}

let env: TestEnv
let scApp: RequestableApp
let prodApp: RequestableApp
let poApp: RequestableApp
let reportsApp: RequestableApp
let supplierId: string

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call<T = any>(
  app: RequestableApp,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: T }> {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', ...env.owner.authHeader },
  }
  if (body !== undefined) init.body = JSON.stringify(body)
  const res = await app.request(path, init)
  const text = await res.text()
  return { status: res.status, body: text ? (JSON.parse(text) as T) : (undefined as T) }
}

async function productRow(id: string) {
  const [row] = await env.db.select().from(products).where(eq(products.id, id))
  return row!
}

async function variantRow(id: string) {
  const [row] = await env.db.select().from(productVariants).where(eq(productVariants.id, id))
  return row!
}

beforeEach(async () => {
  resetFactorySeq()
  env = await createTestEnv()
  scApp = createStockChecksRoutes({ db: env.db })
  prodApp = createProductsRoutes({ db: env.db })
  poApp = createPurchaseOrdersRoutes({ db: env.db })
  reportsApp = createReportsRoutes({ db: env.db })
  const [sup] = await env.db
    .insert(suppliers)
    .values({ storeId: env.storeId, name: 'NCC kho', code: 'NCC-KHO' })
    .returning()
  supplierId = sup!.id
})

afterEach(async () => {
  await env.close()
})

describe('KHO-02: xác nhận phiếu kiểm có tồn đã đổi sau lúc đếm', () => {
  it('Tái hiện w4: đếm OC001 được 10 khi tồn 12, nhập thêm 5 rồi xác nhận → chặn, tồn giữ 17', async () => {
    const p = await createProduct(env, { sku: 'OC001', currentStock: 12, costPrice: 40_000 })

    const draft = await call(scApp, 'POST', '/', { items: [{ productId: p.id, actualQty: 10 }] })
    expect(draft.status).toBe(201)
    expect(draft.body.data.items[0]).toMatchObject({ systemQty: 12, actualQty: 10, diff: -2 })

    const po = await call(poApp, 'POST', '/', {
      supplierId,
      items: [{ productId: p.id, quantity: 5, unitPrice: 50_000 }],
      paidAmount: 250_000,
    })
    expect(po.status).toBe(201)
    expect((await productRow(p.id)).currentStock).toBe(17)

    const conf = await call<ErrorBody>(scApp, 'POST', `/${draft.body.data.id}/confirm`)
    expect(conf.status).toBe(422)
    expect(conf.body.error.code).toBe('BUSINESS_RULE_VIOLATION')
    expect(conf.body.error.message).toMatch(/đếm lại/)
    expect(conf.body.error.details).toMatchObject({
      code: 'STOCK_CHANGED_SINCE_COUNT',
      items: [{ productId: p.id, variantId: null, systemQty: 12, currentStock: 17 }],
    })

    // Không âm thầm áp chênh lệch cũ: tồn vẫn 17, không có dòng sổ kiểm kho
    expect((await productRow(p.id)).currentStock).toBe(17)
    const ledger = await env.db
      .select()
      .from(inventoryTransactions)
      .where(
        and(
          eq(inventoryTransactions.productId, p.id),
          eq(inventoryTransactions.type, 'stock_check'),
        ),
      )
    expect(ledger).toHaveLength(0)
    const check = await call(scApp, 'GET', `/${draft.body.data.id}`)
    expect(check.body.data.status).toBe('draft')
  })

  it('Đếm lại và lưu phiếu thì tồn hệ thống tải lại, xác nhận đưa tồn về đúng số đếm', async () => {
    const p = await createProduct(env, { sku: 'OC001', currentStock: 12, costPrice: 40_000 })
    const draft = await call(scApp, 'POST', '/', { items: [{ productId: p.id, actualQty: 10 }] })
    await call(poApp, 'POST', '/', {
      supplierId,
      items: [{ productId: p.id, quantity: 5, unitPrice: 50_000 }],
      paidAmount: 250_000,
    })

    // Đếm lại sau khi nhận hàng: thực tế còn 10
    const recount = await call(scApp, 'PATCH', `/${draft.body.data.id}`, {
      items: [{ productId: p.id, actualQty: 10 }],
    })
    expect(recount.status).toBe(200)
    expect(recount.body.data.items[0]).toMatchObject({ systemQty: 17, actualQty: 10, diff: -7 })

    const conf = await call(scApp, 'POST', `/${draft.body.data.id}/confirm`)
    expect(conf.status).toBe(200)
    expect((await productRow(p.id)).currentStock).toBe(10)
    const [log] = await env.db
      .select()
      .from(stockCheckLogs)
      .where(eq(stockCheckLogs.stockCheckId, draft.body.data.id))
    expect(log).toMatchObject({ systemQty: 17, actualQty: 10, diff: -7 })
  })

  it('Dòng khớp tồn (chênh 0) mà tồn đổi sau lúc đếm cũng bị chặn', async () => {
    const p = await createProduct(env, { currentStock: 20 })
    const draft = await call(scApp, 'POST', '/', { items: [{ productId: p.id, actualQty: 20 }] })
    await env.db.update(products).set({ currentStock: 18 }).where(eq(products.id, p.id))

    const conf = await call<ErrorBody>(scApp, 'POST', `/${draft.body.data.id}/confirm`)
    expect(conf.status).toBe(422)
    expect(conf.body.error.details).toMatchObject({
      code: 'STOCK_CHANGED_SINCE_COUNT',
      items: [{ systemQty: 20, currentStock: 18 }],
    })
  })

  it('Biến thể có tồn đổi sau lúc đếm → chặn, tồn biến thể giữ nguyên', async () => {
    const p = await createProduct(env, { withVariants: true, currentStock: 8 })
    const v = await createVariant(env, p.id, { stockQuantity: 8 })
    const draft = await call(scApp, 'POST', '/', {
      items: [{ productId: p.id, variantId: v.id, actualQty: 6 }],
    })
    expect(draft.status).toBe(201)
    await env.db
      .update(productVariants)
      .set({ stockQuantity: 11 })
      .where(eq(productVariants.id, v.id))

    const conf = await call<ErrorBody>(scApp, 'POST', `/${draft.body.data.id}/confirm`)
    expect(conf.status).toBe(422)
    expect(conf.body.error.details).toMatchObject({
      code: 'STOCK_CHANGED_SINCE_COUNT',
      items: [{ variantId: v.id, systemQty: 8, currentStock: 11 }],
    })
    expect((await variantRow(v.id)).stockQuantity).toBe(11)
  })
})

describe('KHO-03: không cho xóa sản phẩm, biến thể còn tồn', () => {
  it('Tái hiện w4: AUDIT-KHO-01 tồn 7 → xóa bị chặn, sản phẩm không vào thùng rác', async () => {
    const p = await createProduct(env, { sku: 'AUDIT-KHO-01', currentStock: 7, costPrice: 5_000 })
    const r = await call<ErrorBody>(prodApp, 'DELETE', `/${p.id}`)
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('BUSINESS_RULE_VIOLATION')
    expect(r.body.error.message).toMatch(/kiểm kho về 0/)
    expect(r.body.error.message).toMatch(/Ngừng bán/)
    expect((await productRow(p.id)).deletedAt).toBeNull()
  })

  it('Tồn âm cũng bị chặn, tồn 0 thì xóa được', async () => {
    const neg = await createProduct(env, { currentStock: -3 })
    expect((await call(prodApp, 'DELETE', `/${neg.id}`)).status).toBe(422)
    expect((await productRow(neg.id)).deletedAt).toBeNull()

    const zero = await createProduct(env, { currentStock: 0 })
    expect((await call(prodApp, 'DELETE', `/${zero.id}`)).status).toBe(200)
    expect((await productRow(zero.id)).deletedAt).not.toBeNull()
  })

  it('Sản phẩm có biến thể: một biến thể còn tồn thì chặn xóa, kể cả khi tổng tồn bằng 0', async () => {
    const p = await createProduct(env, { withVariants: true, currentStock: 0 })
    await createVariant(env, p.id, { stockQuantity: 5 })
    await createVariant(env, p.id, { stockQuantity: -5 })
    const r = await call<ErrorBody>(prodApp, 'DELETE', `/${p.id}`)
    expect(r.status).toBe(422)
    expect((await productRow(p.id)).deletedAt).toBeNull()
  })

  it('Bỏ biến thể còn tồn khỏi danh sách biến thể (xóa mềm) → chặn; biến thể tồn 0 thì bỏ được', async () => {
    const p = await createProduct(env, { withVariants: true, currentStock: 5 })
    const keep = await createVariant(env, p.id, { stockQuantity: 0, attribute1Value: 'Đỏ' })
    const stocked = await createVariant(env, p.id, { stockQuantity: 5, attribute1Value: 'Xanh' })
    const variantsConfig = (vs: (typeof keep)[]) => ({
      attribute1Name: 'Màu',
      variants: vs.map((v) => ({
        id: v.id,
        sku: v.sku,
        attribute1Value: v.attribute1Value,
        sellingPrice: Number(v.sellingPrice),
      })),
    })

    const blocked = await call<ErrorBody>(prodApp, 'PATCH', `/${p.id}`, {
      variantsConfig: variantsConfig([keep]),
    })
    expect(blocked.status).toBe(422)
    expect(blocked.body.error.message).toMatch(/kiểm kho về 0/)
    expect((await variantRow(stocked.id)).deletedAt).toBeNull()

    const ok = await call(prodApp, 'PATCH', `/${p.id}`, {
      variantsConfig: variantsConfig([stocked]),
    })
    expect(ok.status).toBe(200)
    const removed = await env.db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, keep.id))
    expect(removed[0]?.deletedAt ?? 'đã xóa').not.toBeNull()
  })

  it('Tắt biến thể khi các biến thể còn tồn bù trừ nhau (+5, -5) → chặn', async () => {
    const p = await createProduct(env, { withVariants: true, currentStock: 0 })
    await createVariant(env, p.id, { stockQuantity: 5 })
    await createVariant(env, p.id, { stockQuantity: -5 })
    const r = await call<ErrorBody>(prodApp, 'PATCH', `/${p.id}`, { variantsConfig: null })
    expect(r.status).toBe(422)
    const alive = await env.db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, p.id))
    expect(alive).toHaveLength(2)
  })
})

describe('KHO-06: đổi đơn vị tính cơ bản của sản phẩm đã có tồn hoặc chứng từ', () => {
  it('Tái hiện w4: NM001 Chai tồn 113, PATCH unit=Thùng → chặn, đơn vị giữ Chai', async () => {
    const p = await createProduct(env, { sku: 'NM001', unit: 'Chai', currentStock: 113 })
    const r = await call<ErrorBody>(prodApp, 'PATCH', `/${p.id}`, { unit: 'Thùng' })
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('BUSINESS_RULE_VIOLATION')
    expect(r.body.error.message).toMatch(/đơn vị tính/i)
    expect(r.body.error.details).toMatchObject({ field: 'unit' })
    expect((await productRow(p.id)).unit).toBe('Chai')
  })

  it('Tồn 0 nhưng đã có sổ kho (nhập rồi bán hết) → chặn', async () => {
    const p = await createProduct(env, { unit: 'Chai', currentStock: 0 })
    await env.db.insert(inventoryTransactions).values({
      storeId: env.storeId,
      productId: p.id,
      type: 'purchase',
      quantity: 10,
      stockAfter: 10,
      createdBy: env.owner.id,
    })
    const r = await call<ErrorBody>(prodApp, 'PATCH', `/${p.id}`, { unit: 'Thùng' })
    expect(r.status).toBe(422)
    expect((await productRow(p.id)).unit).toBe('Chai')
  })

  it('Hàng không theo dõi tồn nhưng đã có đơn bán → chặn', async () => {
    const p = await createProduct(env, { unit: 'Ly', currentStock: 0, trackInventory: false })
    await createCompletedOrder(env, p.id)
    const r = await call<ErrorBody>(prodApp, 'PATCH', `/${p.id}`, { unit: 'Cốc' })
    expect(r.status).toBe(422)
  })

  it('Chỉ đổi cách viết (hoa thường, khoảng trắng) thì cho sửa dù đang có tồn', async () => {
    const p = await createProduct(env, { unit: 'chai', currentStock: 113 })
    const r = await call(prodApp, 'PATCH', `/${p.id}`, { unit: 'Chai' })
    expect(r.status).toBe(200)
    expect((await productRow(p.id)).unit).toBe('Chai')
  })

  it('Sản phẩm mới chưa có tồn và chứng từ thì đổi đơn vị được', async () => {
    const p = await createProduct(env, { unit: 'Chai', currentStock: 0 })
    const r = await call(prodApp, 'PATCH', `/${p.id}`, { unit: 'Thùng' })
    expect(r.status).toBe(200)
    expect((await productRow(p.id)).unit).toBe('Thùng')
  })
})

describe('KHO-12: báo cáo tồn kho lọc theo danh mục', () => {
  async function seedCategories() {
    const [thucPham] = await env.db
      .insert(categories)
      .values({ storeId: env.storeId, name: 'Thực phẩm' })
      .returning()
    const [rauCu] = await env.db
      .insert(categories)
      .values({ storeId: env.storeId, name: 'Rau củ quả', parentId: thucPham!.id })
      .returning()
    const [thit] = await env.db
      .insert(categories)
      .values({ storeId: env.storeId, name: 'Thịt', parentId: thucPham!.id, sortOrder: 1 })
      .returning()
    const [doUong] = await env.db
      .insert(categories)
      .values({ storeId: env.storeId, name: 'Đồ uống', sortOrder: 1 })
      .returning()
    const carrot = await createProduct(env, {
      name: 'Cà rốt',
      categoryId: rauCu!.id,
      currentStock: 10,
      costPrice: 15_000,
      minStock: 20,
    })
    const pork = await createProduct(env, {
      name: 'Thịt heo',
      categoryId: thit!.id,
      currentStock: 4,
      costPrice: 100_000,
      minStock: 10,
    })
    const coke = await createProduct(env, {
      name: 'Coca',
      categoryId: doUong!.id,
      currentStock: 50,
      costPrice: 8_000,
      minStock: 60,
    })
    const loose = await createProduct(env, {
      name: 'Hàng chưa phân loại',
      categoryId: null,
      currentStock: 3,
      costPrice: 1_000,
      minStock: 5,
    })
    return { thucPham: thucPham!, rauCu: rauCu!, doUong: doUong!, carrot, pork, coke, loose }
  }

  it('Tái hiện w4: lọc "Rau củ quả" ở tab Tồn hiện tại → chỉ hàng rau củ, tổng theo bộ lọc', async () => {
    const s = await seedCategories()
    const r = await call(reportsApp, 'GET', `/inventory?tab=current&categoryId=${s.rauCu.id}`)
    expect(r.status).toBe(200)
    expect(r.body.data.rows.map((x: { productId: string }) => x.productId)).toEqual([s.carrot.id])
    expect(r.body.data.summary).toEqual({ totalProducts: 1, totalStockValue: 150_000 })
  })

  it('Lọc danh mục cha gồm cả danh mục con; "none" là hàng chưa phân loại', async () => {
    const s = await seedCategories()
    const parent = await call(reportsApp, 'GET', `/inventory?categoryId=${s.thucPham.id}`)
    expect(parent.body.data.rows.map((x: { productId: string }) => x.productId).sort()).toEqual(
      [s.carrot.id, s.pork.id].sort(),
    )
    expect(parent.body.data.summary.totalStockValue).toBe(150_000 + 400_000)

    const none = await call(reportsApp, 'GET', '/inventory?categoryId=none')
    expect(none.body.data.rows.map((x: { productId: string }) => x.productId)).toEqual([s.loose.id])
  })

  it('Tab Cần nhập và Hàng chậm bán cũng theo bộ lọc danh mục', async () => {
    const s = await seedCategories()
    const reorder = await call(
      reportsApp,
      'GET',
      `/inventory?tab=reorder&categoryId=${s.doUong.id}`,
    )
    expect(reorder.body.data.rows.map((x: { productId: string }) => x.productId)).toEqual([
      s.coke.id,
    ])
    const slow = await call(reportsApp, 'GET', `/inventory?tab=slow&categoryId=${s.rauCu.id}`)
    expect(slow.body.data.rows.map((x: { productId: string }) => x.productId)).toEqual([
      s.carrot.id,
    ])
  })

  it('Danh mục của cửa hàng khác không lộ dữ liệu; categoryId sai định dạng → 400', async () => {
    await seedCategories()
    const [otherStore] = await env.db
      .insert(stores)
      .values({ name: 'Cửa hàng khác', phone: '0999999999' })
      .returning()
    const [foreignCat] = await env.db
      .insert(categories)
      .values({ storeId: otherStore!.id, name: 'Rau khác' })
      .returning()
    const foreign = await call(reportsApp, 'GET', `/inventory?categoryId=${foreignCat!.id}`)
    expect(foreign.status).toBe(200)
    expect(foreign.body.data.rows).toHaveLength(0)
    expect(foreign.body.data.summary.totalProducts).toBe(0)

    const bad = await call(reportsApp, 'GET', '/inventory?categoryId=abc')
    expect(bad.status).toBe(400)
  })
})

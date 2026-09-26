import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { priceListItems, volumePrices } from '@kiotviet-lite/shared'

import { createCustomerPricesRoutes } from '../routes/customer-prices.routes.js'
import { createPriceListsRoutes } from '../routes/price-lists.routes.js'
import { createVolumePricesRoutes } from '../routes/volume-prices.routes.js'
import { createCustomer, createProduct, createVariant } from './helpers/factories.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

// POS-08: các màn quản lý giá chọn được biến thể; dòng theo sản phẩm và dòng theo biến thể sống
// song song, trùng đúng cặp thì báo trùng.

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.ACCESS_TOKEN_TTL_SECONDS = '900'
  process.env.REFRESH_TOKEN_TTL_SECONDS = '604800'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

function buildApp(env: TestEnv) {
  const app = new Hono()
  app.route('/api/v1/customer-prices', createCustomerPricesRoutes({ db: env.db }))
  app.route('/api/v1/price-lists', createPriceListsRoutes({ db: env.db }))
  app.route('/api/v1/volume-prices', createVolumePricesRoutes({ db: env.db }))
  return app
}

let env: TestEnv
let app: ReturnType<typeof buildApp>

async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: { ...env.owner.authHeader, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, body: (text ? JSON.parse(text) : undefined) as any }
}

beforeEach(async () => {
  env = await createTestEnv()
  app = buildApp(env)
})

afterEach(async () => {
  await env.close()
})

async function shirt() {
  const product = await createProduct(env, { name: 'Áo thun', sku: 'AO-01', withVariants: true })
  const red = await createVariant(env, product.id, {
    sku: 'AO-01-DO',
    attribute1Value: 'Đỏ',
    sellingPrice: 120_000,
    costPrice: 90_000,
  })
  const blue = await createVariant(env, product.id, { sku: 'AO-01-XANH', attribute1Value: 'Xanh' })
  const other = await createProduct(env, { withVariants: true })
  const foreign = await createVariant(env, other.id)
  return { product, red, blue, foreign }
}

describe('POS-08: giá riêng khách theo biến thể', () => {
  it('tạo dòng theo sản phẩm và theo biến thể, trùng cặp thì báo trùng, biến thể lạ thì từ chối', async () => {
    const { product, red, foreign } = await shirt()
    const customer = await createCustomer(env)
    const base = { customerId: customer.id, productId: product.id }

    expect(
      (await call('POST', '/api/v1/customer-prices', { ...base, price: 100_000 })).status,
    ).toBe(201)
    const byVariant = await call('POST', '/api/v1/customer-prices', {
      ...base,
      variantId: red.id,
      price: 110_000,
    })
    expect(byVariant.status).toBe(201)
    expect(byVariant.body.data).toMatchObject({
      variantId: red.id,
      variantName: 'Đỏ',
      productSellingPrice: 120_000,
      productCostPrice: 90_000,
    })

    const dupProduct = await call('POST', '/api/v1/customer-prices', { ...base, price: 1 })
    expect(dupProduct.status).toBe(409)
    const dupVariant = await call('POST', '/api/v1/customer-prices', {
      ...base,
      variantId: red.id,
      price: 1,
    })
    expect(dupVariant.status).toBe(409)
    expect(dupVariant.body.error.message).toContain('biến thể')

    const wrong = await call('POST', '/api/v1/customer-prices', {
      ...base,
      variantId: foreign.id,
      price: 1,
    })
    expect(wrong.status).toBe(404)

    const list = await call('GET', `/api/v1/customer-prices?customerId=${customer.id}`)
    expect(list.body.data.map((r: { variantName: string | null }) => r.variantName).sort()).toEqual(
      [null, 'Đỏ'].sort(),
    )
  })
})

describe('POS-08: bảng giá theo biến thể', () => {
  async function directList(items: unknown[] = []) {
    const res = await call('POST', '/api/v1/price-lists', {
      method: 'direct',
      name: `Bảng giá ${Math.random().toString(36).slice(2, 8)}`,
      items,
    })
    expect(res.status).toBe(201)
    return res.body.data.id as string
  }

  it('thêm dòng biến thể bên cạnh dòng sản phẩm, trùng cặp thì báo trùng', async () => {
    const { product, red, foreign } = await shirt()
    const listId = await directList([{ productId: product.id, price: 95_000 }])

    const added = await call('POST', `/api/v1/price-lists/${listId}/items`, {
      productId: product.id,
      variantId: red.id,
      price: 105_000,
    })
    expect(added.status).toBe(201)
    expect(added.body.data).toMatchObject({ variantId: red.id, variantName: 'Đỏ' })

    const dup = await call('POST', `/api/v1/price-lists/${listId}/items`, {
      productId: product.id,
      variantId: red.id,
      price: 1,
    })
    expect(dup.status).toBe(409)
    const wrong = await call('POST', `/api/v1/price-lists/${listId}/items`, {
      productId: product.id,
      variantId: foreign.id,
      price: 1,
    })
    expect(wrong.status).toBe(404)

    const items = await call('GET', `/api/v1/price-lists/${listId}/items`)
    expect(items.body.data).toHaveLength(2)
  })

  it('nhập CSV có cột variant_code: dòng có mã biến thể gắn biến thể, dòng trống gắn sản phẩm', async () => {
    const { product, red, blue } = await shirt()
    const listId = await directList([{ productId: product.id, price: 90_000 }])
    const csvText = [
      'product_code,variant_code,price',
      'AO-01,,99000',
      'AO-01,AO-01-DO,101000',
      'AO-01,ao-01-xanh,102000',
      'AO-01,AO-01-DO,1',
      'AO-01,KHONG-CO,1',
    ].join('\n')
    const res = await call('POST', `/api/v1/price-lists/${listId}/import`, {
      csvText,
      mode: 'upsert',
    })
    expect(res.status).toBe(200)
    expect(res.body.data.summary).toMatchObject({ totalRows: 5, imported: 3, skipped: 2 })

    const rows = await env.db
      .select({ variantId: priceListItems.variantId, price: priceListItems.price })
      .from(priceListItems)
      .where(eq(priceListItems.priceListId, listId))
    const byVariant = new Map(rows.map((r) => [r.variantId, Number(r.price)]))
    expect(byVariant.get(null)).toBe(99_000)
    expect(byVariant.get(red.id)).toBe(101_000)
    expect(byVariant.get(blue.id)).toBe(102_000)
    expect(rows).toHaveLength(3)
  })

  it('bảng công thức, nhân bản và so sánh giữ đúng dòng biến thể', async () => {
    const { product, red } = await shirt()
    const baseId = await directList([
      { productId: product.id, price: 100_000 },
      { productId: product.id, variantId: red.id, price: 130_000 },
    ])
    const formula = await call('POST', '/api/v1/price-lists', {
      method: 'formula',
      name: 'Bảng giá sỉ công thức',
      baseListId: baseId,
      formulaType: 'percent_decrease',
      formulaValue: 1000, // đơn vị phần vạn: 10%
    })
    expect(formula.status).toBe(201)
    const formulaId = formula.body.data.id as string
    const formulaRows = await env.db
      .select({ variantId: priceListItems.variantId, price: priceListItems.price })
      .from(priceListItems)
      .where(eq(priceListItems.priceListId, formulaId))
    expect(new Map(formulaRows.map((r) => [r.variantId, Number(r.price)]))).toEqual(
      new Map<string | null, number>([
        [null, 90_000],
        [red.id, 117_000],
      ]),
    )

    const recalc = await call('POST', `/api/v1/price-lists/${formulaId}/recalculate`)
    expect(recalc.status).toBe(200)
    expect(
      await env.db.select().from(priceListItems).where(eq(priceListItems.priceListId, formulaId)),
    ).toHaveLength(2)

    const clone = await call('POST', `/api/v1/price-lists/${baseId}/clone`, { name: 'Bản sao' })
    expect(clone.status).toBe(201)
    const cloned = await env.db
      .select()
      .from(priceListItems)
      .where(
        and(
          eq(priceListItems.priceListId, clone.body.data.id),
          eq(priceListItems.variantId, red.id),
        ),
      )
    expect(cloned).toHaveLength(1)

    const compare = await call(
      'GET',
      `/api/v1/price-lists/compare?listAId=${baseId}&listBId=${formulaId}`,
    )
    expect(compare.status).toBe(200)
    const redRow = compare.body.data.rows.find(
      (r: { variantId: string | null }) => r.variantId === red.id,
    )
    expect(redRow).toMatchObject({
      variantName: 'Đỏ',
      priceA: 130_000,
      priceB: 117_000,
      productCostPrice: 90_000,
    })
    expect(compare.body.data.rows).toHaveLength(2)
  })
})

describe('POS-08: giá theo số lượng theo biến thể', () => {
  it('lưu bậc giá của biến thể không xóa bậc giá theo sản phẩm', async () => {
    const { product, red, foreign } = await shirt()
    const path = `/api/v1/volume-prices/products/${product.id}`
    expect((await call('PUT', path, { tiers: [{ minQty: 5, price: 90_000 }] })).status).toBe(200)
    const variantPut = await call('PUT', path, {
      variantId: red.id,
      tiers: [{ minQty: 10, price: 100_000 }],
    })
    expect(variantPut.status).toBe(200)
    expect(variantPut.body.data).toMatchObject({ variantId: red.id, variantName: 'Đỏ' })

    const rows = await env.db
      .select({ variantId: volumePrices.variantId, minQty: volumePrices.minQty })
      .from(volumePrices)
      .where(eq(volumePrices.productId, product.id))
    expect(rows).toHaveLength(2)

    const productTiers = await call('GET', path)
    expect(productTiers.body.data.tiers.map((t: { minQty: number }) => t.minQty)).toEqual([5])
    const variantTiers = await call('GET', `${path}?variantId=${red.id}`)
    expect(variantTiers.body.data.tiers.map((t: { minQty: number }) => t.minQty)).toEqual([10])

    const list = await call('GET', '/api/v1/volume-prices')
    expect(list.body.data).toHaveLength(2)

    const wrong = await call('PUT', path, { variantId: foreign.id, tiers: [] })
    expect(wrong.status).toBe(404)
  })
})

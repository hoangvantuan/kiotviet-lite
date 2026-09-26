import { PGlite } from '@electric-sql/pglite'
import { Hono } from 'hono'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  categories,
  categoryDiscounts,
  customerGroups,
  customerPrices,
  priceListItems,
  priceLists,
  type ResolvedPriceItem,
  type ResolvePricesInput,
  type SyncPullResponse,
  volumePrices,
} from '@kiotviet-lite/shared'
import { pgliteMigrations } from '@kiotviet-lite/shared/migrations/pglite'
import {
  pullPageQuery,
  type PullPageRequest,
  resolvePricesOffline,
  syncCatalog,
} from '@kiotviet-lite/shared/offline'

import { createPosRoutes } from '../routes/pos.routes.js'
import { createSyncRoutes } from '../routes/sync.routes.js'
import {
  createCustomer,
  createProduct,
  createUnitConversion,
  createVariant,
} from './helpers/factories.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

// POS-08: bảng giá, giá riêng khách, giá theo số lượng gắn được theo biến thể.
// POS-16: giá bán riêng của đơn vị quy đổi không đè giá đặc biệt; nguồn đặc biệt nhân hệ số.
// M1: ngưỡng giá theo số lượng và chiết khấu danh mục so theo số lượng quy ra đơn vị tính.
// Mỗi ca so giá máy chủ (/pos/resolve-prices) với bản sao PGlite của máy bán hàng.

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
  app.route('/api/v1/pos', createPosRoutes({ db: env.db }))
  app.route('/api/v1/sync', createSyncRoutes({ db: env.db }))
  return app
}

let env: TestEnv
let app: ReturnType<typeof buildApp>
let client: PGlite

async function syncClient() {
  await syncCatalog({
    db: client,
    storeId: env.storeId,
    canViewCost: true,
    fetchPage: async (req: PullPageRequest) => {
      const res = await app.request(`/api/v1/sync/pull?${pullPageQuery(req)}`, {
        headers: env.owner.authHeader,
      })
      expect(res.status).toBe(200)
      return (await res.json()) as SyncPullResponse
    },
  })
}

/** Giá online, kèm kiểm giá ngoại tuyến trên bản sao vừa đồng bộ trùng khớp từng dòng */
async function resolveBoth(input: ResolvePricesInput): Promise<ResolvedPriceItem[]> {
  const res = await app.request('/api/v1/pos/resolve-prices', {
    method: 'POST',
    headers: { ...env.staff.authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  expect(res.status).toBe(200)
  const online = ((await res.json()) as { data: ResolvedPriceItem[] }).data
  await syncClient()
  const offline = await resolvePricesOffline(client, { storeId: env.storeId, input })
  expect(offline).toEqual(online)
  return online
}

beforeEach(async () => {
  env = await createTestEnv()
  app = buildApp(env)
  client = new PGlite()
  for (const m of pgliteMigrations) await client.exec(m.sql)
})

afterEach(async () => {
  await client.close()
  await env.close()
})

async function variantProduct() {
  const product = await createProduct(env, {
    name: 'Áo thun',
    sellingPrice: 100_000,
    withVariants: true,
  })
  const red = await createVariant(env, product.id, {
    attribute1Value: 'Đỏ',
    sellingPrice: 120_000,
    costPrice: 90_000,
  })
  const blue = await createVariant(env, product.id, {
    attribute1Value: 'Xanh',
    sellingPrice: 110_000,
    costPrice: 70_000,
  })
  return { product, red, blue }
}

describe('POS-08: giá theo biến thể', () => {
  it('bảng giá thu ngân chọn: dòng của biến thể áp cho biến thể đó, biến thể khác lấy dòng sản phẩm', async () => {
    const { product, red, blue } = await variantProduct()
    const [list] = await env.db
      .insert(priceLists)
      .values({ storeId: env.storeId, name: 'Bảng giá sỉ', method: 'direct' })
      .returning()
    await env.db.insert(priceListItems).values([
      { priceListId: list!.id, productId: product.id, variantId: null, price: 95_000 },
      { priceListId: list!.id, productId: product.id, variantId: red.id, price: 105_000 },
    ])

    const [redLine, blueLine] = await resolveBoth({
      customerId: null,
      priceListId: list!.id,
      items: [
        { productId: product.id, variantId: red.id, quantity: 1 },
        { productId: product.id, variantId: blue.id, quantity: 1 },
      ],
    })
    expect(redLine).toMatchObject({ price: 105_000, source: 'price_list' })
    expect(blueLine).toMatchObject({ price: 95_000, source: 'price_list' })
  })

  it('bảng giá nhóm khách: chỉ có dòng của biến thể thì biến thể khác về giá bán của nó', async () => {
    const { product, red, blue } = await variantProduct()
    const [list] = await env.db
      .insert(priceLists)
      .values({ storeId: env.storeId, name: 'Bảng giá VIP', method: 'direct' })
      .returning()
    await env.db
      .insert(priceListItems)
      .values({ priceListId: list!.id, productId: product.id, variantId: red.id, price: 100_000 })
    const [group] = await env.db
      .insert(customerGroups)
      .values({ storeId: env.storeId, name: 'VIP', defaultPriceListId: list!.id })
      .returning()
    const vip = await createCustomer(env, { groupId: group!.id })

    const [redLine, blueLine] = await resolveBoth({
      customerId: vip.id,
      priceListId: null,
      items: [
        { productId: product.id, variantId: red.id, quantity: 1 },
        { productId: product.id, variantId: blue.id, quantity: 1 },
      ],
    })
    expect(redLine).toMatchObject({ price: 100_000, source: 'price_list' })
    expect(blueLine).toMatchObject({ price: 110_000, source: 'retail_price' })
  })

  it('giá riêng khách của biến thể thắng giá riêng theo sản phẩm', async () => {
    const { product, red, blue } = await variantProduct()
    const customer = await createCustomer(env)
    await env.db.insert(customerPrices).values([
      { storeId: env.storeId, customerId: customer.id, productId: product.id, price: 80_000 },
      {
        storeId: env.storeId,
        customerId: customer.id,
        productId: product.id,
        variantId: red.id,
        price: 99_000,
      },
    ])

    const [redLine, blueLine] = await resolveBoth({
      customerId: customer.id,
      priceListId: null,
      items: [
        { productId: product.id, variantId: red.id, quantity: 1 },
        { productId: product.id, variantId: blue.id, quantity: 1 },
      ],
    })
    expect(redLine).toMatchObject({ price: 99_000, source: 'customer_price' })
    expect(blueLine).toMatchObject({ price: 80_000, source: 'customer_price' })
  })

  it('bậc giá theo số lượng của biến thể thay cả bộ bậc theo sản phẩm', async () => {
    const { product, red, blue } = await variantProduct()
    await env.db.insert(volumePrices).values([
      { storeId: env.storeId, productId: product.id, minQty: 5, price: 90_000 },
      {
        storeId: env.storeId,
        productId: product.id,
        variantId: red.id,
        minQty: 10,
        price: 100_000,
      },
    ])

    const [red5, red10, blue5] = await resolveBoth({
      customerId: null,
      priceListId: null,
      items: [
        { productId: product.id, variantId: red.id, quantity: 5 },
        { productId: product.id, variantId: red.id, quantity: 10 },
        { productId: product.id, variantId: blue.id, quantity: 5 },
      ],
    })
    expect(red5).toMatchObject({ price: 120_000, source: 'retail_price' })
    expect(red10).toMatchObject({ price: 100_000, source: 'volume_price' })
    expect(blue5).toMatchObject({ price: 90_000, source: 'volume_price' })
  })
})

describe('POS-16: đơn vị quy đổi có giá bán riêng', () => {
  it('giá riêng khách 430.000/hộp, Thùng 6 hộp giá 2.600.000 thì dòng Thùng là 2.580.000, nhãn Giá riêng', async () => {
    const ensure = await createProduct(env, { name: 'Sữa Ensure', sellingPrice: 450_000 })
    const box = await createUnitConversion(env, ensure.id, {
      unit: 'Thùng',
      conversionFactor: 6,
      sellingPrice: 2_600_000,
    })
    const customer = await createCustomer(env, { code: 'KH000008' })
    await env.db.insert(customerPrices).values({
      storeId: env.storeId,
      customerId: customer.id,
      productId: ensure.id,
      price: 430_000,
    })

    const [withPrice, walkIn] = [
      await resolveBoth({
        customerId: customer.id,
        priceListId: null,
        items: [{ productId: ensure.id, unitConversionId: box.id, quantity: 1 }],
      }),
      await resolveBoth({
        customerId: null,
        priceListId: null,
        items: [{ productId: ensure.id, unitConversionId: box.id, quantity: 1 }],
      }),
    ]
    expect(withPrice[0]).toMatchObject({
      price: 2_580_000,
      source: 'customer_price',
      sourceDetail: 'Giá riêng cho khách hàng',
    })
    // Không có nguồn đặc biệt: giá bán riêng của Thùng là giá bán
    expect(walkIn[0]).toMatchObject({
      price: 2_600_000,
      source: 'retail_price',
      sourceDetail: null,
    })
  })

  it('giá theo số lượng và bảng giá nhóm cũng nhân hệ số, không bị giá bán riêng của đơn vị đè', async () => {
    const p = await createProduct(env, { sellingPrice: 10_000 })
    const pack = await createUnitConversion(env, p.id, {
      conversionFactor: 10,
      sellingPrice: 95_000,
    })
    await env.db
      .insert(volumePrices)
      .values({ storeId: env.storeId, productId: p.id, minQty: 20, price: 9_000 })
    const [list] = await env.db
      .insert(priceLists)
      .values({ storeId: env.storeId, name: 'Bảng giá đại lý', method: 'direct' })
      .returning()
    await env.db
      .insert(priceListItems)
      .values({ priceListId: list!.id, productId: p.id, price: 8_500 })
    const [group] = await env.db
      .insert(customerGroups)
      .values({ storeId: env.storeId, name: 'Đại lý', defaultPriceListId: list!.id })
      .returning()
    const dealer = await createCustomer(env, { groupId: group!.id })

    const [volumeLine] = await resolveBoth({
      customerId: null,
      priceListId: null,
      items: [{ productId: p.id, unitConversionId: pack.id, quantity: 2 }],
    })
    expect(volumeLine).toMatchObject({ price: 90_000, source: 'volume_price' })

    // 1 gói = 10 đơn vị tính chưa tới bậc 20 (M1), bảng giá nhóm áp
    const [groupLine] = await resolveBoth({
      customerId: dealer.id,
      priceListId: null,
      items: [{ productId: p.id, unitConversionId: pack.id, quantity: 1 }],
    })
    expect(groupLine).toMatchObject({ price: 85_000, source: 'price_list' })
  })
})

describe('M1: ngưỡng số lượng tính theo đơn vị tính', () => {
  it('bậc từ 12 lon: 1 Thùng 24 lon vào bậc, 11 lon chưa vào, 12 lon vào', async () => {
    const beer = await createProduct(env, { name: 'Bia lon', unit: 'Lon', sellingPrice: 10_000 })
    const crate = await createUnitConversion(env, beer.id, {
      unit: 'Thùng',
      conversionFactor: 24,
      sellingPrice: 230_000,
    })
    await env.db
      .insert(volumePrices)
      .values({ storeId: env.storeId, productId: beer.id, minQty: 12, price: 9_000 })

    const [crateLine, cans11, cans12] = await resolveBoth({
      customerId: null,
      priceListId: null,
      items: [
        { productId: beer.id, unitConversionId: crate.id, quantity: 1 },
        { productId: beer.id, quantity: 11 },
        { productId: beer.id, quantity: 12 },
      ],
    })
    expect(crateLine).toMatchObject({
      price: 216_000,
      source: 'volume_price',
      sourceDetail: 'SL >= 12',
    })
    expect(cans11).toMatchObject({ price: 10_000, source: 'retail_price' })
    expect(cans12).toMatchObject({ price: 9_000, source: 'volume_price' })
  })

  it('chiết khấu danh mục từ 6 lon: 1 Lốc 6 lon được giảm, nhân hệ số trên giá lẻ, không trên giá bán riêng của Lốc', async () => {
    const [cat] = await env.db
      .insert(categories)
      .values({ storeId: env.storeId, name: 'Nước ngọt', sortOrder: 1 })
      .returning()
    const soda = await createProduct(env, {
      name: 'Nước ngọt lon',
      unit: 'Lon',
      sellingPrice: 10_000,
      categoryId: cat!.id,
    })
    const pack = await createUnitConversion(env, soda.id, {
      unit: 'Lốc',
      conversionFactor: 6,
      sellingPrice: 58_000,
    })
    const customer = await createCustomer(env)
    await env.db.insert(categoryDiscounts).values({
      storeId: env.storeId,
      categoryId: cat!.id,
      customerId: customer.id,
      discountType: 'percent',
      discountValue: 10,
      minQty: 6,
    })

    const [packLine, cans5] = await resolveBoth({
      customerId: customer.id,
      priceListId: null,
      items: [
        { productId: soda.id, unitConversionId: pack.id, quantity: 1 },
        { productId: soda.id, quantity: 5 },
      ],
    })
    expect(packLine).toMatchObject({ price: 54_000, source: 'category_discount' })
    expect(cans5).toMatchObject({ price: 10_000, source: 'retail_price' })
  })

  it('biến thể + đơn vị quy đổi + bậc số lượng của biến thể', async () => {
    const { product, red, blue } = await variantProduct()
    const box = await createUnitConversion(env, product.id, {
      unit: 'Hộp',
      conversionFactor: 3,
      sellingPrice: 0,
    })
    await env.db.insert(volumePrices).values({
      storeId: env.storeId,
      productId: product.id,
      variantId: red.id,
      minQty: 6,
      price: 100_000,
    })

    const [red2Box, red1Box, blue2Box] = await resolveBoth({
      customerId: null,
      priceListId: null,
      items: [
        { productId: product.id, variantId: red.id, unitConversionId: box.id, quantity: 2 },
        { productId: product.id, variantId: red.id, unitConversionId: box.id, quantity: 1 },
        { productId: product.id, variantId: blue.id, unitConversionId: box.id, quantity: 2 },
      ],
    })
    expect(red2Box).toMatchObject({ price: 300_000, source: 'volume_price' })
    expect(red1Box).toMatchObject({ price: 360_000, source: 'retail_price' })
    expect(blue2Box).toMatchObject({ price: 330_000, source: 'retail_price' })
  })

  it('bảng giá thu ngân chọn với đơn vị quy đổi: nhân hệ số, không bị giá bán riêng của đơn vị đè', async () => {
    const p = await createProduct(env, { sellingPrice: 10_000 })
    const pack = await createUnitConversion(env, p.id, {
      conversionFactor: 10,
      sellingPrice: 95_000,
    })
    const [list] = await env.db
      .insert(priceLists)
      .values({ storeId: env.storeId, name: 'Bảng giá sỉ', method: 'direct' })
      .returning()
    await env.db
      .insert(priceListItems)
      .values({ priceListId: list!.id, productId: p.id, price: 8_500 })

    const [line] = await resolveBoth({
      customerId: null,
      priceListId: list!.id,
      items: [{ productId: p.id, unitConversionId: pack.id, quantity: 1 }],
    })
    expect(line).toMatchObject({ price: 85_000, source: 'price_list' })
  })
})

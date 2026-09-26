import { PGlite } from '@electric-sql/pglite'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  categories,
  categoryDiscounts,
  customerGroups,
  customerPrices,
  customers,
  orders,
  priceListItems,
  priceLists,
  products,
  productUnitConversions,
  type ResolvedPriceItem,
  type SyncPullResponse,
  syncTombstones,
  volumePrices,
} from '@kiotviet-lite/shared'
import { pgliteMigrations } from '@kiotviet-lite/shared/migrations/pglite'
import {
  getCatalogCustomerDebt,
  getCatalogSyncMeta,
  pullPageQuery,
  type PullPageRequest,
  purgeCatalogCostIfForbidden,
  resolvePricesOffline,
  searchCatalogCustomers,
  searchCatalogProducts,
  syncCatalog,
} from '@kiotviet-lite/shared/offline'

import { signAccessToken } from '../lib/jwt.js'
import { createPosRoutes } from '../routes/pos.routes.js'
import { createSyncRoutes } from '../routes/sync.routes.js'
import {
  createCustomer,
  createProduct,
  createStore,
  createUnitConversion,
  createUser,
  createVariant,
} from './helpers/factories.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

// GL-03, OFF-09, OFF-15: chạy trọn chuỗi thật, máy chủ (/sync/pull) tới bản sao PGlite của máy
// bán hàng (cùng mã với trình duyệt), rồi tìm hàng, tìm khách, tính giá, đọc nợ trên bản sao đó.

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

type Header = { Authorization: string }

async function newClientDb(): Promise<PGlite> {
  const client = new PGlite()
  for (const m of pgliteMigrations) await client.exec(m.sql)
  return client
}

let env: TestEnv
let app: ReturnType<typeof buildApp>
let client: PGlite

async function pullRaw(header: Header, query: string) {
  const res = await app.request(`/api/v1/sync/pull?${query}`, { headers: header })
  expect(res.status).toBe(200)
  return (await res.json()) as SyncPullResponse
}

function fetcher(header: Header, limit?: number, log?: PullPageRequest[]) {
  return async (req: PullPageRequest) => {
    log?.push(req)
    const q = pullPageQuery(req) + (limit ? `&limit=${limit}` : '')
    return pullRaw(header, q)
  }
}

function sync(header: Header, canViewCost: boolean, limit?: number, log?: PullPageRequest[]) {
  return syncCatalog({
    db: client,
    storeId: env.storeId,
    canViewCost,
    fetchPage: fetcher(header, limit, log),
  })
}

async function localIds(table: string): Promise<string[]> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM ${table} WHERE store_id = $1 ORDER BY id`,
    [env.storeId],
  )
  return rows.map((r) => r.id)
}

beforeEach(async () => {
  env = await createTestEnv()
  app = buildApp(env)
  client = await newClientDb()
})

afterEach(async () => {
  await client.close()
  await env.close()
})

describe('GL-03: đồng bộ lần đầu phân trang theo con trỏ', () => {
  it('tải đủ mọi dòng qua nhiều trang, không cắt ở giới hạn một trang', async () => {
    for (let i = 0; i < 25; i++) await createProduct(env, { name: `Hàng phân trang ${i}` })
    const log: PullPageRequest[] = []
    const result = await sync(env.owner.authHeader, true, 10, log)

    expect(result.full).toBe(true)
    const serverCount = (
      await env.db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.storeId, env.storeId))
    ).length
    expect((await localIds('catalog_products')).length).toBe(serverCount)
    expect(log.filter((r) => r.entity === 'products').length).toBeGreaterThanOrEqual(3)
    expect((await getCatalogSyncMeta(client, env.storeId))?.syncedAt).toBeTruthy()
  })

  it('cả trang cùng một mốc updated_at vẫn đi tiếp, không lặp lại', async () => {
    const sameTime = new Date('2026-01-01T00:00:00.123Z')
    for (let i = 0; i < 9; i++) {
      await createProduct(env, { name: `Cùng mốc ${i}`, updatedAt: sameTime })
    }
    const log: PullPageRequest[] = []
    await sync(env.owner.authHeader, true, 4, log)
    const names = (
      await client.query<{ name: string }>(
        `SELECT name FROM catalog_products WHERE name LIKE 'Cùng mốc%'`,
      )
    ).rows
    expect(names).toHaveLength(9)
    expect(log.filter((r) => r.entity === 'products').length).toBeLessThanOrEqual(6)
  })

  it('bị ngắt giữa chừng thì lần sau đọc tiếp từ trang đã nạp', async () => {
    for (let i = 0; i < 12; i++) await createProduct(env, { name: `Hàng ngắt ${i}` })
    let calls = 0
    const flaky = async (req: PullPageRequest) => {
      if (req.entity === 'products' && ++calls === 2) throw new Error('mất mạng')
      return fetcher(env.owner.authHeader, 5)(req)
    }
    await expect(
      syncCatalog({ db: client, storeId: env.storeId, canViewCost: true, fetchPage: flaky }),
    ).rejects.toThrow('mất mạng')
    expect((await localIds('catalog_products')).length).toBe(5)

    const log: PullPageRequest[] = []
    const result = await sync(env.owner.authHeader, true, 5, log)
    expect(result.full).toBe(true)
    expect(log.find((r) => r.entity === 'products')?.cursor).not.toBeNull()
    expect((await localIds('catalog_products')).length).toBeGreaterThanOrEqual(12)
  })
})

describe('GL-03: đồng bộ gia tăng và dấu xóa', () => {
  it('lần sau chỉ kéo dòng đổi, cập nhật bản sao', async () => {
    const product = await createProduct(env, { name: 'Sữa cũ', sellingPrice: 10_000 })
    const first = await sync(env.owner.authHeader, true)

    await env.db
      .update(products)
      .set({ name: 'Sữa mới', sellingPrice: 12_000 })
      .where(eq(products.id, product.id))
    const log: PullPageRequest[] = []
    const result = await sync(env.owner.authHeader, true, undefined, log)

    expect(result.full).toBe(false)
    // Trang đầu mỗi loại dữ liệu mang mốc bắt đầu lượt trước để không sót transaction commit muộn
    expect(log.find((r) => r.entity === 'products')).toMatchObject({ since: first.syncedAt })
    const row = (
      await client.query<{ name: string; selling_price: unknown }>(
        'SELECT name, selling_price FROM catalog_products WHERE id = $1',
        [product.id],
      )
    ).rows[0]
    expect(row?.name).toBe('Sữa mới')
    expect(Number(row?.selling_price)).toBe(12_000)
  })

  it('dòng commit muộn (updated_at trước con trỏ, sau lúc bắt đầu lượt trước) vẫn được kéo về', async () => {
    await createProduct(env, { name: 'Hàng A' })
    const first = await sync(env.owner.authHeader, true)
    // Transaction bắt đầu trước lượt đồng bộ đầu, commit sau: updated_at sớm hơn con trỏ
    const [late] = await env.db
      .insert(products)
      .values({
        storeId: env.storeId,
        name: 'Hàng commit muộn',
        sku: 'LATE-01',
        unit: 'cái',
        sellingPrice: 1_000,
        updatedAt: new Date(Date.parse(first.syncedAt) - 60_000),
      })
      .returning()

    await sync(env.owner.authHeader, true)

    expect(await localIds('catalog_products')).toContain(late!.id)
  })

  it('sau một lần nhập lô (cùng updated_at), lượt gia tăng không tải lại cả lô', async () => {
    for (let i = 0; i < 30; i++) await createProduct(env, { name: `Hàng nhập lô ${i}` })
    // Nhập lô chạy trong một transaction: mọi dòng cùng mốc, từ trước lượt đồng bộ đầu
    await env.db
      .update(products)
      .set({ updatedAt: new Date(Date.now() - 60 * 60_000) })
      .where(eq(products.storeId, env.storeId))
    await sync(env.owner.authHeader, true, 10)

    const log: PullPageRequest[] = []
    const again = await sync(env.owner.authHeader, true, 10, log)

    expect(again.full).toBe(false)
    expect(again.loaded).toBe(0)
    expect(log.filter((r) => r.entity === 'products')).toHaveLength(1)
  })

  it('xóa mềm, ngừng bán, xóa cứng đều phản ánh xuống máy bán hàng', async () => {
    const softDeleted = await createProduct(env, { name: 'Hàng sẽ xóa mềm' })
    const deactivated = await createProduct(env, { name: 'Hàng sẽ ngừng bán' })
    const kept = await createProduct(env, { name: 'Hàng giữ lại' })
    const uc = await createUnitConversion(env, kept.id, { unit: 'thùng' })
    const customer = await createCustomer(env, { name: 'Khách có giá riêng' })
    const [cp] = await env.db
      .insert(customerPrices)
      .values({ storeId: env.storeId, customerId: customer.id, productId: kept.id, price: 5_000 })
      .returning()
    const [pl] = await env.db
      .insert(priceLists)
      .values({ storeId: env.storeId, name: 'Bảng giá sẽ xóa', method: 'direct' })
      .returning()
    await env.db
      .insert(priceListItems)
      .values({ priceListId: pl!.id, productId: kept.id, price: 7_000 })
    await sync(env.owner.authHeader, true)
    expect(await localIds('catalog_price_list_items')).toHaveLength(1)

    await env.db
      .update(products)
      .set({ deletedAt: new Date() })
      .where(eq(products.id, softDeleted.id))
    await env.db.update(products).set({ status: 'inactive' }).where(eq(products.id, deactivated.id))
    await env.db.delete(productUnitConversions).where(eq(productUnitConversions.id, uc.id))
    await env.db.delete(customerPrices).where(eq(customerPrices.id, cp!.id))
    await env.db.delete(priceLists).where(eq(priceLists.id, pl!.id))
    await sync(env.owner.authHeader, true)

    const localProducts = await localIds('catalog_products')
    expect(localProducts).not.toContain(softDeleted.id)
    expect(localProducts).toContain(kept.id)
    expect(await localIds('catalog_unit_conversions')).not.toContain(uc.id)
    expect(await localIds('catalog_customer_prices')).not.toContain(cp!.id)
    expect(await localIds('catalog_price_lists')).not.toContain(pl!.id)
    // Dòng con xóa lan theo khóa ngoại không có dấu xóa riêng: máy khách xóa theo bảng giá cha
    expect(await localIds('catalog_price_list_items')).toHaveLength(0)

    const found = await searchCatalogProducts(client, {
      storeId: env.storeId,
      search: 'Hàng',
      includeCost: true,
    })
    expect(found.map((p) => p.id)).toEqual(expect.arrayContaining([kept.id]))
    expect(found.map((p) => p.id)).not.toContain(deactivated.id)
    expect(found.map((p) => p.id)).not.toContain(softDeleted.id)
  })

  it('con trỏ dấu xóa quá hạn lưu giữ thì máy chủ yêu cầu đồng bộ lại từ đầu', async () => {
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
    const page = await pullRaw(
      env.owner.authHeader,
      `entity=tombstones&after=${encodeURIComponent(old)}&afterId=${randomUUID()}`,
    )
    expect(page.meta.resetRequired).toBe(true)
  })

  it('đồng bộ đều đặn mà hơn 30 ngày không có xóa cứng: không bị bắt tải lại từ đầu', async () => {
    const DAY = 24 * 60 * 60 * 1000
    await createProduct(env, { name: 'Hàng bán đều' })
    await sync(env.owner.authHeader, true)
    const ownerAt = () => ({
      Authorization: `Bearer ${signAccessToken({ userId: env.owner.id, storeId: env.storeId, role: 'owner' })}`,
    })
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 20 * DAY })
    try {
      expect((await sync(ownerAt(), true)).full).toBe(false)
      vi.setSystemTime(Date.now() + 20 * DAY)
      // Con trỏ dấu xóa đã tiến theo lượt ngày 20, nên ngày 40 vẫn là lượt gia tăng
      expect((await sync(ownerAt(), true)).full).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('phải tải lại từ đầu: bản sao cũ vẫn dùng được suốt lúc tải, xong mới dọn dòng không còn', async () => {
    const kept = await createProduct(env, { name: 'Hàng còn bán' })
    const customer = await createCustomer(env, { name: 'Khách giá riêng' })
    const [cp] = await env.db
      .insert(customerPrices)
      .values({ storeId: env.storeId, customerId: customer.id, productId: kept.id, price: 5_000 })
      .returning()
    await sync(env.owner.authHeader, true)
    const before = await getCatalogSyncMeta(client, env.storeId)

    // Máy vắng mặt quá hạn: dấu xóa của giá riêng bị xóa cứng đã hết hạn, máy không bao giờ thấy
    await env.db.delete(customerPrices).where(eq(customerPrices.id, cp!.id))
    await env.db.delete(syncTombstones)
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
    await client.query(
      `UPDATE catalog_sync_state SET cursor_t = $2 WHERE store_id = $1 AND entity = 'tombstones'`,
      [env.storeId, old],
    )

    // Lượt tải lại bị ngắt giữa chừng: bản sao cũ còn nguyên, vẫn tìm được hàng
    const base = fetcher(env.owner.authHeader)
    const interrupted = syncCatalog({
      db: client,
      storeId: env.storeId,
      canViewCost: true,
      fetchPage: async (req) => {
        if (req.entity === 'products') throw new Error('mất mạng')
        return base(req)
      },
    })
    await expect(interrupted).rejects.toThrow('mất mạng')
    expect(await getCatalogSyncMeta(client, env.storeId)).toEqual(before)
    const during = await searchCatalogProducts(client, {
      storeId: env.storeId,
      search: 'hang con ban',
      includeCost: true,
    })
    expect(during.map((p) => p.id)).toEqual([kept.id])

    const round = await sync(env.owner.authHeader, true)
    expect(round.full).toBe(true)
    expect(await localIds('catalog_customer_prices')).not.toContain(cp!.id)
    expect(await localIds('catalog_products')).toContain(kept.id)
    const after = await getCatalogSyncMeta(client, env.storeId)
    expect(after?.syncedAt).not.toBe(before?.syncedAt)
    // Lượt sau quay về gia tăng
    expect((await sync(env.owner.authHeader, true)).full).toBe(false)
  })

  it('dòng giá bị xóa rồi tạo lại (id mới) về trước dấu xóa: bản sao không giữ hai giá cho một cặp', async () => {
    const product = await createProduct(env, { name: 'Hàng đổi giá sỉ' })
    const [pl] = await env.db
      .insert(priceLists)
      .values({ storeId: env.storeId, name: 'Giá sỉ', method: 'direct' })
      .returning()
    const [oldItem] = await env.db
      .insert(priceListItems)
      .values({ priceListId: pl!.id, productId: product.id, price: 7_000 })
      .returning()
    await sync(env.owner.authHeader, true)

    await env.db.delete(priceListItems).where(eq(priceListItems.id, oldItem!.id))
    const [newItem] = await env.db
      .insert(priceListItems)
      .values({ priceListId: pl!.id, productId: product.id, price: 6_500 })
      .returning()
    // Dấu xóa của dòng cũ chưa tới máy trong lượt này
    await env.db.delete(syncTombstones)
    await sync(env.owner.authHeader, true)

    expect(await localIds('catalog_price_list_items')).toEqual([newItem!.id])
  })

  it('dấu xóa chỉ trả cho đúng cửa hàng', async () => {
    const storeB = await createStore(env, { name: 'Cửa hàng B' })
    await env.db.insert(syncTombstones).values({
      storeId: storeB.id,
      entity: 'products',
      entityId: randomUUID(),
    })
    const start = new Date(Date.now() - 60_000).toISOString()
    const page = await pullRaw(
      env.owner.authHeader,
      `entity=tombstones&after=${encodeURIComponent(start)}`,
    )
    expect(page.data.rows).toHaveLength(0)
  })
})

describe('Quyết định 3, BC-13: nhân viên không nhận giá vốn', () => {
  it('phản hồi và bản sao của nhân viên không có giá vốn; đổi quyền thì tải lại', async () => {
    const product = await createProduct(env, { name: 'Hàng có giá vốn', costPrice: 70_000 })
    await createVariant(env, product.id, { costPrice: 80_000 })

    for (const entity of ['products', 'variants']) {
      const page = await pullRaw(env.staff.authHeader, `entity=${entity}`)
      for (const row of page.data.rows) expect(row).not.toHaveProperty('costPrice')
    }
    await sync(env.staff.authHeader, false)
    const staffCost = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM catalog_products WHERE cost_price IS NOT NULL`,
    )
    expect(staffCost.rows[0]?.n).toBe(0)
    const staffSearch = await searchCatalogProducts(client, {
      storeId: env.storeId,
      search: 'gia von',
      includeCost: false,
    })
    expect(staffSearch[0]).not.toHaveProperty('costPrice')

    // Cùng máy, chủ đăng nhập: bản sao cũ không có giá vốn nên phải tải lại từ đầu
    const ownerRound = await sync(env.owner.authHeader, true)
    expect(ownerRound.full).toBe(true)
    const ownerRow = await client.query<{ cost_price: unknown }>(
      'SELECT cost_price FROM catalog_products WHERE id = $1',
      [product.id],
    )
    expect(Number(ownerRow.rows[0]?.cost_price)).toBe(70_000)

    // Nhân viên mở máy khi chưa tới được máy chủ: giá vốn bị xóa ngay, bản sao vẫn dùng được
    const syncedAt = (await getCatalogSyncMeta(client, env.storeId))?.syncedAt
    expect(await purgeCatalogCostIfForbidden(client, env.storeId, false)).toBe(true)
    const offlinePurge = await client.query<{ n: number }>(
      `SELECT (SELECT count(*) FROM catalog_products WHERE cost_price IS NOT NULL)
            + (SELECT count(*) FROM catalog_variants WHERE cost_price IS NOT NULL) AS n`,
    )
    expect(Number(offlinePurge.rows[0]?.n)).toBe(0)
    expect(await getCatalogSyncMeta(client, env.storeId)).toEqual({ withCost: false, syncedAt })

    // Chủ đăng nhập lại: tải lại để có giá vốn (bản sao cũ giữ tới khi xong), rồi nhân viên
    // đăng nhập và đồng bộ thì giá vốn lại bị xóa
    expect((await sync(env.owner.authHeader, true)).full).toBe(true)
    await sync(env.staff.authHeader, false)
    const after = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM catalog_products WHERE cost_price IS NOT NULL`,
    )
    expect(after.rows[0]?.n).toBe(0)
  })
})

describe('OFF-09: tìm hàng và khách ngoại tuyến', () => {
  it('tìm không dấu theo tên, theo mã, mã vạch, mã biến thể; kèm đơn vị quy đổi', async () => {
    const milk = await createProduct(env, {
      name: 'Sữa Ensure Gold',
      sku: 'ENS-01',
      barcode: '8934567000011',
    })
    await createUnitConversion(env, milk.id, { unit: 'thùng', conversionFactor: 24 })
    const shirt = await createProduct(env, { name: 'Áo thun', sku: 'AO-01', withVariants: true })
    await createVariant(env, shirt.id, { sku: 'AO-01-DO', barcode: '8930000000099' })
    await sync(env.owner.authHeader, true)

    const q = (search: string) =>
      searchCatalogProducts(client, { storeId: env.storeId, search, includeCost: false })

    const byName = await q('sua ensure')
    expect(byName.map((p) => p.id)).toContain(milk.id)
    expect(byName.find((p) => p.id === milk.id)?.unitConversions[0]).toMatchObject({
      unit: 'thùng',
      conversionFactor: 24,
    })
    expect((await q('ens-01')).map((p) => p.id)).toContain(milk.id)
    expect((await q('8934567000011')).map((p) => p.id)).toContain(milk.id)
    const byVariant = await q('ao-01-do')
    expect(byVariant.map((p) => p.id)).toContain(shirt.id)
    expect((await q('8930000000099')).map((p) => p.id)).toContain(shirt.id)
    expect(byVariant.find((p) => p.id === shirt.id)?.variants).toHaveLength(1)

    // Cùng kết quả với tìm hàng online
    const online = await app.request('/api/v1/pos/products/search?q=sua%20ensure', {
      headers: env.owner.authHeader,
    })
    const onlineBody = (await online.json()) as { data: unknown[] }
    const offlineNoCost = await q('sua ensure')
    expect(offlineNoCost).toEqual(
      (onlineBody.data as Array<Record<string, unknown>>).map((p) => {
        const copy = { ...p }
        delete copy.costPrice
        return copy
      }),
    )
  })

  it('tìm khách theo tên không dấu, mã, số điện thoại', async () => {
    const customer = await createCustomer(env, { name: 'Nguyễn Văn Đức', phone: '0912345678' })
    await sync(env.owner.authHeader, true)
    for (const term of ['nguyen van duc', 'Đức', '0912345', customer.code.toLowerCase()]) {
      const found = await searchCatalogCustomers(client, { storeId: env.storeId, search: term })
      expect(
        found.map((c) => c.id),
        term,
      ).toContain(customer.id)
    }
  })
})

describe('OFF-09: giá ngoại tuyến bằng giá online, cùng khách và số lượng', () => {
  it('đủ 6 tầng giá, biến thể, đơn vị quy đổi', async () => {
    const [cat] = await env.db
      .insert(categories)
      .values({ storeId: env.storeId, name: 'Sữa' })
      .returning()
    const base = await createProduct(env, {
      name: 'Hàng giá lẻ',
      sellingPrice: 100_000,
      categoryId: cat!.id,
    })
    const withVariant = await createProduct(env, {
      name: 'Hàng biến thể',
      sellingPrice: 50_000,
      withVariants: true,
    })
    const variant = await createVariant(env, withVariant.id, { sellingPrice: 65_000 })
    const uc = await createUnitConversion(env, base.id, { conversionFactor: 12, sellingPrice: 0 })
    const ucFixed = await createUnitConversion(env, base.id, {
      conversionFactor: 6,
      sellingPrice: 550_000,
    })
    const other = await createProduct(env, { name: 'Hàng chỉ có bảng giá', sellingPrice: 30_000 })

    await env.db.insert(volumePrices).values([
      { storeId: env.storeId, productId: base.id, minQty: 10, price: 90_000 },
      { storeId: env.storeId, productId: base.id, minQty: 20, price: 85_000 },
    ])
    const [manual] = await env.db
      .insert(priceLists)
      .values({ storeId: env.storeId, name: 'Bảng giá sỉ', method: 'direct' })
      .returning()
    await env.db
      .insert(priceListItems)
      .values({ priceListId: manual!.id, productId: base.id, price: 80_000 })
    const [groupList] = await env.db
      .insert(priceLists)
      .values({ storeId: env.storeId, name: 'Bảng giá VIP', method: 'direct' })
      .returning()
    await env.db.insert(priceListItems).values([
      { priceListId: groupList!.id, productId: other.id, price: 25_000 },
      { priceListId: groupList!.id, productId: base.id, price: 95_000 },
    ])
    const [group] = await env.db
      .insert(customerGroups)
      .values({ storeId: env.storeId, name: 'VIP', defaultPriceListId: groupList!.id })
      .returning()
    const vip = await createCustomer(env, { name: 'Khách VIP', groupId: group!.id })
    const special = await createCustomer(env, { name: 'Khách giá riêng' })
    await env.db
      .insert(customerPrices)
      .values({ storeId: env.storeId, customerId: special.id, productId: base.id, price: 70_000 })
    await env.db.insert(categoryDiscounts).values({
      storeId: env.storeId,
      categoryId: cat!.id,
      customerGroupId: group!.id,
      discountType: 'percent',
      discountValue: 10,
      minQty: 5,
    })
    await sync(env.owner.authHeader, true)

    const lines = [
      { productId: base.id, quantity: 1 },
      { productId: base.id, quantity: 5 },
      { productId: base.id, quantity: 12 },
      { productId: base.id, quantity: 25 },
      { productId: base.id, quantity: 2, unitConversionId: uc.id },
      { productId: base.id, quantity: 1, unitConversionId: ucFixed.id },
      { productId: withVariant.id, variantId: variant.id, quantity: 1 },
      { productId: other.id, quantity: 1 },
      { productId: randomUUID(), quantity: 1 },
    ]
    const scenarios = [
      { customerId: null, priceListId: null },
      { customerId: vip.id, priceListId: null },
      { customerId: special.id, priceListId: null },
      { customerId: null, priceListId: manual!.id },
      { customerId: vip.id, priceListId: manual!.id },
    ]
    for (const scenario of scenarios) {
      const input = { ...scenario, items: lines }
      const res = await app.request('/api/v1/pos/resolve-prices', {
        method: 'POST',
        headers: { ...env.staff.authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      expect(res.status).toBe(200)
      const online = ((await res.json()) as { data: ResolvedPriceItem[] }).data
      const offline = await resolvePricesOffline(client, { storeId: env.storeId, input })
      expect(offline, JSON.stringify(scenario)).toEqual(online)
    }
    // Bảo đảm các kịch bản thật sự chạm đủ các tầng
    const sourcesOf = async (customerId: string | null, priceListId: string | null) =>
      (
        await resolvePricesOffline(client, {
          storeId: env.storeId,
          input: { customerId, priceListId, items: lines },
        })
      ).map((r) => r.source)
    const seen = new Set([
      ...(await sourcesOf(null, null)),
      ...(await sourcesOf(vip.id, null)),
      ...(await sourcesOf(special.id, null)),
    ])
    expect(seen).toEqual(
      new Set([
        'retail_price',
        'volume_price',
        'price_list',
        'category_discount',
        'customer_price',
      ]),
    )
  })

  it('bảng giá ngừng hoạt động: báo đúng lỗi như máy chủ', async () => {
    const [pl] = await env.db
      .insert(priceLists)
      .values({ storeId: env.storeId, name: 'Bảng giá tắt', method: 'direct', isActive: false })
      .returning()
    const p = await createProduct(env)
    await sync(env.owner.authHeader, true)
    await expect(
      resolvePricesOffline(client, {
        storeId: env.storeId,
        input: { customerId: null, priceListId: pl!.id, items: [{ productId: p.id, quantity: 1 }] },
      }),
    ).rejects.toThrow('Bảng giá đang ngừng hoạt động')
  })
})

describe('OFF-15: nợ và hạn mức theo lần đồng bộ gần nhất', () => {
  it('bằng số liệu máy chủ tại lúc đồng bộ, cập nhật ở lượt sau', async () => {
    const [group] = await env.db
      .insert(customerGroups)
      .values({ storeId: env.storeId, name: 'Nhóm nợ', debtLimit: 2_000_000 })
      .returning()
    const customer = await createCustomer(env, {
      name: 'Khách nợ',
      groupId: group!.id,
      currentDebt: 1_500_000,
    })
    await sync(env.owner.authHeader, true)

    const res = await app.request(`/api/v1/pos/customer-debt/${customer.id}`, {
      headers: env.staff.authHeader,
    })
    const online = ((await res.json()) as { data: Record<string, unknown> }).data
    const offline = await getCatalogCustomerDebt(client, {
      storeId: env.storeId,
      customerId: customer.id,
    })
    expect(offline).toEqual(online)
    expect(offline?.effectiveDebtLimit).toBe(2_000_000)

    await env.db
      .update(customers)
      .set({ currentDebt: 1_800_000 })
      .where(eq(customers.id, customer.id))
    await sync(env.owner.authHeader, true)
    const updated = await getCatalogCustomerDebt(client, {
      storeId: env.storeId,
      customerId: customer.id,
    })
    expect(updated?.currentDebt).toBe(1_800_000)
  })
})

describe('OFF-06: đơn gửi online không rõ kết quả rồi lưu ngoại tuyến cùng clientId', () => {
  it('đẩy lại qua /sync/push được nhận là trùng, chỉ có một đơn', async () => {
    const product = await createProduct(env, { name: 'Hàng bán', sellingPrice: 20_000 })
    const clientId = randomUUID()
    const item = {
      productId: product.id,
      variantId: null,
      productName: product.name,
      variantName: null,
      unit: product.unit,
      unitPrice: 20_000,
      quantity: 1,
      discountType: null,
      discountValue: 0,
      discountAmount: 0,
      lineTotal: 20_000,
      note: null,
      unitConversionId: null,
      originalPrice: null,
      priceOverride: false,
      priceOverrideReason: null,
      priceOverridePinUsed: false,
    }
    const orderData = {
      customerId: null,
      subtotal: 20_000,
      discountType: null,
      discountValue: 0,
      discountAmount: 0,
      total: 20_000,
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      cashAmount: 20_000,
      debtLimitOverridden: false,
      note: null,
      items: [item],
      clientId,
    }
    // Lần gửi online: máy chủ đã lưu nhưng phản hồi không về tới máy (hết thời gian chờ)
    const online = await app.request('/api/v1/pos/orders', {
      method: 'POST',
      headers: {
        ...env.staff.authHeader,
        'Content-Type': 'application/json',
        'Idempotency-Key': clientId,
      },
      body: JSON.stringify(orderData),
    })
    expect(online.status).toBe(201)

    const pushed = await app.request('/api/v1/sync/push', {
      method: 'POST',
      headers: { ...env.staff.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orders: [{ clientId, createdAt: new Date().toISOString(), orderData }],
      }),
    })
    const body = (await pushed.json()) as { data: { results: Array<{ status: string }> } }
    expect(body.data.results[0]?.status).toBe('duplicate')
    const rows = await env.db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.storeId, env.storeId), eq(orders.clientId, clientId)))
    expect(rows).toHaveLength(1)
  })
})

describe('Cách ly cửa hàng', () => {
  it('không trả dòng của cửa hàng khác ở bất kỳ loại dữ liệu nào', async () => {
    const storeB = await createStore(env, { name: 'Cửa hàng B' })
    const ownerB = await createUser(env, { storeId: storeB.id, role: 'owner' })
    await createProduct(env, { storeId: storeB.id, name: 'Hàng B' })
    const [plB] = await env.db
      .insert(priceLists)
      .values({ storeId: storeB.id, name: 'Bảng giá B', method: 'direct' })
      .returning()
    const pB = await createProduct(env, { storeId: storeB.id, name: 'Hàng B2' })
    await env.db.insert(priceListItems).values({ priceListId: plB!.id, productId: pB.id, price: 1 })

    await sync(env.owner.authHeader, true)
    const leaked = await client.query<{ name: string }>(
      `SELECT name FROM catalog_products WHERE name LIKE 'Hàng B%'`,
    )
    expect(leaked.rows).toHaveLength(0)
    expect(await localIds('catalog_price_list_items')).toHaveLength(0)
    const pageB = await pullRaw(ownerB.authHeader, 'entity=price_list_items')
    expect(pageB.data.rows).toHaveLength(1)
  })
})

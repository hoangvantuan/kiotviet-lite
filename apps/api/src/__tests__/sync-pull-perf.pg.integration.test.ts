import { PGlite } from '@electric-sql/pglite'
import { eq, inArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { customers, products, type SyncPullResponse } from '@kiotviet-lite/shared'
import { pgliteMigrations } from '@kiotviet-lite/shared/migrations/pglite'
import {
  pullPageQuery,
  type PullPageRequest,
  searchCatalogProducts,
  syncCatalog,
} from '@kiotviet-lite/shared/offline'

import { signAccessToken } from '../lib/jwt.js'
import { createSyncRoutes } from '../routes/sync.routes.js'
import { createPgTestDb, type PgTestDb, testPgUrl } from './helpers/pg-test-db.js'

// GL-03: đồng bộ danh mục cỡ cửa hàng thật (11k sản phẩm như tệp nhập KiotViet của bulk-import-perf)
// qua route /sync/pull trên Postgres thật, nạp vào PGlite của máy bán hàng. Mục tiêu dưới 30 giây.

const PRODUCTS = 11_055
const CUSTOMERS = 2_000
const FULL_SYNC_BUDGET_MS = 30_000

describe.skipIf(!testPgUrl)('Hiệu năng đồng bộ danh mục 11k sản phẩm', () => {
  let pg: PgTestDb
  let app: Hono
  let header: { Authorization: string }

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-min-32-chars-please-change'
    process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-min-32-chars-please-change'
    pg = await createPgTestDb('kvl_sync_perf')
    app = new Hono()
    app.route('/api/v1/sync', createSyncRoutes({ db: pg.db }))
    header = {
      Authorization: `Bearer ${signAccessToken({ userId: pg.ownerId, storeId: pg.storeId, role: 'owner' })}`,
    }
    for (let start = 0; start < PRODUCTS; start += 1_000) {
      const count = Math.min(1_000, PRODUCTS - start)
      await pg.db.insert(products).values(
        Array.from({ length: count }, (_, k) => {
          const i = start + k
          return {
            storeId: pg.storeId,
            name: `Nồi nhôm số ${i}`,
            sku: `SP${String(i).padStart(6, '0')}`,
            barcode: `893${String(i).padStart(10, '0')}`,
            unit: 'Cái',
            sellingPrice: 10_000 + i,
            costPrice: 8_000,
            currentStock: 5,
            trackInventory: true,
          }
        }),
      )
    }
    for (let start = 0; start < CUSTOMERS; start += 1_000) {
      await pg.db.insert(customers).values(
        Array.from({ length: Math.min(1_000, CUSTOMERS - start) }, (_, k) => {
          const i = start + k
          return {
            storeId: pg.storeId,
            code: `KH${String(i).padStart(6, '0')}`,
            name: `Khách hàng số ${i}`,
            phone: `09${String(i).padStart(8, '0')}`,
          }
        }),
      )
    }
    // Dữ liệu có từ trước (như cửa hàng đã chạy): lượt gia tăng đọc lùi 5 phút không vướng vào
    await pg.db.execute(sql`UPDATE products SET updated_at = now() - interval '1 hour'`)
    await pg.db.execute(sql`UPDATE customers SET updated_at = now() - interval '1 hour'`)
  }, 300_000)

  afterAll(async () => {
    await pg?.close()
  })

  function fetchPage(log: PullPageRequest[]) {
    return async (req: PullPageRequest) => {
      log.push(req)
      const res = await app.request(`/api/v1/sync/pull?${pullPageQuery(req)}`, { headers: header })
      expect(res.status).toBe(200)
      return (await res.json()) as SyncPullResponse
    }
  }

  it('lần đầu tải đủ theo trang dưới 30 giây, lần sau chỉ kéo phần thay đổi', async () => {
    const client = new PGlite()
    try {
      for (const m of pgliteMigrations) await client.exec(m.sql)

      const fullLog: PullPageRequest[] = []
      const t0 = performance.now()
      const full = await syncCatalog({
        db: client,
        storeId: pg.storeId,
        canViewCost: true,
        fetchPage: fetchPage(fullLog),
      })
      const fullMs = performance.now() - t0

      const local = await client.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM catalog_products WHERE store_id = $1',
        [pg.storeId],
      )
      expect(full.full).toBe(true)
      expect(local.rows[0]!.n).toBe(PRODUCTS)
      expect(fullLog.filter((r) => r.entity === 'products').length).toBeGreaterThan(10)

      // Đổi giá 100 sản phẩm, xóa mềm 10 sản phẩm: lượt sau chỉ mang chừng đó dòng
      const changed = await pg.db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.storeId, pg.storeId))
        .orderBy(products.sku)
        .limit(110)
      await pg.db
        .update(products)
        .set({ sellingPrice: sql`${products.sellingPrice} + 1`, updatedAt: new Date() })
        .where(
          inArray(
            products.id,
            changed.slice(0, 100).map((r) => r.id),
          ),
        )
      await pg.db
        .update(products)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          inArray(
            products.id,
            changed.slice(100).map((r) => r.id),
          ),
        )

      const incLog: PullPageRequest[] = []
      const t1 = performance.now()
      const inc = await syncCatalog({
        db: client,
        storeId: pg.storeId,
        canViewCost: true,
        fetchPage: fetchPage(incLog),
      })
      const incMs = performance.now() - t1

      expect(inc.full).toBe(false)
      // Chỉ 110 dòng sản phẩm đổi (100 giá, 10 xóa mềm), mỗi loại một trang
      expect(inc.loaded).toBe(110)
      expect(incLog.length).toBeLessThanOrEqual(fullLog.length)
      expect(incLog.filter((r) => r.entity === 'products')).toHaveLength(1)
      const after = await client.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM catalog_products WHERE store_id = $1',
        [pg.storeId],
      )
      expect(after.rows[0]!.n).toBe(PRODUCTS - 10)

      const t2 = performance.now()
      const found = await searchCatalogProducts(client, {
        storeId: pg.storeId,
        search: 'noi nhom so 10999',
        includeCost: true,
      })
      const searchMs = performance.now() - t2
      expect(found.map((p) => p.sku)).toEqual(['SP010999'])

      console.info(
        `[perf] đồng bộ danh mục: lần đầu ${PRODUCTS} sản phẩm + ${CUSTOMERS} khách ${(fullMs / 1000).toFixed(2)} s (${fullLog.length} trang), gia tăng ${(incMs / 1000).toFixed(2)} s (${incLog.length} trang, ${inc.loaded} dòng), tìm không dấu ${searchMs.toFixed(0)} ms`,
      )
      expect(fullMs).toBeLessThan(FULL_SYNC_BUDGET_MS)
    } finally {
      await client.close()
    }
  }, 300_000)
})

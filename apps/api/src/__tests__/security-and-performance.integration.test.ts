import { Hono } from 'hono'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { customers, priceLists, products, stores } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { errorHandler } from '../middleware/error-handler.js'
import { createAuthRoutes } from '../routes/auth.routes.js'
import { createCustomersRoutes } from '../routes/customers.routes.js'
import { createReportsRoutes } from '../routes/reports.routes.js'
import { createCustomerGroup, updateCustomerGroup } from '../services/customer-groups.service.js'
import { restorePriceList } from '../services/price-lists.service.js'
import { loadProductForUpdate } from '../services/products-lock.helper.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.BCRYPT_ROUNDS = '4'
})

describe('Bảo mật & Hiệu năng (T8 Integration Tests)', () => {
  let env: TestEnv
  let app: Hono

  beforeEach(async () => {
    env = await createTestEnv()
    app = new Hono()
    app.onError(errorHandler)
    app.route('/api/v1/customers', createCustomersRoutes({ db: env.db }))
    app.route('/api/v1/reports', createReportsRoutes({ db: env.db }))
    app.route('/api/v1/auth', createAuthRoutes({ db: env.db }))
  })

  afterEach(async () => {
    await env.close()
  })

  describe('Phân quyền RBAC cho Customers API (staff vs manager/owner)', () => {
    it('staff có thể xem danh sách và tạo nhanh khách hàng qua customers.view', async () => {
      // 1. Staff gọi GET /api/v1/customers
      const listRes = await app.request('/api/v1/customers', {
        method: 'GET',
        headers: {
          ...env.staff.authHeader,
        },
      })
      expect(listRes.status).toBe(200)

      // 2. Staff gọi POST /api/v1/customers/quick-create
      const quickRes = await app.request('/api/v1/customers/quick-create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...env.staff.authHeader,
        },
        body: JSON.stringify({
          name: 'Khách hàng nhanh',
          phone: '0988776655',
        }),
      })
      expect(quickRes.status).toBe(201)
      const body = (await quickRes.json()) as { data: { id: string; name: string } }
      expect(body.data.name).toBe('Khách hàng nhanh')

      // 3. Staff gọi GET /api/v1/customers/:id
      const detailRes = await app.request(`/api/v1/customers/${body.data.id}`, {
        method: 'GET',
        headers: {
          ...env.staff.authHeader,
        },
      })
      expect(detailRes.status).toBe(200)
    })

    it('staff bị 403 FORBIDDEN khi cố tạo đầy đủ hoặc cập nhật/xóa khách hàng (cần customers.manage)', async () => {
      // 1. Staff gọi POST /api/v1/customers -> 403
      const createRes = await app.request('/api/v1/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...env.staff.authHeader,
        },
        body: JSON.stringify({
          name: 'Khách hàng staff tạo',
          phone: '0911223344',
        }),
      })
      expect(createRes.status).toBe(403)

      // 2. Tạo trước khách hàng bởi owner
      const [customer] = await env.db
        .insert(customers)
        .values({
          storeId: env.storeId,
          name: 'Khách hàng gốc',
          phone: '0911223355',
        })
        .returning()

      // 3. Staff gọi PATCH /api/v1/customers/:id -> 403
      const patchRes = await app.request(`/api/v1/customers/${customer!.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...env.staff.authHeader,
        },
        body: JSON.stringify({
          name: 'Khách hàng sửa bởi staff',
        }),
      })
      expect(patchRes.status).toBe(403)

      // 4. Staff gọi DELETE /api/v1/customers/:id -> 403
      const deleteRes = await app.request(`/api/v1/customers/${customer!.id}`, {
        method: 'DELETE',
        headers: {
          ...env.staff.authHeader,
        },
      })
      expect(deleteRes.status).toBe(403)
    })
  })

  describe('Phân trang Báo cáo Tồn kho (inventory-report)', () => {
    it('trả về dữ liệu phân trang chuẩn kèm summary toàn kho và pagination', async () => {
      // Tạo 25 sản phẩm
      let expectedTotalStockValue = 0
      for (let i = 1; i <= 25; i++) {
        const cost = 50_000 * i
        const stock = 10 * i
        expectedTotalStockValue += cost * stock
        await env.db.insert(products).values({
          storeId: env.storeId,
          name: `Sản phẩm tồn ${i}`,
          sku: `SKU-TON-${i}`,
          costPrice: cost,
          currentStock: stock,
          trackInventory: true,
        })
      }

      // Gọi tab=current với page=1, pageSize=10
      const res = await app.request('/api/v1/reports/inventory?tab=current&page=1&pageSize=10', {
        method: 'GET',
        headers: {
          ...env.owner.authHeader,
        },
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        data: {
          rows: Array<{
            productId: string
            productName: string
            currentStock: number
            stockValue: number
          }>
          summary: { totalProducts: number; totalStockValue: number }
          pagination: { page: number; pageSize: number; total: number; totalPages: number }
        }
      }

      expect(body.data.rows.length).toBe(10)
      expect(body.data.pagination.page).toBe(1)
      expect(body.data.pagination.pageSize).toBe(10)
      expect(body.data.pagination.total).toBe(25)
      expect(body.data.pagination.totalPages).toBe(3)
      expect(body.data.summary.totalProducts).toBe(25)
      expect(body.data.summary.totalStockValue).toBe(expectedTotalStockValue)
    })

    it('xuất CSV báo cáo tồn kho xuất TOÀN BỘ 25 dòng sản phẩm (không bị giới hạn 20 dòng)', async () => {
      // Tạo 25 sản phẩm
      for (let i = 1; i <= 25; i++) {
        await env.db.insert(products).values({
          storeId: env.storeId,
          name: `Sản phẩm xuất CSV ${i}`,
          sku: `SKU-CSV-${i}`,
          costPrice: 100_000,
          currentStock: i,
          trackInventory: true,
        })
      }

      const res = await app.request('/api/v1/reports/inventory/export?tab=current&format=csv', {
        method: 'GET',
        headers: {
          ...env.owner.authHeader,
        },
      })

      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toContain('text/csv')
      const csvText = await res.text()
      // BOM + Header + 25 dòng sản phẩm = 26 dòng không trống
      const lines = csvText
        .trim()
        .split('\n')
        .filter((l) => l.trim().length > 0)
      // Dòng 0 là header, từ dòng 1 đến 25 là data
      expect(lines.length).toBe(26)
    })
  })

  describe('IDOR & Bảo vệ đa người thuê (Multi-tenant Protection)', () => {
    it('loadProductForUpdate từ chối sản phẩm của store khác trong SQL WHERE', async () => {
      // 1. Tạo Store B và sản phẩm thuộc Store B
      const [storeB] = await env.db.insert(stores).values({ name: 'Cửa hàng B' }).returning()
      const [productB] = await env.db
        .insert(products)
        .values({
          storeId: storeB!.id,
          name: 'Sản phẩm của B',
          sku: 'SKU-B-001',
          currentStock: 100,
        })
        .returning()

      // 2. Store A cố gọi loadProductForUpdate với productId của Store B
      await expect(
        env.db.transaction(async (tx) => {
          await loadProductForUpdate({
            tx: tx as unknown as Db,
            storeId: env.storeId,
            productId: productB!.id,
          })
        }),
      ).rejects.toThrow('Không tìm thấy sản phẩm')
    })

    it('customer-groups: không cho phép gán defaultPriceListId của store khác (IDOR)', async () => {
      // 1. Tạo Store B và bảng giá thuộc Store B
      const [storeB] = await env.db.insert(stores).values({ name: 'Cửa hàng B' }).returning()
      const [priceListB] = await env.db
        .insert(priceLists)
        .values({
          storeId: storeB!.id,
          name: 'Bảng giá VIP Store B',
          method: 'direct',
          effectiveFrom: '2026-08-28',
        })
        .returning()

      // 2. Store A cố tạo customer group với defaultPriceListId của Store B -> 404 NOT_FOUND
      const actor = { userId: env.owner.id, storeId: env.storeId, role: 'owner' as const }
      await expect(
        createCustomerGroup({
          db: env.db,
          actor,
          input: {
            name: 'Nhóm VIP Store A',
            defaultPriceListId: priceListB!.id,
          },
        }),
      ).rejects.toThrow('Không tìm thấy bảng giá mặc định')

      // 3. Tạo customer group hợp lệ ở Store A
      const groupA = await createCustomerGroup({
        db: env.db,
        actor,
        input: {
          name: 'Nhóm thường Store A',
        },
      })

      // 4. Store A cố cập nhật customer group với defaultPriceListId của Store B -> 404 NOT_FOUND
      await expect(
        updateCustomerGroup({
          db: env.db,
          actor,
          targetId: groupA.id,
          input: {
            defaultPriceListId: priceListB!.id,
          },
        }),
      ).rejects.toThrow('Không tìm thấy bảng giá mặc định')
    })

    it('price-lists: không cho phép khôi phục bảng giá với basePriceListId của store khác (IDOR)', async () => {
      // 1. Tạo Store B và bảng giá thuộc Store B
      const [storeB] = await env.db.insert(stores).values({ name: 'Cửa hàng B' }).returning()
      const [priceListB] = await env.db
        .insert(priceLists)
        .values({
          storeId: storeB!.id,
          name: 'Bảng giá gốc Store B',
          method: 'direct',
          effectiveFrom: '2026-08-28',
        })
        .returning()

      // 2. Tạo bảng giá formula ở Store A nhưng basePriceListId trỏ tới priceListB và đang bị xóa (deletedAt)
      const [derivedListA] = await env.db
        .insert(priceLists)
        .values({
          storeId: env.storeId,
          name: 'Bảng giá dẫn xuất Store A',
          method: 'formula',
          basePriceListId: priceListB!.id,
          formulaType: 'markup_percent',
          formulaValue: 10,
          effectiveFrom: '2026-08-28',
          deletedAt: new Date(),
        })
        .returning()

      // 3. Store A cố restore bảng giá dẫn xuất này -> Bị chặn vì basePriceListId không thuộc Store A
      await expect(
        restorePriceList({
          db: env.db,
          actor: { userId: env.owner.id, storeId: env.storeId, role: 'owner' },
          targetId: derivedListA!.id,
        }),
      ).rejects.toThrow('Bảng giá nền đã bị xoá')
    })
  })
})

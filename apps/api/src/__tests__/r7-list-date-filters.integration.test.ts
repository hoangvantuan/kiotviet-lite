/**
 * R7 (review #55): bộ lọc ngày của các màn danh sách cắt theo lịch cửa hàng.
 *
 * Tiến trình test chạy TZ=UTC (vitest.workspace.ts) như máy chủ production. Chứng từ lúc 02:00
 * giờ VN ngày 20/09 là 19:00 UTC ngày 19/09: lọc "ngày 20/09" phải thấy nó, lọc "ngày 19/09" thì
 * không. Trước đây máy chủ parse YYYY-MM-DD thành 00:00 UTC (hoặc từ chối vì đòi ISO đầy đủ).
 */

import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  customers,
  orders,
  purchaseOrders,
  receipts,
  stockChecks,
  supplierPayments,
  suppliers,
} from '@kiotviet-lite/shared'

import { errorHandler } from '../middleware/error-handler.js'
import { createCustomersRoutes } from '../routes/customers.routes.js'
import { createOrdersRoutes } from '../routes/orders.routes.js'
import { createPurchaseOrdersRoutes } from '../routes/purchase-orders.routes.js'
import { createReceiptsRoutes } from '../routes/receipts.routes.js'
import { createStockChecksRoutes } from '../routes/stock-checks.routes.js'
import { createSupplierPaymentsRoutes } from '../routes/supplier-payments.routes.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

/** 23:00 ngày 19/09, 02:00 và 23:30 ngày 20/09, giờ VN */
const MOMENTS = [
  '2026-09-19T23:00:00+07:00',
  '2026-09-20T02:00:00+07:00',
  '2026-09-20T23:30:00+07:00',
].map((s) => new Date(s))

let base: TestEnv
let app: Hono
let customerId: string
let supplierId: string

beforeEach(async () => {
  base = await createTestEnv()
  app = new Hono()
  app.onError(errorHandler)
  app.route('/api/v1/customers', createCustomersRoutes({ db: base.db }))
  app.route('/api/v1/orders', createOrdersRoutes({ db: base.db }))
  app.route('/api/v1/receipts', createReceiptsRoutes({ db: base.db }))
  app.route('/api/v1/supplier-payments', createSupplierPaymentsRoutes({ db: base.db }))
  app.route('/api/v1/purchase-orders', createPurchaseOrdersRoutes({ db: base.db }))
  app.route('/api/v1/stock-checks', createStockChecksRoutes({ db: base.db }))

  const [c] = await base.db
    .insert(customers)
    .values({ storeId: base.storeId, name: 'Chị Lan', code: 'KH-R7', phone: '0911000009' })
    .returning()
  customerId = c!.id
  const [s] = await base.db
    .insert(suppliers)
    .values({ storeId: base.storeId, name: 'NCC R7', code: 'NCC-R7' })
    .returning()
  supplierId = s!.id
})

afterEach(async () => {
  await base.close()
})

async function countRows(path: string): Promise<number> {
  const res = await app.request(path, { headers: base.owner.authHeader })
  expect(res.status).toBe(200)
  const body = (await res.json()) as { data: unknown }
  const data = body.data as unknown[] | { items: unknown[] }
  return Array.isArray(data) ? data.length : data.items.length
}

async function expectDayFilter(path: string, fromKey: string, toKey: string) {
  const sep = path.includes('?') ? '&' : '?'
  expect(await countRows(`${path}${sep}${fromKey}=2026-09-20&${toKey}=2026-09-20`)).toBe(2)
  expect(await countRows(`${path}${sep}${fromKey}=2026-09-19&${toKey}=2026-09-19`)).toBe(1)
}

describe('R7: lọc danh sách theo ngày YYYY-MM-DD theo giờ cửa hàng khi máy chủ chạy UTC', () => {
  it('phiếu thu', async () => {
    await base.db.insert(receipts).values(
      MOMENTS.map((createdAt, i) => ({
        code: `PT-R7-A${i}`,
        storeId: base.storeId,
        customerId,
        amount: 10_000,
        createdBy: base.owner.id,
        createdAt,
      })),
    )
    await expectDayFilter('/api/v1/receipts', 'fromDate', 'toDate')
  })

  it('phiếu chi nhà cung cấp', async () => {
    await base.db.insert(supplierPayments).values(
      MOMENTS.map((createdAt) => ({
        storeId: base.storeId,
        supplierId,
        amount: 10_000,
        createdBy: base.owner.id,
        createdAt,
      })),
    )
    await expectDayFilter('/api/v1/supplier-payments', 'fromDate', 'toDate')
  })

  it('phiếu nhập (lọc theo ngày nhập)', async () => {
    await base.db.insert(purchaseOrders).values(
      MOMENTS.map((purchaseDate, i) => ({
        storeId: base.storeId,
        supplierId,
        code: `PN-R7-${i}`,
        subtotal: 10_000,
        totalAmount: 10_000,
        paymentStatus: 'paid',
        purchaseDate,
        createdBy: base.owner.id,
      })),
    )
    await expectDayFilter('/api/v1/purchase-orders', 'fromDate', 'toDate')
  })

  it('phiếu kiểm kho', async () => {
    await base.db.insert(stockChecks).values(
      MOMENTS.map((createdAt, i) => ({
        storeId: base.storeId,
        code: `KK-R7-${i}`,
        createdBy: base.owner.id,
        createdAt,
      })),
    )
    await expectDayFilter('/api/v1/stock-checks', 'fromDate', 'toDate')
  })

  async function insertOrders() {
    await base.db.insert(orders).values(
      MOMENTS.map((createdAt, i) => ({
        storeId: base.storeId,
        orderNumber: `R7-KH-${i}`,
        customerId,
        subtotal: 10_000,
        discountAmount: 0,
        total: 10_000,
        paymentMethod: 'cash' as const,
        paymentStatus: 'paid' as const,
        status: 'completed' as const,
        userId: base.owner.id,
        createdAt,
      })),
    )
  }

  it('danh sách đơn hàng (preset "Hôm nay" gửi fromDate = toDate = YYYY-MM-DD)', async () => {
    await insertOrders()
    await expectDayFilter('/api/v1/orders', 'fromDate', 'toDate')
  })

  it('đơn của khách (tab Đơn hàng ở chi tiết khách)', async () => {
    await insertOrders()
    await expectDayFilter(`/api/v1/customers/${customerId}/orders`, 'dateFrom', 'dateTo')
  })

  it('vẫn nhận thời điểm ISO đầy đủ và giữ nguyên', async () => {
    await base.db.insert(receipts).values(
      MOMENTS.map((createdAt, i) => ({
        code: `PT-R7-B${i}`,
        storeId: base.storeId,
        customerId,
        amount: 10_000,
        createdBy: base.owner.id,
        createdAt,
      })),
    )
    const from = encodeURIComponent('2026-09-19T18:00:00.000Z')
    const to = encodeURIComponent('2026-09-19T20:00:00.000Z')
    expect(await countRows(`/api/v1/receipts?fromDate=${from}&toDate=${to}`)).toBe(1)
  })
})

import { Hono } from 'hono'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import {
  brands,
  categories,
  orderItems,
  orderReturnItems,
  orderReturns,
  orders,
  products,
  stores,
  users,
} from '@kiotviet-lite/shared'

import { signAccessToken } from '../lib/jwt.js'
import { errorHandler } from '../middleware/error-handler.js'
import { createReportsRoutes } from '../routes/reports.routes.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.ACCESS_TOKEN_TTL_SECONDS = '900'
  process.env.REFRESH_TOKEN_TTL_SECONDS = '604800'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

type DimensionResponse = {
  rows: { dimensionId: string | null; name: string; revenue: number; percentage: number }[]
  summary: { totalRevenue: number }
}

let env: TestEnv
let app: Hono
let brandId: string
let categoryId: string
let otherStoreToken: string

beforeEach(async () => {
  env = await createTestEnv()
  app = new Hono()
  app.onError(errorHandler)
  app.route('/api/v1/reports', createReportsRoutes({ db: env.db }))

  const [brand] = await env.db
    .insert(brands)
    .values({ storeId: env.storeId, name: 'Sao' })
    .returning()
  const [category] = await env.db
    .insert(categories)
    .values({ storeId: env.storeId, name: 'Đồ uống' })
    .returning()
  brandId = brand!.id
  categoryId = category!.id
  const productsA = await env.db
    .insert(products)
    .values([
      { storeId: env.storeId, name: 'Có đủ', sku: 'D-1', brandId, categoryId, sellingPrice: 100 },
      { storeId: env.storeId, name: 'Chưa phân loại', sku: 'D-2', sellingPrice: 100 },
      { storeId: env.storeId, name: 'Chỉ có thương hiệu', sku: 'D-3', brandId, sellingPrice: 50 },
    ])
    .returning()
  const [sale] = await env.db
    .insert(orders)
    .values({
      storeId: env.storeId,
      orderNumber: 'D-1',
      userId: env.owner.id,
      subtotal: 300,
      discountAmount: 30,
      total: 270,
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      status: 'partial_return',
      createdAt: new Date('2026-09-22T18:00:00Z'), // Sep 23 in store local time
    })
    .returning()
  const items = await env.db
    .insert(orderItems)
    .values([
      {
        orderId: sale!.id,
        productId: productsA[0]!.id,
        productName: 'Có đủ',
        unitPrice: 100,
        quantity: 1,
        lineTotal: 100,
      },
      {
        orderId: sale!.id,
        productId: productsA[1]!.id,
        productName: 'Chưa phân loại',
        unitPrice: 100,
        quantity: 2,
        lineTotal: 200,
      },
    ])
    .returning()
  const [returned] = await env.db
    .insert(orderReturns)
    .values({
      storeId: env.storeId,
      orderId: sale!.id,
      returnNumber: 'R-D-1',
      totalAmount: 90,
      refundAmount: 90,
      debtReductionAmount: 0,
      createdBy: env.owner.id,
    })
    .returning()
  await env.db.insert(orderReturnItems).values({
    returnId: returned!.id,
    orderItemId: items[1]!.id,
    productId: productsA[1]!.id,
    quantity: 1,
    lineTotal: 90,
    productName: 'Chưa phân loại',
    unitPrice: 100,
    reason: 'other',
  })
  const [sale2] = await env.db
    .insert(orders)
    .values({
      storeId: env.storeId,
      orderNumber: 'D-2',
      userId: env.owner.id,
      subtotal: 50,
      discountAmount: 0,
      total: 50,
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      status: 'completed',
      createdAt: new Date('2026-09-23T16:59:59Z'), // Sep 23 23:59:59 local
    })
    .returning()
  await env.db.insert(orderItems).values({
    orderId: sale2!.id,
    productId: productsA[2]!.id,
    productName: 'Chỉ có thương hiệu',
    unitPrice: 50,
    quantity: 1,
    lineTotal: 50,
  })
  const [outside] = await env.db
    .insert(orders)
    .values({
      storeId: env.storeId,
      orderNumber: 'D-OUTSIDE',
      userId: env.owner.id,
      subtotal: 999,
      discountAmount: 0,
      total: 999,
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      status: 'completed',
      createdAt: new Date('2026-09-23T17:00:00Z'), // Sep 24 local
    })
    .returning()
  await env.db.insert(orderItems).values({
    orderId: outside!.id,
    productId: productsA[0]!.id,
    productName: 'Có đủ',
    unitPrice: 999,
    quantity: 1,
    lineTotal: 999,
  })
  const [storeB] = await env.db.insert(stores).values({ name: 'Store B' }).returning()
  const [userB] = await env.db
    .insert(users)
    .values({
      storeId: storeB!.id,
      name: 'Manager B',
      role: 'manager',
      passwordHash: 'not-used',
    })
    .returning()
  otherStoreToken = signAccessToken({ userId: userB!.id, storeId: storeB!.id, role: 'manager' })
  const [productB] = await env.db
    .insert(products)
    .values({
      storeId: storeB!.id,
      name: 'Store B product',
      sku: 'B-1',
      sellingPrice: 500,
    })
    .returning()
  const [orderB] = await env.db
    .insert(orders)
    .values({
      storeId: storeB!.id,
      orderNumber: 'B-1',
      userId: userB!.id,
      subtotal: 500,
      discountAmount: 0,
      total: 500,
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      status: 'completed',
      createdAt: new Date('2026-09-23T00:00:00Z'),
    })
    .returning()
  await env.db.insert(orderItems).values({
    orderId: orderB!.id,
    productId: productB!.id,
    productName: 'Store B product',
    unitPrice: 500,
    quantity: 1,
    lineTotal: 500,
  })
})

afterEach(async () => {
  await env.close()
})

const path = (tab: string) => `/api/v1/reports/revenue?tab=${tab}&from=2026-09-23&to=2026-09-23`
const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

async function report(tab: string, token: string) {
  const response = await app.request(path(tab), { headers: auth(token) })
  expect(response.status).toBe(200)
  return ((await response.json()) as { data: DimensionResponse }).data
}

describe('revenue by brand and category', () => {
  it('reconciles both dimensions to paid order totals after discount and partial refund, retaining unclassified and local dates', async () => {
    const time = await report('time', env.manager.accessToken)
    expect(time.summary.totalRevenue).toBe(230)
    const brand = await report('thuong-hieu', env.manager.accessToken)
    const category = await report('danh-muc', env.manager.accessToken)
    expect(brand.summary.totalRevenue).toBe(time.summary.totalRevenue)
    expect(category.summary.totalRevenue).toBe(time.summary.totalRevenue)
    expect(brand.rows).toEqual([
      { dimensionId: brandId, name: 'Sao', revenue: 140, percentage: 60.87 },
      { dimensionId: null, name: 'Chưa phân loại', revenue: 90, percentage: 39.13 },
    ])
    expect(category.rows).toEqual([
      { dimensionId: null, name: 'Chưa phân loại', revenue: 140, percentage: 60.87 },
      { dimensionId: categoryId, name: 'Đồ uống', revenue: 90, percentage: 39.13 },
    ])
  })

  it('exports every group to a spreadsheet and rejects staff, while isolating each store', async () => {
    for (const tab of ['thuong-hieu', 'danh-muc']) {
      const deniedView = await app.request(path(tab), { headers: env.staff.authHeader })
      const deniedExport = await app.request(
        `${path(tab).replace('revenue?', 'revenue/export?')}&format=xlsx`,
        { headers: env.staff.authHeader },
      )
      expect(deniedView.status).toBe(403)
      expect(deniedExport.status).toBe(403)
      const exportResponse = await app.request(
        `${path(tab).replace('revenue?', 'revenue/export?')}&format=xlsx`,
        { headers: env.manager.authHeader },
      )
      expect(exportResponse.status).toBe(200)
      expect(exportResponse.headers.get('Content-Type')).toContain('spreadsheetml.sheet')
      const workbook = XLSX.read(await exportResponse.arrayBuffer(), { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]!]!
      const exported = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1 })
      expect(exported).toHaveLength(3)
      expect(
        exported
          .slice(1)
          .map((row) => Number(row[1]))
          .sort((a, b) => a - b),
      ).toEqual([90, 140])
      const foreign = await report(tab, otherStoreToken)
      expect(foreign.summary.totalRevenue).toBe(500)
      expect(foreign.rows).toEqual([
        { dimensionId: null, name: 'Chưa phân loại', revenue: 500, percentage: 100 },
      ])
    }
  })
})

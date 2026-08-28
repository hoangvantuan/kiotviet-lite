// @ts-nocheck
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  auditLogs,
  orderItems,
  orders,
  products,
  productUnitConversions,
} from '@kiotviet-lite/shared'

import { createPosRoutes } from '../routes/pos.routes.js'
import { createStoreRoutes } from '../routes/store.routes.js'
import { createSyncRoutes } from '../routes/sync.routes.js'
import { createProduct } from './helpers/factories.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.ACCESS_TOKEN_TTL_SECONDS = '900'
  process.env.REFRESH_TOKEN_TTL_SECONDS = '604800'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

interface Env {
  base: TestEnv
  posApp: ReturnType<typeof createPosRoutes>
  storeApp: ReturnType<typeof createStoreRoutes>
  syncApp: ReturnType<typeof createSyncRoutes>
}

async function setup(): Promise<Env> {
  const base = await createTestEnv()
  const posApp = createPosRoutes({ db: base.db })
  const storeApp = createStoreRoutes({ db: base.db })
  const syncApp = createSyncRoutes({ db: base.db })
  return { base, posApp, storeApp, syncApp }
}

async function makeRequest<T = unknown>(
  app:
    | Parameters<typeof createPosRoutes>[0]
    | ReturnType<typeof createPosRoutes>
    | ReturnType<typeof createSyncRoutes>,
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

describe('T10 - order-price-guard.integration.test', () => {
  let env: Env

  beforeAll(async () => {
    env = await setup()
  })

  it('1. POS gửi unitPrice thấp hơn giá hệ thống, priceOverride=false -> 400 VALIDATION_ERROR', async () => {
    const p1 = await createProduct(
      { db: env.base.db, storeId: env.base.storeId },
      { sellingPrice: 100000 },
    )
    const oldProduct = await env.base.db.query.products.findFirst({ where: eq(products.id, p1.id) })

    const res = await makeRequest(
      env.posApp,
      'POST',
      '/orders',
      {
        subtotal: 50000,
        discountValue: 0,
        discountAmount: 0,
        total: 50000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 50000,
        transferAmount: 0,
        debtLimitOverridden: false,
        items: [
          {
            productId: p1.id,
            productName: p1.name,
            unitPrice: 50000,
            quantity: 1,
            lineTotal: 50000,
            originalPrice: 100000,
            priceOverride: false,
          },
        ],
      },
      env.base.owner.authHeader,
    )

    expect(res.status).toBe(400)
    expect(res.body?.error?.code || res.body?.code).toBe('VALIDATION_ERROR')

    const newProduct = await env.base.db.query.products.findFirst({ where: eq(products.id, p1.id) })
    expect(newProduct?.currentStock).toBe(oldProduct?.currentStock)
  })

  it('2. POS gửi priceOverride=true mà không kèm priceOverridePin -> bị từ chối', async () => {
    const p1 = await createProduct(
      { db: env.base.db, storeId: env.base.storeId },
      { sellingPrice: 100000 },
    )

    const res = await makeRequest(
      env.posApp,
      'POST',
      '/orders',
      {
        subtotal: 50000,
        discountValue: 0,
        discountAmount: 0,
        total: 50000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 50000,
        transferAmount: 0,
        debtLimitOverridden: false,
        items: [
          {
            productId: p1.id,
            productName: p1.name,
            unitPrice: 50000,
            quantity: 1,
            lineTotal: 50000,
            originalPrice: 100000,
            priceOverride: true,
            priceOverrideReason: 'test',
          },
        ],
      },
      env.base.owner.authHeader,
    )

    expect(res.status).toBe(400)
    expect(res.body?.error?.code || res.body?.code).toBe('VALIDATION_ERROR')
    expect(res.body?.error?.message || res.body?.message).toContain('Sửa giá yêu cầu mã PIN')
  })

  it('3. POS gửi priceOverride=true kèm PIN đúng -> tạo đơn', async () => {
    const p1 = await createProduct(
      { db: env.base.db, storeId: env.base.storeId },
      { sellingPrice: 100000 },
    )

    const res = await makeRequest(
      env.posApp,
      'POST',
      '/orders',
      {
        subtotal: 50000,
        discountValue: 0,
        discountAmount: 0,
        total: 50000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 50000,
        transferAmount: 0,
        debtLimitOverridden: false,
        priceOverridePin: env.base.owner.pin,
        items: [
          {
            productId: p1.id,
            productName: p1.name,
            unitPrice: 50000,
            quantity: 1,
            lineTotal: 50000,
            originalPrice: 100000,
            priceOverride: true,
            priceOverrideReason: 'test pin',
          },
        ],
      },
      env.base.owner.authHeader,
    )

    expect(res.status).toBe(201)
    const orderId = res.body.data.id

    const oItems = await env.base.db.query.orderItems.findMany({
      where: eq(orderItems.orderId, orderId),
    })
    expect(oItems[0].priceOverridePinUsed).toBe(true)

    const logs = await env.base.db.query.auditLogs.findMany({
      where: eq(auditLogs.targetId, orderId),
    })
    const priceOverrideLog = logs.find(
      (l: { action: string }) => l.action === 'order_item.price_overridden',
    )
    expect(priceOverrideLog).toBeDefined()
  })

  it('4. Đơn ngoại tuyến qua /sync/push gửi giá lệch -> VẪN tạo đơn', async () => {
    const p1 = await createProduct(
      { db: env.base.db, storeId: env.base.storeId },
      { sellingPrice: 100000 },
    )

    const res = await makeRequest(
      env.syncApp,
      'POST',
      '/push',
      {
        clientId: '11111111-1111-1111-1111-111111111111',
        orders: [
          {
            clientId: '22222222-2222-2222-2222-222222222222',
            createdAt: new Date().toISOString(),
            orderData: {
              subtotal: 100000,
              discountValue: 0,
              discountAmount: 0,
              total: 100000,
              paymentMethod: 'cash',
              paymentStatus: 'paid',
              cashAmount: 100000,
              debtLimitOverridden: false,
              items: [
                {
                  productId: p1.id,
                  productName: p1.name,
                  unitPrice: 50000,
                  quantity: 2,
                  lineTotal: 100000,
                  originalPrice: 100000,
                  priceOverride: false,
                },
              ],
            },
          },
        ],
      },
      env.base.owner.authHeader,
    )

    expect(res.status).toBe(200)
    const orderRes = res.body.data.results[0]
    expect(orderRes.status).toBe('synced')

    const orderId = orderRes.serverId
    console.log('orderRes=', orderRes)
    const orderList = await env.base.db.select().from(orders).where(eq(orders.id, orderId))
    const order = orderList[0]
    expect(order?.subtotal).toBe(200000)
    expect(order?.total).toBe(200000)
    expect(order?.cashAmount).toBe(100000)

    const logs = await env.base.db.query.auditLogs.findMany({
      where: eq(auditLogs.targetId, orderId),
    })
    const adjustLog = logs.find(
      (l: { action: string }) => l.action === 'order.price_mismatch_adjusted',
    )
    expect(adjustLog).toBeDefined()
  })

  it('5. Các đơn POS HỢP LỆ không bị từ chối nhầm', async () => {
    const p1 = await createProduct(
      { db: env.base.db, storeId: env.base.storeId },
      { sellingPrice: 100000 },
    )
    const resUnit = await env.base.db
      .insert(productUnitConversions)
      .values({
        storeId: env.base.storeId,
        productId: p1.id,
        unit: 'Thùng 10',
        conversionFactor: 10,
        sellingPrice: 900000,
      })
      .returning()
    const c1 = resUnit[0]

    const res = await makeRequest(
      env.posApp,
      'POST',
      '/orders',
      {
        subtotal: 900000,
        discountValue: 0,
        discountAmount: 0,
        total: 900000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 900000,
        transferAmount: 0,
        debtLimitOverridden: false,
        items: [
          {
            productId: p1.id,
            unitConversionId: c1.id,
            productName: p1.name,
            unitPrice: 900000,
            quantity: 1,
            lineTotal: 900000,
            originalPrice: 900000,
            priceOverride: false,
          },
        ],
      },
      env.base.owner.authHeader,
    )

    expect(res.status).toBe(201)
  })
})

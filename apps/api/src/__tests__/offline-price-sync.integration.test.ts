/* eslint-disable */
// @ts-nocheck
import { notify } from '@kiotviet-lite/notifications'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@kiotviet-lite/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kiotviet-lite/notifications')>()),
  notify: vi.fn().mockResolvedValue([{ ok: true }]),
}))

import { auditLogs, customers, debts, orderItems, orders, products } from '@kiotviet-lite/shared'

import { createPosRoutes } from '../routes/pos.routes.js'
import { createStoreRoutes } from '../routes/store.routes.js'
import { createSyncRoutes } from '../routes/sync.routes.js'
import { createCustomer, createProduct, createUnitConversion } from './helpers/factories.js'
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

describe('Issue #34: Giữ giá đã chốt khi đồng bộ đơn ngoại tuyến', () => {
  let env: Env

  beforeAll(async () => {
    env = await setup()
  })

  it('1. Đồng bộ đơn ngoại tuyến khi giá máy chủ đã đổi: giữ giá chốt, công nợ chốt và ghi audit đối soát kèm nguồn giá', async () => {
    const notifyMock = vi.mocked(notify)
    notifyMock.mockClear()

    // Giá lúc tạo: Giá A = 100.000đ
    const p1 = await createProduct(
      { db: env.base.db, storeId: env.base.storeId },
      { sellingPrice: 100000 },
    )

    const cust = await createCustomer(
      { db: env.base.db, storeId: env.base.storeId },
      { currentDebt: 0, debtLimit: 500000 },
    )

    // Lúc mất mạng, thiết bị bán với giá A = 100.000đ, ghi nợ toàn bộ
    const offlineClientId = 'aaaaaaaa-1111-4444-8888-aaaaaaaaaaaa'
    const orderClientId = 'bbbbbbbb-2222-4444-8888-bbbbbbbbbbbb'

    // Trong khi thiết bị ngoại tuyến, trên máy chủ chủ cửa hàng tăng giá lên Giá B = 160.000đ
    await env.base.db.update(products).set({ sellingPrice: 160000 }).where(eq(products.id, p1.id))

    // Thiết bị có mạng trở lại và đồng bộ đơn ngoại tuyến
    const res = await makeRequest(
      env.syncApp,
      'POST',
      '/push',
      {
        clientId: offlineClientId,
        orders: [
          {
            clientId: orderClientId,
            createdAt: new Date().toISOString(),
            orderData: {
              customerId: cust.id,
              subtotal: 100000,
              discountValue: 0,
              discountAmount: 0,
              total: 100000,
              paymentMethod: 'debt',
              paymentStatus: 'unpaid',
              cashAmount: 0,
              transferAmount: 0,
              debtAmount: 100000,
              debtLimitOverridden: false,
              items: [
                {
                  productId: p1.id,
                  productName: p1.name,
                  unitPrice: 100000,
                  quantity: 1,
                  lineTotal: 100000,
                  originalPrice: 100000,
                  priceOverride: false,
                  priceSource: 'retail_price',
                  priceSourceDetail: null,
                },
              ],
            },
          },
        ],
      },
      env.base.owner.authHeader,
    )

    expect(res.status).toBe(200)
    const result = res.body.data.results[0]
    expect(result.status).toBe('synced')
    const serverId = result.serverId

    // Chi tiết đơn hàng phản ánh số tiền đã chốt tại quầy (Giá A = 100.000đ)
    const [savedOrder] = await env.base.db.select().from(orders).where(eq(orders.id, serverId))
    expect(savedOrder?.subtotal).toBe(100000)
    expect(savedOrder?.total).toBe(100000)
    expect(savedOrder?.paymentMethod).toBe('debt')

    // Dòng hàng giữ đơn giá lúc bán và nguồn giá từ thiết bị
    const savedItems = await env.base.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, serverId))
    expect(savedItems).toHaveLength(1)
    expect(savedItems[0]?.unitPrice).toBe(100000)
    expect(savedItems[0]?.lineTotal).toBe(100000)
    expect(savedItems[0]?.priceSource).toBe('retail_price')

    // Bản ghi công nợ phản ánh số tiền nợ đã chốt (100.000đ), không tự đổi sang 160.000đ
    const savedDebts = await env.base.db.select().from(debts).where(eq(debts.orderId, serverId))
    expect(savedDebts).toHaveLength(1)
    expect(savedDebts[0]?.amount).toBe(100000)

    const [updatedCust] = await env.base.db
      .select()
      .from(customers)
      .where(eq(customers.id, cust.id))
    expect(Number(updatedCust?.currentDebt)).toBe(100000)

    // Audit log và cảnh báo đối soát được ghi nhận
    const logs = await env.base.db.select().from(auditLogs).where(eq(auditLogs.targetId, serverId))
    const mismatchLog = logs.find((l) => l.action === 'order.price_mismatch_adjusted')
    expect(mismatchLog).toBeDefined()

    const changes = mismatchLog?.changes as Record<string, unknown>
    expect(changes.soldTotal).toBe(100000)
    const mismatched = changes.mismatchedLines as Array<Record<string, unknown>>
    expect(mismatched).toHaveLength(1)
    expect(mismatched[0]?.productId).toBe(p1.id)
    expect(mismatched[0]?.soldUnitPrice).toBe(100000)
    expect(mismatched[0]?.serverUnitPrice).toBe(160000)
    expect(mismatched[0]?.unitPriceDiff).toBe(60000)
    expect(mismatched[0]?.devicePriceSource).toBe('retail_price')
    expect(mismatched[0]?.serverPriceSource).toBe('retail_price')

    // Cảnh báo đối soát phát ra thông báo
    expect(notifyMock).toHaveBeenCalled()
    const notificationCalls = notifyMock.mock.calls
    const warnEvent = notificationCalls
      .map((c) => c[1])
      .find((e) => e.type === 'order.price_mismatch_adjusted' && e.context?.orderId === serverId)
    expect(warnEvent).toBeDefined()
    expect(warnEvent?.severity).toBe('warn')
  })

  it('2. Đồng bộ đơn thanh toán tiền mặt có tiền thừa: giữ nguyên khoản thanh toán và tiền thừa', async () => {
    const p2 = await createProduct(
      { db: env.base.db, storeId: env.base.storeId },
      { sellingPrice: 50000 },
    )

    // Máy chủ đổi giá lên 90.000đ
    await env.base.db.update(products).set({ sellingPrice: 90000 }).where(eq(products.id, p2.id))

    const orderClientId = 'cccccccc-3333-4444-8888-cccccccccccc'

    // Khách đưa 100.000đ, đơn giá 50.000đ, tiền thừa 50.000đ
    const res = await makeRequest(
      env.syncApp,
      'POST',
      '/push',
      {
        clientId: 'dddddddd-4444-4444-8888-dddddddddddd',
        orders: [
          {
            clientId: orderClientId,
            createdAt: new Date().toISOString(),
            orderData: {
              subtotal: 50000,
              discountValue: 0,
              discountAmount: 0,
              total: 50000,
              paymentMethod: 'cash',
              paymentStatus: 'paid',
              cashAmount: 100000,
              debtLimitOverridden: false,
              items: [
                {
                  productId: p2.id,
                  productName: p2.name,
                  unitPrice: 50000,
                  quantity: 1,
                  lineTotal: 50000,
                  originalPrice: 50000,
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
    const serverId = res.body.data.results[0].serverId

    const [savedOrder] = await env.base.db.select().from(orders).where(eq(orders.id, serverId))
    expect(savedOrder?.total).toBe(50000)
    expect(savedOrder?.cashAmount).toBe(100000)
    expect(savedOrder?.change).toBe(50000)
  })

  it('3. Đơn đồng bộ lại cùng mã chỉ ghi một lần (idempotent sync)', async () => {
    const p3 = await createProduct(
      { db: env.base.db, storeId: env.base.storeId },
      { sellingPrice: 80000 },
    )

    const orderClientId = 'eeeeeeee-5555-4444-8888-eeeeeeeeeeee'
    const payload = {
      clientId: 'ffffffff-6666-4444-8888-ffffffffffff',
      orders: [
        {
          clientId: orderClientId,
          createdAt: new Date().toISOString(),
          orderData: {
            subtotal: 80000,
            discountValue: 0,
            discountAmount: 0,
            total: 80000,
            paymentMethod: 'cash',
            paymentStatus: 'paid',
            cashAmount: 80000,
            debtLimitOverridden: false,
            items: [
              {
                productId: p3.id,
                productName: p3.name,
                unitPrice: 80000,
                quantity: 1,
                lineTotal: 80000,
                originalPrice: 80000,
                priceOverride: false,
              },
            ],
          },
        },
      ],
    }

    // Lần 1: synced
    const res1 = await makeRequest(env.syncApp, 'POST', '/push', payload, env.base.owner.authHeader)
    expect(res1.status).toBe(200)
    expect(res1.body.data.results[0].status).toBe('synced')
    const originalServerId = res1.body.data.results[0].serverId

    // Lần 2: retry cùng clientId -> trả về duplicate cùng serverId, không tạo thêm bản ghi
    const res2 = await makeRequest(env.syncApp, 'POST', '/push', payload, env.base.owner.authHeader)
    expect(res2.status).toBe(200)
    expect(res2.body.data.results[0].status).toBe('duplicate')
    expect(res2.body.data.results[0].serverId).toBe(originalServerId)

    const orderRows = await env.base.db
      .select()
      .from(orders)
      .where(eq(orders.clientId, orderClientId))
    expect(orderRows).toHaveLength(1)
  })

  it('4. Đơn vị quy đổi giá 0đ khi ngoại tuyến: giữ nguyên giá 0đ, tổng tiền, công nợ và ghi audit đối soát lệch giá', async () => {
    const notifyMock = vi.mocked(notify)
    notifyMock.mockClear()

    const p4 = await createProduct(
      { db: env.base.db, storeId: env.base.storeId },
      { sellingPrice: 50000 },
    )

    const pRegular = await createProduct(
      { db: env.base.db, storeId: env.base.storeId },
      { sellingPrice: 100000 },
    )

    const conv = await createUnitConversion(env.base, p4.id, {
      unit: 'thùng',
      conversionFactor: 10,
      sellingPrice: 500000,
    })

    const cust = await createCustomer(
      { db: env.base.db, storeId: env.base.storeId },
      { currentDebt: 0, debtLimit: 1000000 },
    )

    const orderClientId = '11111111-aaaa-4444-8888-111111111111'
    const payload = {
      clientId: '22222222-aaaa-4444-8888-222222222222',
      orders: [
        {
          clientId: orderClientId,
          createdAt: new Date().toISOString(),
          orderData: {
            customerId: cust.id,
            subtotal: 100000,
            discountValue: 0,
            discountAmount: 0,
            total: 100000,
            paymentMethod: 'debt',
            paymentStatus: 'unpaid',
            cashAmount: 0,
            debtAmount: 100000,
            debtLimitOverridden: false,
            items: [
              {
                productId: p4.id,
                productName: p4.name,
                unit: 'thùng',
                unitConversionId: conv.id,
                unitPrice: 0,
                quantity: 1,
                lineTotal: 0,
                originalPrice: 500000,
                priceOverride: false,
                priceSource: 'retail_price',
              },
              {
                productId: pRegular.id,
                productName: pRegular.name,
                unitPrice: 100000,
                quantity: 1,
                lineTotal: 100000,
                originalPrice: 100000,
                priceOverride: false,
              },
            ],
          },
        },
      ],
    }

    const res = await makeRequest(env.syncApp, 'POST', '/push', payload, env.base.owner.authHeader)
    expect(res.status).toBe(200)
    expect(res.body.data.results[0].status).toBe('synced')

    const serverId = res.body.data.results[0].serverId

    // Kiểm tra đơn hàng giữ nguyên tổng tiền và công nợ đã chốt
    const [savedOrder] = await env.base.db.select().from(orders).where(eq(orders.id, serverId))
    expect(savedOrder?.subtotal).toBe(100000)
    expect(savedOrder?.total).toBe(100000)

    const [savedDebt] = await env.base.db.select().from(debts).where(eq(debts.orderId, serverId))
    expect(savedDebt?.amount).toBe(100000)

    // Kiểm tra dòng hàng quy đổi giữ nguyên đơn giá 0đ và thành tiền 0đ
    const savedItems = await env.base.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, serverId))
    const convItem = savedItems.find((it) => it.productId === p4.id)
    expect(convItem?.unitPrice).toBe(0)
    expect(convItem?.lineTotal).toBe(0)

    // Kiểm tra nhật ký kiểm toán ghi nhận lệch giá đối soát
    const logs = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'order.price_mismatch_adjusted'))
    expect(logs.length).toBeGreaterThan(0)
    const log = logs.find((l) => l.targetId === serverId)
    expect(log).toBeDefined()
    const changes = log?.changes as {
      mismatchedLines: Array<{
        soldUnitPrice: number
        serverUnitPrice: number
        serverPriceSource: string
      }>
    }
    expect(changes.mismatchedLines).toHaveLength(1)
    expect(changes.mismatchedLines[0].soldUnitPrice).toBe(0)
    expect(changes.mismatchedLines[0].serverUnitPrice).toBe(500000)
    expect(changes.mismatchedLines[0].serverPriceSource).toBe('retail_price')
  })

  it('5. Nguồn giá bị làm giả: thiết bị sửa giá nhưng khai báo retail_price, máy chủ chuẩn hóa thành manual_override', async () => {
    const p5 = await createProduct(
      { db: env.base.db, storeId: env.base.storeId },
      { sellingPrice: 100000 },
    )

    const orderClientId = '33333333-bbbb-4444-8888-333333333333'
    const payload = {
      clientId: '44444444-bbbb-4444-8888-444444444444',
      orders: [
        {
          clientId: orderClientId,
          createdAt: new Date().toISOString(),
          orderData: {
            subtotal: 40000,
            discountValue: 0,
            discountAmount: 0,
            total: 40000,
            paymentMethod: 'cash',
            paymentStatus: 'paid',
            cashAmount: 40000,
            debtLimitOverridden: false,
            items: [
              {
                productId: p5.id,
                productName: p5.name,
                unitPrice: 40000,
                quantity: 1,
                lineTotal: 40000,
                originalPrice: 100000,
                priceOverride: true,
                priceOverrideReason: 'Gia giam thoa thuan',
                priceSource: 'retail_price',
              },
            ],
          },
        },
      ],
    }

    const res = await makeRequest(env.syncApp, 'POST', '/push', payload, env.base.owner.authHeader)
    expect(res.status).toBe(200)
    expect(res.body.data.results[0].status).toBe('synced')

    const serverId = res.body.data.results[0].serverId

    // Nguồn giá trên dòng hàng phải được chuẩn hóa thành manual_override
    const [savedItem] = await env.base.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, serverId))
    expect(savedItem?.priceOverride).toBe(true)
    expect(savedItem?.priceSource).toBe('manual_override')
    expect(savedItem?.unitPrice).toBe(40000)

    // Kiểm tra nhật ký kiểm toán ghi nhận order_item.price_overridden với pinUsed = false
    const overrideLogs = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'order_item.price_overridden'))
    const overrideLog = overrideLogs.find((l) => l.targetId === serverId)
    expect(overrideLog).toBeDefined()
    const changes = overrideLog?.changes as { pinUsed: boolean; unitPrice: number }
    expect(changes.pinUsed).toBe(false)
    expect(changes.unitPrice).toBe(40000)
  })
})

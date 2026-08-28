import type { NotificationEvent, SendResult } from '@kiotviet-lite/notifications'
import { and, eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { auditLogs, customers, debts, orders } from '@kiotviet-lite/shared'

import { createPosRoutes } from '../routes/pos.routes.js'
import { createSyncRoutes } from '../routes/sync.routes.js'
import { listCustomerOrders } from '../services/customers.service.js'
import { getOrderDetail, listOrders } from '../services/orders.service.js'
import { createCustomer, createProduct, resetFactorySeq } from './helpers/factories.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

const notifyMock = vi.hoisted(() =>
  vi.fn<(db: unknown, event: NotificationEvent) => Promise<SendResult[]>>(async () => []),
)

vi.mock('@kiotviet-lite/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kiotviet-lite/notifications')>()),
  notify: notifyMock,
}))

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.ACCESS_TOKEN_TTL_SECONDS = '900'
  process.env.REFRESH_TOKEN_TTL_SECONDS = '604800'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

describe('Task T2b: Đơn ngoại tuyến vượt hạn mức nợ ghi nhận thay vì từ chối', () => {
  let env: TestEnv
  let syncApp: ReturnType<typeof createSyncRoutes>
  let posApp: ReturnType<typeof createPosRoutes>

  beforeEach(async () => {
    notifyMock.mockClear()
    resetFactorySeq()
    env = await createTestEnv()
    syncApp = createSyncRoutes({ db: env.db })
    posApp = createPosRoutes({ db: env.db })
  })

  afterEach(async () => {
    await env.close()
  })

  async function pushSyncOrders(ordersPayload: unknown[]) {
    return syncApp.request('/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...env.owner.authHeader },
      body: JSON.stringify({ orders: ordersPayload }),
    })
  }

  async function createPosOrder(orderData: unknown) {
    return posApp.request('/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...env.owner.authHeader },
      body: JSON.stringify(orderData),
    })
  }

  it('1. Đơn ngoại tuyến vượt hạn mức nợ, không có PIN: sync THÀNH CÔNG, đơn được tạo, nợ ghi đúng', async () => {
    // Khách hàng có nợ trước 300k, hạn mức 500k
    const customer = await createCustomer(env, {
      name: 'Nguyễn Văn A',
      currentDebt: 300_000,
      debtLimit: 500_000,
    })
    const product = await createProduct(env, { sellingPrice: 400_000, currentStock: 20 })
    const clientId = 'c1000000-0000-0000-0000-000000000001'
    const offlineCreatedAt = '2026-08-28T09:30:00.000Z'

    // Bán nợ 400k -> tổng nợ mới: 700k > hạn mức 500k (vượt 200k), không có PIN
    const orderPayload = {
      clientId,
      createdAt: offlineCreatedAt,
      orderData: {
        customerId: customer.id,
        subtotal: 400_000,
        discountAmount: 0,
        total: 400_000,
        paymentMethod: 'debt',
        paymentStatus: 'unpaid',
        debtAmount: 400_000,
        debtLimitOverridden: false,
        items: [
          {
            productId: product.id,
            productName: product.name,
            unit: 'cái',
            unitPrice: 400_000,
            quantity: 1,
            discountAmount: 0,
            lineTotal: 400_000,
          },
        ],
      },
    }

    const res = await pushSyncOrders([orderPayload])
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: { results: Array<{ status: string; serverId?: string }> }
    }
    expect(body.data.results[0]!.status).toBe('synced')
    const serverId = body.data.results[0]!.serverId
    expect(serverId).toBeTruthy()

    // Kiểm tra đơn hàng trong DB có cờ debtLimitExceeded = true
    const [orderRow] = await env.db.select().from(orders).where(eq(orders.id, serverId!))
    expect(orderRow).toBeDefined()
    expect(orderRow!.debtLimitExceeded).toBe(true)
    expect(orderRow!.status).toBe('completed')

    // Kiểm tra nợ trong DB
    const debtRows = await env.db.select().from(debts).where(eq(debts.orderId, serverId!))
    expect(debtRows).toHaveLength(1)
    expect(debtRows[0]!.amount).toBe(400_000)
    expect(debtRows[0]!.remaining).toBe(400_000)

    // Kiểm tra tổng nợ khách hàng được cộng dồn đúng: 300k + 400k = 700k
    const [updatedCust] = await env.db.select().from(customers).where(eq(customers.id, customer.id))
    expect(updatedCust!.currentDebt).toBe(700_000)
  })

  it('2. Đơn ngoại tuyến vượt hạn mức nợ: CÓ bản ghi audit log và CÓ sự kiện thông báo cảnh báo phát ra', async () => {
    const customer = await createCustomer(env, {
      name: 'Trần Thị B',
      currentDebt: 800_000,
      debtLimit: 1_000_000,
    })
    const product = await createProduct(env, { sellingPrice: 500_000, currentStock: 10 })
    const clientId = 'c2000000-0000-0000-0000-000000000002'
    const offlineCreatedAt = '2026-08-28T08:15:00.000Z'

    const orderPayload = {
      clientId,
      createdAt: offlineCreatedAt,
      orderData: {
        customerId: customer.id,
        subtotal: 500_000,
        discountAmount: 0,
        total: 500_000,
        paymentMethod: 'debt',
        paymentStatus: 'unpaid',
        debtAmount: 500_000,
        debtLimitOverridden: false,
        items: [
          {
            productId: product.id,
            productName: product.name,
            unit: 'cái',
            unitPrice: 500_000,
            quantity: 1,
            discountAmount: 0,
            lineTotal: 500_000,
          },
        ],
      },
    }

    const res = await pushSyncOrders([orderPayload])
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: { results: Array<{ status: string; serverId?: string }> }
    }
    const orderId = body.data.results[0]!.serverId!

    // A. Kiểm tra audit log order.debt_limit_exceeded
    const auditLogsFound = await env.db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.storeId, env.storeId),
          eq(auditLogs.action, 'order.debt_limit_exceeded'),
          eq(auditLogs.targetId, orderId),
        ),
      )
    expect(auditLogsFound).toHaveLength(1)
    const log = auditLogsFound[0]!
    const changes = log.changes as Record<string, unknown>
    expect(changes.customerId).toBe(customer.id)
    expect(changes.customerName).toBe('Trần Thị B')
    expect(changes.debtLimit).toBe(1_000_000)
    expect(changes.debtBefore).toBe(800_000)
    expect(changes.debtAfter).toBe(1_300_000)
    expect(changes.exceededAmount).toBe(300_000)
    expect(changes.sellerId).toBe(env.owner.id)
    expect(changes.source).toBe('offline_sync')
    expect(changes.offlineCreatedAt).toBe(offlineCreatedAt)

    // B. Kiểm tra sự kiện thông báo được phát qua notification-emitter
    expect(notifyMock).toHaveBeenCalled()
    const notificationCalls = notifyMock.mock.calls
    const debtLimitEvent = notificationCalls
      .map((call) => call[1])
      .find((e) => e.type === 'order.debt_limit_exceeded')
    expect(debtLimitEvent).toBeDefined()
    expect(debtLimitEvent!.severity).toBe('warn')
    expect(debtLimitEvent!.title).toContain('Đơn ngoại tuyến vượt hạn mức nợ')
    expect(debtLimitEvent!.body).toContain('Trần Thị B')
    expect(debtLimitEvent!.body).toContain('300.000')
  })

  it('3. Đơn POS trực tiếp vượt hạn mức, không có PIN: VẪN BỊ TỪ CHỐI như cũ (422 BUSINESS_RULE_VIOLATION)', async () => {
    const customer = await createCustomer(env, {
      name: 'Lê Văn C',
      currentDebt: 400_000,
      debtLimit: 500_000,
    })
    const product = await createProduct(env, { sellingPrice: 300_000, currentStock: 10 })

    // Bán trực tiếp qua POS (source = 'pos'), nợ 300k -> 700k > 500k, không có PIN
    const posPayload = {
      customerId: customer.id,
      subtotal: 300_000,
      discountAmount: 0,
      total: 300_000,
      paymentMethod: 'debt',
      paymentStatus: 'unpaid',
      debtAmount: 300_000,
      debtLimitOverridden: false,
      items: [
        {
          productId: product.id,
          productName: product.name,
          unit: 'cái',
          unitPrice: 300_000,
          quantity: 1,
          discountAmount: 0,
          lineTotal: 300_000,
        },
      ],
    }

    const res = await createPosOrder(posPayload)
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('BUSINESS_RULE_VIOLATION')
    expect(body.error.message).toContain('Vượt hạn mức công nợ')

    // Đảm bảo không có đơn hàng nào được tạo và không có nợ mới
    const orderRows = await env.db.select().from(orders).where(eq(orders.customerId, customer.id))
    expect(orderRows).toHaveLength(0)

    const [custAfter] = await env.db.select().from(customers).where(eq(customers.id, customer.id))
    expect(custAfter!.currentDebt).toBe(400_000)
  })

  it('4. Đơn ngoại tuyến trong hạn mức: không sinh cảnh báo thừa', async () => {
    const customer = await createCustomer(env, {
      name: 'Phạm Thị D',
      currentDebt: 100_000,
      debtLimit: 500_000,
    })
    const product = await createProduct(env, { sellingPrice: 200_000, currentStock: 10 })
    const clientId = 'c4000000-0000-0000-0000-000000000004'

    // Nợ thêm 200k -> tổng nợ 300k <= 500k (trong hạn mức)
    const orderPayload = {
      clientId,
      createdAt: new Date().toISOString(),
      orderData: {
        customerId: customer.id,
        subtotal: 200_000,
        discountAmount: 0,
        total: 200_000,
        paymentMethod: 'debt',
        paymentStatus: 'unpaid',
        debtAmount: 200_000,
        items: [
          {
            productId: product.id,
            productName: product.name,
            unit: 'cái',
            unitPrice: 200_000,
            quantity: 1,
            discountAmount: 0,
            lineTotal: 200_000,
          },
        ],
      },
    }

    const res = await pushSyncOrders([orderPayload])
    expect(res.status).toBe(200)

    // Không sinh audit log order.debt_limit_exceeded
    const audits = await env.db
      .select()
      .from(auditLogs)
      .where(
        and(eq(auditLogs.storeId, env.storeId), eq(auditLogs.action, 'order.debt_limit_exceeded')),
      )
    expect(audits).toHaveLength(0)

    // Không emit notification order.debt_limit_exceeded
    const debtLimitEvent = notifyMock.mock.calls
      .map((c) => c[1])
      .find((e) => e.type === 'order.debt_limit_exceeded')
    expect(debtLimitEvent).toBeUndefined()
  })

  it('5. Truy vấn đơn hàng (listOrders, getOrderDetail, listCustomerOrders) hiển thị đúng cờ debtLimitExceeded', async () => {
    const customer = await createCustomer(env, {
      name: 'Vũ Văn E',
      currentDebt: 450_000,
      debtLimit: 500_000,
    })
    const product = await createProduct(env, { sellingPrice: 200_000, currentStock: 10 })
    const clientId = 'c5000000-0000-0000-0000-000000000005'

    const orderPayload = {
      clientId,
      createdAt: new Date().toISOString(),
      orderData: {
        customerId: customer.id,
        subtotal: 200_000,
        discountAmount: 0,
        total: 200_000,
        paymentMethod: 'debt',
        paymentStatus: 'unpaid',
        debtAmount: 200_000,
        items: [
          {
            productId: product.id,
            productName: product.name,
            unit: 'cái',
            unitPrice: 200_000,
            quantity: 1,
            discountAmount: 0,
            lineTotal: 200_000,
          },
        ],
      },
    }

    const res = await pushSyncOrders([orderPayload])
    const body = (await res.json()) as {
      data: { results: Array<{ status: string; serverId?: string }> }
    }
    const orderId = body.data.results[0]!.serverId!

    // A. Kiểm tra getOrderDetail
    const orderDetail = await getOrderDetail({
      db: env.db,
      storeId: env.storeId,
      orderId,
    })
    expect(orderDetail.debtLimitExceeded).toBe(true)

    // B. Kiểm tra listOrders
    const orderList = await listOrders({
      db: env.db,
      storeId: env.storeId,
      query: { page: 1, pageSize: 20 },
    })
    const itemInList = orderList.data.find((o) => o.id === orderId)
    expect(itemInList).toBeDefined()
    expect(itemInList!.debtLimitExceeded).toBe(true)

    // C. Kiểm tra listCustomerOrders
    const customerOrders = await listCustomerOrders({
      db: env.db,
      storeId: env.storeId,
      targetId: customer.id,
      query: { page: 1, pageSize: 20 },
    })
    const custItem = customerOrders.items.find((o) => o.id === orderId)
    expect(custItem).toBeDefined()
    expect(custItem!.debtLimitExceeded).toBe(true)
  })
})

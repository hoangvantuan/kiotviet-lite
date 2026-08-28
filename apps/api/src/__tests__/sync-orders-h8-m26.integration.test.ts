import { and, eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { auditLogs, debts, orders, products } from '@kiotviet-lite/shared'

import { createSyncRoutes } from '../routes/sync.routes.js'
import {
  createCustomer,
  createProduct,
  createStore,
  createUnitConversion,
  resetFactorySeq,
} from './helpers/factories.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.ACCESS_TOKEN_TTL_SECONDS = '900'
  process.env.REFRESH_TOKEN_TTL_SECONDS = '604800'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

describe('H8 + M26: Refactor createOrder và Offline Sync Push', () => {
  let base: TestEnv
  let app: ReturnType<typeof createSyncRoutes>

  beforeEach(async () => {
    resetFactorySeq()
    base = await createTestEnv()
    app = createSyncRoutes({ db: base.db })
  })

  async function pushOrders(ordersPayload: unknown[]) {
    return app.request('/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...base.owner.authHeader },
      body: JSON.stringify({ orders: ordersPayload }),
    })
  }

  it('Sync push trùng clientId chỉ tạo 1 đơn hàng và trả về status duplicate', async () => {
    const product = await createProduct(base, { currentStock: 100, sellingPrice: 100_000 })
    const clientId = 'c1111111-1111-1111-1111-111111111111'

    const orderPayload = {
      clientId,
      createdAt: new Date().toISOString(),
      orderData: {
        subtotal: 200_000,
        discountAmount: 0,
        total: 200_000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 200_000,
        items: [
          {
            productId: product.id,
            productName: product.name,
            unit: 'cái',
            unitPrice: 100_000,
            quantity: 2,
            discountAmount: 0,
            lineTotal: 200_000,
          },
        ],
      },
    }

    // Push lần 1
    const res1 = await pushOrders([orderPayload])
    expect(res1.status).toBe(200)
    const body1 = (await res1.json()) as {
      data: { results: Array<{ status: string; serverId: string }> }
    }
    expect(body1.data.results[0]!.status).toBe('synced')
    const firstServerId = body1.data.results[0]!.serverId

    // Push lần 2 cùng clientId
    const res2 = await pushOrders([orderPayload])
    expect(res2.status).toBe(200)
    const body2 = (await res2.json()) as {
      data: { results: Array<{ status: string; serverId: string }> }
    }
    expect(body2.data.results[0]!.status).toBe('duplicate')
    expect(body2.data.results[0]!.serverId).toBe(firstServerId)

    // Kiểm tra trong DB chỉ có duy nhất 1 đơn
    const orderRows = await base.db
      .select()
      .from(orders)
      .where(and(eq(orders.storeId, base.storeId), eq(orders.clientId, clientId)))
    expect(orderRows.length).toBe(1)

    // Kho chỉ trừ 1 lần (100 - 2 = 98)
    const [updatedProduct] = await base.db
      .select()
      .from(products)
      .where(eq(products.id, product.id))
    expect(updatedProduct!.currentStock).toBe(98)
  })

  it('Đơn tạo qua sync CÓ audit log đầy đủ (order.created, debt.created)', async () => {
    const customer = await createCustomer(base, { debtLimit: 1_000_000 })
    const product = await createProduct(base, { sellingPrice: 50_000 })
    const clientId = 'c2222222-2222-2222-2222-222222222222'

    const orderPayload = {
      clientId,
      createdAt: new Date().toISOString(),
      orderData: {
        customerId: customer.id,
        subtotal: 100_000,
        discountAmount: 0,
        total: 100_000,
        paymentMethod: 'debt',
        paymentStatus: 'unpaid',
        debtAmount: 100_000,
        items: [
          {
            productId: product.id,
            productName: product.name,
            unit: 'cái',
            unitPrice: 50_000,
            quantity: 2,
            discountAmount: 0,
            lineTotal: 100_000,
          },
        ],
      },
    }

    const res = await pushOrders([orderPayload])
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: { results: Array<{ status: string; serverId: string }> }
    }
    expect(body.data.results[0]!.status).toBe('synced')
    const orderId = body.data.results[0]!.serverId

    // Kiểm tra audit log order.created
    const orderAudits = await base.db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.storeId, base.storeId),
          eq(auditLogs.action, 'order.created'),
          eq(auditLogs.targetId, orderId),
        ),
      )
    expect(orderAudits.length).toBe(1)
    const orderAudit = orderAudits[0]!
    expect((orderAudit.changes as Record<string, unknown>).source).toBe('offline_sync')
    expect((orderAudit.changes as Record<string, unknown>).clientId).toBe(clientId)

    // Kiểm tra audit log debt.created
    const debtAudits = await base.db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.storeId, base.storeId),
          eq(auditLogs.action, 'debt.created'),
          eq(auditLogs.targetId, orderId),
        ),
      )
    expect(debtAudits.length).toBe(1)
    const debtAudit = debtAudits[0]!
    expect((debtAudit.changes as Record<string, unknown>).source).toBe('offline_sync')

    // Kiểm tra nợ ghi vào bảng debts
    const debtRows = await base.db.select().from(debts).where(eq(debts.orderId, orderId))
    expect(debtRows.length).toBe(1)
    expect(debtRows[0]!.amount).toBe(100_000)
  })

  it('Đơn tạo qua sync CÓ kiểm hạn mức nợ (chặn khi vượt hạn mức mà không có PIN)', async () => {
    const customer = await createCustomer(base, { currentDebt: 400_000, debtLimit: 500_000 })
    const product = await createProduct(base, { sellingPrice: 200_000 })
    const clientId = 'c3333333-3333-3333-3333-333333333333'

    // Nợ thêm 200k -> tổng nợ 600k > 500k (vượt hạn mức)
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
        debtLimitOverridden: false,
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

    const res = await pushOrders([orderPayload])
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: { results: Array<{ status: string; error?: { code: string } }> }
    }
    expect(body.data.results[0]!.status).toBe('error')
    expect(body.data.results[0]!.error?.code).toBe('BUSINESS_RULE_VIOLATION')
  })

  it('Đơn tạo qua sync vượt hạn mức nợ nhưng CÓ PIN override hợp lệ -> sync thành công', async () => {
    const customer = await createCustomer(base, { currentDebt: 400_000, debtLimit: 500_000 })
    const product = await createProduct(base, { sellingPrice: 200_000 })
    const clientId = 'c4444444-4444-4444-4444-444444444444'

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
        debtLimitOverridden: true,
        debtLimitOverridePin: base.owner.pin, // '111111'
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

    const res = await pushOrders([orderPayload])
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { results: Array<{ status: string }> } }
    expect(body.data.results[0]!.status).toBe('synced')

    // Kiểm tra có audit log debt.limit_overridden
    const overrideAudits = await base.db
      .select()
      .from(auditLogs)
      .where(
        and(eq(auditLogs.storeId, base.storeId), eq(auditLogs.action, 'debt.limit_overridden')),
      )
    expect(overrideAudits.length).toBe(1)
  })

  it('M26: Quy đổi đơn vị của SẢN PHẨM KHÁC bị từ chối', async () => {
    const productA = await createProduct(base, { name: 'SP A', currentStock: 100 })
    const productB = await createProduct(base, { name: 'SP B', currentStock: 100 })
    const ucB = await createUnitConversion(base, productB.id, {
      unit: 'thùng',
      conversionFactor: 10,
    })

    const clientId = 'c5555555-5555-5555-5555-555555555555'

    // Gửi item là productA nhưng dùng unitConversionId của productB
    const orderPayload = {
      clientId,
      createdAt: new Date().toISOString(),
      orderData: {
        subtotal: 100_000,
        discountAmount: 0,
        total: 100_000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 100_000,
        items: [
          {
            productId: productA.id,
            productName: productA.name,
            unit: 'thùng',
            unitConversionId: ucB.id, // SAI SẢN PHẨM
            unitPrice: 100_000,
            quantity: 1,
            discountAmount: 0,
            lineTotal: 100_000,
          },
        ],
      },
    }

    const res = await pushOrders([orderPayload])
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: { results: Array<{ status: string; error?: { code: string } }> }
    }
    expect(body.data.results[0]!.status).toBe('error')
    expect(body.data.results[0]!.error?.code).toBe('VALIDATION_ERROR')
  })

  it('M26: Quy đổi đơn vị của CỬA HÀNG KHÁC bị từ chối', async () => {
    const otherStore = await createStore(base)
    const otherProduct = await createProduct(base, { storeId: otherStore.id, currentStock: 100 })
    const otherUc = await createUnitConversion(base, otherProduct.id, {
      storeId: otherStore.id,
      unit: 'thùng',
      conversionFactor: 10,
    })

    const myProduct = await createProduct(base, { currentStock: 100 })
    const clientId = 'c6666666-6666-6666-6666-666666666666'

    // Gửi item dùng unitConversionId của cửa hàng khác
    const orderPayload = {
      clientId,
      createdAt: new Date().toISOString(),
      orderData: {
        subtotal: 100_000,
        discountAmount: 0,
        total: 100_000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 100_000,
        items: [
          {
            productId: myProduct.id,
            productName: myProduct.name,
            unit: 'thùng',
            unitConversionId: otherUc.id, // SAI CỬA HÀNG
            unitPrice: 100_000,
            quantity: 1,
            discountAmount: 0,
            lineTotal: 100_000,
          },
        ],
      },
    }

    const res = await pushOrders([orderPayload])
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: { results: Array<{ status: string; error?: { code: string } }> }
    }
    expect(body.data.results[0]!.status).toBe('error')
    expect(body.data.results[0]!.error?.code).toBe('VALIDATION_ERROR')
  })

  it('M26: Quy đổi đơn vị hợp lệ trừ đúng tồn kho nhân với hệ số conversionFactor', async () => {
    const product = await createProduct(base, { currentStock: 50 })
    const uc = await createUnitConversion(base, product.id, { unit: 'hộp', conversionFactor: 6 })
    const clientId = 'c7777777-7777-7777-7777-777777777777'

    const orderPayload = {
      clientId,
      createdAt: new Date().toISOString(),
      orderData: {
        subtotal: 300_000,
        discountAmount: 0,
        total: 300_000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 300_000,
        items: [
          {
            productId: product.id,
            productName: product.name,
            unit: 'hộp',
            unitConversionId: uc.id,
            unitPrice: 100_000,
            quantity: 3, // 3 hộp * 6 = 18 cái
            discountAmount: 0,
            lineTotal: 300_000,
          },
        ],
      },
    }

    const res = await pushOrders([orderPayload])
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { results: Array<{ status: string }> } }
    expect(body.data.results[0]!.status).toBe('synced')

    // Tồn kho ban đầu 50 - (3 * 6) = 32
    const [updatedProduct] = await base.db
      .select()
      .from(products)
      .where(eq(products.id, product.id))
    expect(updatedProduct!.currentStock).toBe(32)
  })

  it('Bán dưới giá vốn qua sync phát sinh audit log price_overridden', async () => {
    const product = await createProduct(base, { costPrice: 80_000, sellingPrice: 100_000 })
    const clientId = 'c8888888-8888-8888-8888-888888888888'

    const orderPayload = {
      clientId,
      createdAt: new Date().toISOString(),
      orderData: {
        subtotal: 60_000,
        discountAmount: 0,
        total: 60_000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 60_000,
        items: [
          {
            productId: product.id,
            productName: product.name,
            unit: 'cái',
            unitPrice: 60_000, // Giá bán 60k < giá vốn 80k
            quantity: 1,
            originalPrice: 100_000,
            priceOverride: true,
            priceOverrideReason: 'Giảm giá offline đặc biệt',
            discountAmount: 0,
            lineTotal: 60_000,
          },
        ],
      },
    }

    const res = await pushOrders([orderPayload])
    expect(res.status).toBe(200)

    // Kiểm tra audit log order_item.price_overridden
    const audits = await base.db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.storeId, base.storeId),
          eq(auditLogs.action, 'order_item.price_overridden'),
        ),
      )
    expect(audits.length).toBe(1)
    const audit = audits[0]!
    expect((audit.changes as Record<string, unknown>).unitPrice).toBe(60_000)
    expect((audit.changes as Record<string, unknown>).reason).toBe('Giảm giá offline đặc biệt')
  })
})

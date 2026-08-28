/**
 * Integration test cho lỗi H5, H6, H7, H11 (Pha 1 — Tính đúng tiền sau bán và trả hàng)
 *
 * H5: Đơn partial_return biến mất khỏi báo cáo → dùng revenueStatusFilter + trừ hoàn trả
 * H6: Hoàn tiền bỏ chiết khấu → tính theo lineTotal/quantity + phân bổ CK cấp đơn
 * H7: Điều chỉnh nợ lệch 2 nguồn → settle debts.remaining khi giảm nợ
 * H11: Báo cáo lệch 7h timezone → parseDateRangeLocal + dateTruncLocal
 */
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { customers, debts, orderItems, orderReturns, orders, products } from '@kiotviet-lite/shared'

import { errorHandler } from '../middleware/error-handler.js'
import { createDebtAdjustmentsRoutes } from '../routes/debt-adjustments.routes.js'
import { createOrdersRoutes } from '../routes/orders.routes.js'
import { createReportsRoutes } from '../routes/reports.routes.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.ACCESS_TOKEN_TTL_SECONDS = '900'
  process.env.REFRESH_TOKEN_TTL_SECONDS = '604800'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
  // H11: đảm bảo test dùng múi giờ Việt Nam
  process.env.STORE_TIMEZONE = 'Asia/Ho_Chi_Minh'
  process.env.STORE_TIMEZONE_OFFSET = '+07:00'
})

// ============================================================================
// H5: Đơn partial_return phải xuất hiện trong báo cáo doanh thu & lợi nhuận
// ============================================================================
describe('H5 — Đơn partial_return không biến mất khỏi báo cáo', () => {
  let base: TestEnv
  let ordersApp: ReturnType<typeof createOrdersRoutes>
  let reportsApp: Hono
  let productId: string
  let orderId: string

  beforeEach(async () => {
    base = await createTestEnv()
    ordersApp = createOrdersRoutes({ db: base.db })
    const reportsRoutes = createReportsRoutes({ db: base.db })
    reportsApp = new Hono()
    reportsApp.onError(errorHandler)
    reportsApp.route('/api/v1/reports', reportsRoutes)

    // Tạo sản phẩm
    const [product] = await base.db
      .insert(products)
      .values({
        storeId: base.storeId,
        name: 'SP Test H5',
        sku: 'SKU-H5',
        currentStock: 100,
        minStock: 5,
        trackInventory: true,
        unit: 'cái',
        costPrice: 50000,
        sellingPrice: 100000,
        hasVariants: false,
      })
      .returning()
    productId = product!.id

    // Tạo khách hàng
    const [customer] = await base.db
      .insert(customers)
      .values({
        storeId: base.storeId,
        name: 'KH H5',
        phone: '0900000555',
        currentDebt: 0,
      })
      .returning()

    // Tạo đơn hàng trị giá 1.000.000đ (10 SP x 100.000đ)
    const [order] = await base.db
      .insert(orders)
      .values({
        storeId: base.storeId,
        orderNumber: 'HD-H5-0001',
        customerId: customer!.id,
        userId: base.owner.id,
        subtotal: 1000000,
        discountAmount: 0,
        total: 1000000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 1000000,
        change: 0,
        status: 'completed',
      })
      .returning()
    orderId = order!.id

    await base.db.insert(orderItems).values({
      orderId,
      productId,
      productName: 'SP Test H5',
      unit: 'cái',
      unitPrice: 100000,
      quantity: 10,
      discountAmount: 0,
      lineTotal: 1000000,
    })
  })

  afterEach(async () => {
    await base.close()
  })

  it('doanh thu sau trả 1 phần = tổng đơn trừ tiền hoàn ở mọi báo cáo', async () => {
    // Trả 2 SP (200.000đ)
    const itemsRes = await ordersApp.request(`/${orderId}/returnable-items`, {
      method: 'GET',
      headers: base.owner.authHeader,
    })
    const { data: items } = (await itemsRes.json()) as {
      data: Array<{ orderItemId: string }>
    }

    const returnRes = await ordersApp.request(`/${orderId}/returns`, {
      method: 'POST',
      headers: { ...base.owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ orderItemId: items[0]!.orderItemId, quantity: 2, reason: 'defective' }],
      }),
    })
    expect(returnRes.status).toBe(201)

    // Xác nhận order status = partial_return
    const [orderRow] = await base.db
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, orderId))
    expect(orderRow!.status).toBe('partial_return')

    // Kiểm tra refundAmount trong order_returns
    const returnRows = await base.db
      .select({
        totalAmount: orderReturns.totalAmount,
        refundAmount: orderReturns.refundAmount,
      })
      .from(orderReturns)
      .where(eq(orderReturns.orderId, orderId))
    expect(returnRows).toHaveLength(1)
    expect(Number(returnRows[0]!.refundAmount)).toBe(200000)

    // Doanh thu ròng phải = 1.000.000 - 200.000 = 800.000đ
    const { getRevenueByTime, getRevenueByProduct, getRevenueByCustomer, getRevenueByEmployee } =
      await import('../services/revenue-report.service.js')
    const { getProfitReport } = await import('../services/profit-report.service.js')

    const timeReport = await getRevenueByTime(base.db, base.storeId, undefined, undefined, 'day')
    expect(timeReport.summary.totalRevenue).toBe(800000)

    const productReport = await getRevenueByProduct(base.db, base.storeId, undefined, undefined)
    expect(productReport.summary.totalRevenue).toBe(800000)
    expect(productReport.summary.totalQuantity).toBe(8) // 10 - 2 đã trả
    expect(productReport.rows[0]!.quantity).toBe(8)
    expect(productReport.rows[0]!.revenue).toBe(800000)

    const customerReport = await getRevenueByCustomer(base.db, base.storeId, undefined, undefined)
    expect(customerReport.summary.totalRevenue).toBe(800000)
    expect(customerReport.rows[0]!.revenue).toBe(800000)

    const employeeReport = await getRevenueByEmployee(base.db, base.storeId, undefined, undefined)
    expect(employeeReport.summary.totalRevenue).toBe(800000)
    expect(employeeReport.rows[0]!.revenue).toBe(800000)

    const profitReport = await getProfitReport(base.db, base.storeId, undefined, undefined)
    expect(profitReport.summary.totalRevenue).toBe(800000)
    expect(profitReport.summary.totalCogs).toBe(400000) // 8 * 50.000đ
    expect(profitReport.summary.grossProfit).toBe(400000)
  })

  it('đơn full_return không tính vào doanh thu hoặc lợi nhuận', async () => {
    // Trả toàn bộ 10 SP
    const itemsRes = await ordersApp.request(`/${orderId}/returnable-items`, {
      method: 'GET',
      headers: base.owner.authHeader,
    })
    const { data: items } = (await itemsRes.json()) as {
      data: Array<{ orderItemId: string; remainingQuantity: number }>
    }

    const returnRes = await ordersApp.request(`/${orderId}/returns`, {
      method: 'POST',
      headers: { ...base.owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ orderItemId: items[0]!.orderItemId, quantity: 10, reason: 'defective' }],
      }),
    })
    expect(returnRes.status).toBe(201)

    // Xác nhận order status = full_return
    const [orderRow] = await base.db
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, orderId))
    expect(orderRow!.status).toBe('full_return')

    const { getRevenueByTime } = await import('../services/revenue-report.service.js')
    const timeReport = await getRevenueByTime(base.db, base.storeId, undefined, undefined, 'day')
    expect(timeReport.summary.totalRevenue).toBe(0)
    expect(timeReport.summary.totalOrders).toBe(0)
  })
})

// ============================================================================
// H6: Hoàn tiền phải trừ chiết khấu (dòng + đơn)
// ============================================================================
describe('H6 — Hoàn tiền tính đúng chiết khấu', () => {
  let base: TestEnv
  let ordersApp: ReturnType<typeof createOrdersRoutes>

  beforeEach(async () => {
    base = await createTestEnv()
    ordersApp = createOrdersRoutes({ db: base.db })
  })

  afterEach(async () => {
    await base.close()
  })

  it('refund có chiết khấu dòng: hoàn = lineTotal/quantity * qty trả', async () => {
    // Tạo sản phẩm
    const [product] = await base.db
      .insert(products)
      .values({
        storeId: base.storeId,
        name: 'SP CK Dòng',
        sku: 'SKU-H6-A',
        currentStock: 100,
        trackInventory: true,
        unit: 'cái',
        costPrice: 50000,
        sellingPrice: 100000,
        hasVariants: false,
      })
      .returning()

    const [customer] = await base.db
      .insert(customers)
      .values({
        storeId: base.storeId,
        name: 'KH H6',
        phone: '0900000666',
        currentDebt: 0,
      })
      .returning()

    // Đơn: 2 SP x 100.000đ, chiết khấu dòng 40.000đ → lineTotal = 160.000đ
    // Khách thực trả 160.000đ
    const [order] = await base.db
      .insert(orders)
      .values({
        storeId: base.storeId,
        orderNumber: 'HD-H6-0001',
        customerId: customer!.id,
        userId: base.owner.id,
        subtotal: 160000,
        discountAmount: 0,
        total: 160000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 160000,
        change: 0,
        status: 'completed',
      })
      .returning()

    await base.db.insert(orderItems).values({
      orderId: order!.id,
      productId: product!.id,
      productName: 'SP CK Dòng',
      unit: 'cái',
      unitPrice: 100000,
      quantity: 2,
      discountAmount: 40000,
      lineTotal: 160000, // = 100000 * 2 - 40000
    })

    // Trả cả 2 SP
    const itemsRes = await ordersApp.request(`/${order!.id}/returnable-items`, {
      method: 'GET',
      headers: base.owner.authHeader,
    })
    const { data: items } = (await itemsRes.json()) as {
      data: Array<{ orderItemId: string }>
    }

    const returnRes = await ordersApp.request(`/${order!.id}/returns`, {
      method: 'POST',
      headers: { ...base.owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ orderItemId: items[0]!.orderItemId, quantity: 2, reason: 'defective' }],
      }),
    })
    expect(returnRes.status).toBe(201)
    const { data } = (await returnRes.json()) as {
      data: { refundAmount: number; totalAmount: number }
    }
    // Hoàn tiền phải = 160.000đ (lineTotal), KHÔNG phải 200.000đ (unitPrice * qty)
    expect(data.totalAmount).toBe(160000)
    expect(data.refundAmount).toBe(160000)
  })

  it('refund có chiết khấu cấp đơn: hoàn ≤ tổng khách thực trả', async () => {
    // Tạo sản phẩm
    const [product] = await base.db
      .insert(products)
      .values({
        storeId: base.storeId,
        name: 'SP CK Đơn',
        sku: 'SKU-H6-B',
        currentStock: 100,
        trackInventory: true,
        unit: 'cái',
        costPrice: 30000,
        sellingPrice: 500000,
        hasVariants: false,
      })
      .returning()

    const [customer] = await base.db
      .insert(customers)
      .values({
        storeId: base.storeId,
        name: 'KH H6B',
        phone: '0900000667',
        currentDebt: 0,
      })
      .returning()

    // Đơn: 2 SP x 500.000đ = subtotal 1.000.000đ
    // CK cấp đơn: 300.000đ → total = 700.000đ
    const [order] = await base.db
      .insert(orders)
      .values({
        storeId: base.storeId,
        orderNumber: 'HD-H6-0002',
        customerId: customer!.id,
        userId: base.owner.id,
        subtotal: 1000000,
        discountAmount: 300000,
        total: 700000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 700000,
        change: 0,
        status: 'completed',
      })
      .returning()

    await base.db.insert(orderItems).values([
      {
        orderId: order!.id,
        productId: product!.id,
        productName: 'SP CK Đơn',
        unit: 'cái',
        unitPrice: 500000,
        quantity: 2,
        discountAmount: 0,
        lineTotal: 1000000, // = 500000 * 2
      },
    ])

    // Trả 1 SP
    const itemsRes = await ordersApp.request(`/${order!.id}/returnable-items`, {
      method: 'GET',
      headers: base.owner.authHeader,
    })
    const { data: items } = (await itemsRes.json()) as {
      data: Array<{ orderItemId: string }>
    }

    const returnRes = await ordersApp.request(`/${order!.id}/returns`, {
      method: 'POST',
      headers: { ...base.owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          { orderItemId: items[0]!.orderItemId, quantity: 1, reason: 'customer_changed_mind' },
        ],
      }),
    })
    expect(returnRes.status).toBe(201)
    const { data } = (await returnRes.json()) as {
      data: { refundAmount: number; totalAmount: number }
    }
    // Hoàn tiền phải ≤ 500.000đ (nửa đơn) nhưng có CK cấp đơn 30%
    // effectiveUnitPrice = 1000000 / 2 = 500.000đ
    // totalAmount trước CK đơn = 500.000đ
    // Sau CK đơn: 500.000 * (700.000 / 1.000.000) = 350.000đ
    expect(data.totalAmount).toBe(350000)
    expect(data.refundAmount).toBe(350000)
  })

  it('kết hợp chiết khấu dòng + chiết khấu cấp đơn: phân bổ chuẩn xác', async () => {
    const [productA] = await base.db
      .insert(products)
      .values({
        storeId: base.storeId,
        name: 'SP H6 Combo A',
        sku: 'SKU-H6-C1',
        currentStock: 100,
        trackInventory: true,
        unit: 'cái',
        costPrice: 50000,
        sellingPrice: 200000,
        hasVariants: false,
      })
      .returning()

    const [productB] = await base.db
      .insert(products)
      .values({
        storeId: base.storeId,
        name: 'SP H6 Combo B',
        sku: 'SKU-H6-C2',
        currentStock: 100,
        trackInventory: true,
        unit: 'cái',
        costPrice: 100000,
        sellingPrice: 300000,
        hasVariants: false,
      })
      .returning()

    const [customer] = await base.db
      .insert(customers)
      .values({
        storeId: base.storeId,
        name: 'KH H6 Combo',
        phone: '0900000668',
        currentDebt: 0,
      })
      .returning()

    // Dòng 1: SP A x 2 cái = 400.000đ, CK dòng 50.000đ → lineTotal = 350.000đ
    // Dòng 2: SP B x 1 cái = 300.000đ, CK dòng 0đ → lineTotal = 300.000đ
    // Subtotal = 650.000đ
    // CK cấp đơn = 130.000đ (20%) → Total = 520.000đ
    const [order] = await base.db
      .insert(orders)
      .values({
        storeId: base.storeId,
        orderNumber: 'HD-H6-COMBO',
        customerId: customer!.id,
        userId: base.owner.id,
        subtotal: 650000,
        discountAmount: 130000,
        total: 520000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 520000,
        change: 0,
        status: 'completed',
      })
      .returning()

    const [itemA] = await base.db
      .insert(orderItems)
      .values({
        orderId: order!.id,
        productId: productA!.id,
        productName: 'SP H6 Combo A',
        unit: 'cái',
        unitPrice: 200000,
        quantity: 2,
        discountAmount: 50000,
        lineTotal: 350000,
      })
      .returning()

    await base.db.insert(orderItems).values({
      orderId: order!.id,
      productId: productB!.id,
      productName: 'SP H6 Combo B',
      unit: 'cái',
      unitPrice: 300000,
      quantity: 1,
      discountAmount: 0,
      lineTotal: 300000,
    })

    // Trả 1 SP A:
    // effectiveUnitPrice = floor(350.000 / 2) = 175.000đ
    // Tỷ lệ thanh toán đơn: 520.000 / 650.000 = 0.8 (80%)
    // Sau phân bổ đơn: floor(175.000 * 0.8) = 140.000đ
    const returnRes = await ordersApp.request(`/${order!.id}/returns`, {
      method: 'POST',
      headers: { ...base.owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ orderItemId: itemA!.id, quantity: 1, reason: 'customer_changed_mind' }],
      }),
    })
    expect(returnRes.status).toBe(201)
    const { data } = (await returnRes.json()) as {
      data: { refundAmount: number; totalAmount: number }
    }
    expect(data.totalAmount).toBe(140000)
    expect(data.refundAmount).toBe(140000)
  })

  it('dòng hàng lineTotal = 100000, quantity = 3 (chia không hết): trả cả 3 hoàn đúng 100000', async () => {
    const [product] = await base.db
      .insert(products)
      .values({
        storeId: base.storeId,
        name: 'SP Chia 3',
        sku: 'SKU-DIV-3',
        currentStock: 10,
        costPrice: 20000,
        sellingPrice: 40000,
        hasVariants: false,
      })
      .returning()

    const [customer] = await base.db
      .insert(customers)
      .values({
        storeId: base.storeId,
        name: 'KH Chia 3',
        phone: '0900000333',
        currentDebt: 0,
      })
      .returning()

    // Đơn: 3 cái, giảm giá 20.000đ → lineTotal = 100.000đ (100.000 / 3 = 33333.33...)
    const [order] = await base.db
      .insert(orders)
      .values({
        storeId: base.storeId,
        orderNumber: 'HD-DIV-3',
        customerId: customer!.id,
        userId: base.owner.id,
        subtotal: 100000,
        discountAmount: 0,
        total: 100000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 100000,
        change: 0,
        status: 'completed',
      })
      .returning()

    const [item] = await base.db
      .insert(orderItems)
      .values({
        orderId: order!.id,
        productId: product!.id,
        productName: 'SP Chia 3',
        unit: 'cái',
        unitPrice: 40000,
        quantity: 3,
        discountAmount: 20000,
        lineTotal: 100000,
      })
      .returning()

    // Trả cả 3 sản phẩm trong 1 lần
    const returnRes = await ordersApp.request(`/${order!.id}/returns`, {
      method: 'POST',
      headers: { ...base.owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ orderItemId: item!.id, quantity: 3, reason: 'defective' }],
      }),
    })
    expect(returnRes.status).toBe(201)
    const { data } = (await returnRes.json()) as {
      data: { refundAmount: number; totalAmount: number }
    }
    // Phải hoàn ĐÚNG 100.000đ, KHÔNG phải 99.999đ do làm tròn
    expect(data.totalAmount).toBe(100000)
    expect(data.refundAmount).toBe(100000)
  })

  it('đơn có chiết khấu cấp đơn, trả hết toàn bộ hàng: tổng hoàn đúng bằng orders.total', async () => {
    const [productA] = await base.db
      .insert(products)
      .values({
        storeId: base.storeId,
        name: 'SP CK Đơn A',
        sku: 'SKU-CK-A',
        costPrice: 50000,
        sellingPrice: 100000,
        hasVariants: false,
      })
      .returning()

    const [productB] = await base.db
      .insert(products)
      .values({
        storeId: base.storeId,
        name: 'SP CK Đơn B',
        sku: 'SKU-CK-B',
        costPrice: 100000,
        sellingPrice: 200000,
        hasVariants: false,
      })
      .returning()

    const [customer] = await base.db
      .insert(customers)
      .values({
        storeId: base.storeId,
        name: 'KH CK Full',
        phone: '0900000444',
        currentDebt: 0,
      })
      .returning()

    // Subtotal: 100k + 200k = 300k, CK đơn 50k → Total = 250.000đ
    const [order] = await base.db
      .insert(orders)
      .values({
        storeId: base.storeId,
        orderNumber: 'HD-CK-FULL',
        customerId: customer!.id,
        userId: base.owner.id,
        subtotal: 300000,
        discountAmount: 50000,
        total: 250000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 250000,
        change: 0,
        status: 'completed',
      })
      .returning()

    const [itemA] = await base.db
      .insert(orderItems)
      .values({
        orderId: order!.id,
        productId: productA!.id,
        productName: 'SP CK Đơn A',
        unit: 'cái',
        unitPrice: 100000,
        quantity: 1,
        discountAmount: 0,
        lineTotal: 100000,
      })
      .returning()

    const [itemB] = await base.db
      .insert(orderItems)
      .values({
        orderId: order!.id,
        productId: productB!.id,
        productName: 'SP CK Đơn B',
        unit: 'cái',
        unitPrice: 200000,
        quantity: 1,
        discountAmount: 0,
        lineTotal: 200000,
      })
      .returning()

    // Trả toàn bộ đơn (cả itemA và itemB)
    const returnRes = await ordersApp.request(`/${order!.id}/returns`, {
      method: 'POST',
      headers: { ...base.owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          { orderItemId: itemA!.id, quantity: 1, reason: 'defective' },
          { orderItemId: itemB!.id, quantity: 1, reason: 'defective' },
        ],
      }),
    })
    expect(returnRes.status).toBe(201)
    const { data } = (await returnRes.json()) as {
      data: { refundAmount: number; totalAmount: number }
    }
    // Tổng hoàn phải đúng bằng 250.000đ (orders.total)
    expect(data.totalAmount).toBe(250000)
    expect(data.refundAmount).toBe(250000)
  })

  it('trả làm hai lần (một phần rồi phần còn lại): tổng hoàn 2 lần cộng lại đúng bằng orders.total', async () => {
    const [product] = await base.db
      .insert(products)
      .values({
        storeId: base.storeId,
        name: 'SP 2 Lan',
        sku: 'SKU-2-LAN',
        costPrice: 20000,
        sellingPrice: 50000,
        hasVariants: false,
      })
      .returning()

    const [customer] = await base.db
      .insert(customers)
      .values({
        storeId: base.storeId,
        name: 'KH 2 Lan',
        phone: '0900000555',
        currentDebt: 0,
      })
      .returning()

    // Đơn: 3 cái x 50.000đ = subtotal 150.000đ, CK đơn 50.000đ → Total = 100.000đ
    const [order] = await base.db
      .insert(orders)
      .values({
        storeId: base.storeId,
        orderNumber: 'HD-2-LAN',
        customerId: customer!.id,
        userId: base.owner.id,
        subtotal: 150000,
        discountAmount: 50000,
        total: 100000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 100000,
        change: 0,
        status: 'completed',
      })
      .returning()

    const [item] = await base.db
      .insert(orderItems)
      .values({
        orderId: order!.id,
        productId: product!.id,
        productName: 'SP 2 Lan',
        unit: 'cái',
        unitPrice: 50000,
        quantity: 3,
        discountAmount: 0,
        lineTotal: 150000,
      })
      .returning()

    // Lần 1: Trả 1 cái
    const returnRes1 = await ordersApp.request(`/${order!.id}/returns`, {
      method: 'POST',
      headers: { ...base.owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ orderItemId: item!.id, quantity: 1, reason: 'defective' }],
      }),
    })
    expect(returnRes1.status).toBe(201)
    const { data: data1 } = (await returnRes1.json()) as {
      data: { refundAmount: number; totalAmount: number }
    }

    // Lần 2: Trả nốt 2 cái còn lại
    const returnRes2 = await ordersApp.request(`/${order!.id}/returns`, {
      method: 'POST',
      headers: { ...base.owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ orderItemId: item!.id, quantity: 2, reason: 'defective' }],
      }),
    })
    expect(returnRes2.status).toBe(201)
    const { data: data2 } = (await returnRes2.json()) as {
      data: { refundAmount: number; totalAmount: number }
    }

    // Tổng hoàn của 2 lần cộng lại PHẢI đúng bằng 100.000đ (orders.total)
    expect(data1.totalAmount + data2.totalAmount).toBe(100000)
    expect(data1.refundAmount + data2.refundAmount).toBe(100000)
  })
})

// ============================================================================
// H7: Điều chỉnh nợ phải đồng bộ debts.remaining
// ============================================================================
describe('H7 — Điều chỉnh nợ đồng bộ debts.remaining', () => {
  let base: TestEnv
  let debtApp: ReturnType<typeof createDebtAdjustmentsRoutes>
  let ordersApp: ReturnType<typeof createOrdersRoutes>
  let customerId: string

  beforeEach(async () => {
    base = await createTestEnv()
    debtApp = createDebtAdjustmentsRoutes({ db: base.db })
    ordersApp = createOrdersRoutes({ db: base.db })

    // Khách có nợ 500.000đ từ 1 đơn hàng
    const [customer] = await base.db
      .insert(customers)
      .values({
        storeId: base.storeId,
        name: 'KH H7',
        phone: '0900000777',
        currentDebt: 500000,
      })
      .returning()
    customerId = customer!.id

    const [product] = await base.db
      .insert(products)
      .values({
        storeId: base.storeId,
        name: 'SP H7',
        sku: 'SKU-H7',
        currentStock: 100,
        trackInventory: true,
        unit: 'cái',
        costPrice: 50000,
        sellingPrice: 100000,
        hasVariants: false,
      })
      .returning()

    const [order] = await base.db
      .insert(orders)
      .values({
        storeId: base.storeId,
        orderNumber: 'HD-H7-0001',
        customerId,
        userId: base.owner.id,
        subtotal: 500000,
        discountAmount: 0,
        total: 500000,
        paymentMethod: 'debt',
        paymentStatus: 'unpaid',
        cashAmount: 0,
        change: 0,
        status: 'completed',
      })
      .returning()

    await base.db.insert(orderItems).values({
      orderId: order!.id,
      productId: product!.id,
      productName: 'SP H7',
      unit: 'cái',
      unitPrice: 100000,
      quantity: 5,
      discountAmount: 0,
      lineTotal: 500000,
    })

    await base.db.insert(debts).values({
      storeId: base.storeId,
      orderId: order!.id,
      customerId,
      amount: 500000,
      paid: 0,
      remaining: 500000,
    })
  })

  afterEach(async () => {
    await base.close()
  })

  it('điều chỉnh nợ về 0 → debts.remaining = 0', async () => {
    const res = await debtApp.request('/', {
      method: 'POST',
      headers: { ...base.owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId,
        newAmount: 0,
        reason: 'Xoá nợ xấu',
      }),
    })
    expect(res.status).toBe(201)

    // Kiểm tra debts.remaining = 0
    const debtRows = await base.db
      .select({ remaining: debts.remaining, paid: debts.paid })
      .from(debts)
      .where(eq(debts.customerId, customerId))
    expect(debtRows).toHaveLength(1)
    expect(Number(debtRows[0]!.remaining)).toBe(0)
  })

  it('điều chỉnh nợ giảm 1 phần → debts.remaining giảm tương ứng', async () => {
    const res = await debtApp.request('/', {
      method: 'POST',
      headers: { ...base.owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId,
        newAmount: 200000,
        reason: 'Khách trả tiền mặt ngoài hệ thống',
      }),
    })
    expect(res.status).toBe(201)

    // debts.remaining phải = 200.000đ (từ 500.000 - 300.000 settle)
    const debtRows = await base.db
      .select({ remaining: debts.remaining })
      .from(debts)
      .where(eq(debts.customerId, customerId))
    expect(Number(debtRows[0]!.remaining)).toBe(200000)
  })

  it('điều chỉnh nợ giảm qua nhiều khoản nợ (FIFO)', async () => {
    // Tạo đơn hàng thứ 2 cho khoản nợ thứ 2
    const [order2] = await base.db
      .insert(orders)
      .values({
        storeId: base.storeId,
        orderNumber: 'HD-H7-0002',
        customerId,
        userId: base.owner.id,
        subtotal: 300000,
        discountAmount: 0,
        total: 300000,
        paymentMethod: 'debt',
        paymentStatus: 'unpaid',
        cashAmount: 0,
        change: 0,
        status: 'completed',
        createdAt: new Date(Date.now() + 1000),
      })
      .returning()

    // Thêm khoản nợ thứ 2 (300.000đ)
    await base.db.insert(debts).values({
      storeId: base.storeId,
      orderId: order2!.id,
      customerId,
      amount: 300000,
      paid: 0,
      remaining: 300000,
      createdAt: new Date(Date.now() + 1000), // Mới hơn khoản nợ đầu
    })

    // Cập nhật currentDebt = 800.000đ
    await base.db.update(customers).set({ currentDebt: 800000 }).where(eq(customers.id, customerId))

    // Giảm nợ từ 800k xuống 200k (giảm 600k)
    // Khoản 1 (500k cũ nhất): settle hết 500k → remaining = 0
    // Khoản 2 (300k mới hơn): settle tiếp 100k → remaining = 200k
    const res = await debtApp.request('/', {
      method: 'POST',
      headers: { ...base.owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId,
        newAmount: 200000,
        reason: 'Khách thanh toán 600k tiền mặt',
      }),
    })
    expect(res.status).toBe(201)

    const debtRows = await base.db
      .select({ remaining: debts.remaining, amount: debts.amount })
      .from(debts)
      .where(eq(debts.customerId, customerId))
      .orderBy(debts.createdAt)

    expect(debtRows).toHaveLength(2)
    expect(Number(debtRows[0]!.remaining)).toBe(0)
    expect(Number(debtRows[1]!.remaining)).toBe(200000)
  })

  it('chặn điều chỉnh nợ số âm', async () => {
    const res = await debtApp.request('/', {
      method: 'POST',
      headers: { ...base.owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId,
        newAmount: -100000,
        reason: 'Nợ âm không hợp lệ',
      }),
    })
    expect(res.status).toBe(400)
  })

  it('sau điều chỉnh về 0, trả hàng không làm currentDebt âm', async () => {
    // Điều chỉnh nợ về 0
    await debtApp.request('/', {
      method: 'POST',
      headers: { ...base.owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId,
        newAmount: 0,
        reason: 'Xoá toàn bộ',
      }),
    })

    // Lấy orderId từ debts
    const debtRows = await base.db
      .select({ orderId: debts.orderId })
      .from(debts)
      .where(eq(debts.customerId, customerId))
    const orderId = debtRows[0]!.orderId

    // Trả hàng 1 SP (100.000đ)
    const itemsRes = await ordersApp.request(`/${orderId}/returnable-items`, {
      method: 'GET',
      headers: base.owner.authHeader,
    })
    const { data: items } = (await itemsRes.json()) as {
      data: Array<{ orderItemId: string }>
    }

    const returnRes = await ordersApp.request(`/${orderId}/returns`, {
      method: 'POST',
      headers: { ...base.owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ orderItemId: items[0]!.orderItemId, quantity: 1, reason: 'defective' }],
      }),
    })
    expect(returnRes.status).toBe(201)
    const { data } = (await returnRes.json()) as {
      data: { refundAmount: number; debtReductionAmount: number }
    }

    // Vì debts.remaining đã = 0, nên debtReductionAmount = 0, refundAmount = 100.000đ
    expect(data.debtReductionAmount).toBe(0)
    expect(data.refundAmount).toBe(100000)

    // currentDebt PHẢI = 0, KHÔNG âm
    const [custRow] = await base.db
      .select({ currentDebt: customers.currentDebt })
      .from(customers)
      .where(eq(customers.id, customerId))
    expect(Number(custRow!.currentDebt)).toBeGreaterThanOrEqual(0)
  })
})

// ============================================================================
// H11: Báo cáo không lệch 7 giờ
// ============================================================================
describe('H11 — parseDateRangeLocal dùng đúng múi giờ', () => {
  it('parseDateRangeLocal tạo ngày theo offset +07:00 thay vì Z', async () => {
    // Import trực tiếp module timezone
    const { parseDateRangeLocal } = await import('../lib/timezone.js')

    const { start, end } = parseDateRangeLocal('2026-06-11', '2026-06-11')

    // start phải = 2026-06-11T00:00:00+07:00 = 2026-06-10T17:00:00Z
    expect(start.toISOString()).toBe('2026-06-10T17:00:00.000Z')
    // end phải = 2026-06-11T23:59:59.999+07:00 = 2026-06-11T16:59:59.999Z
    expect(end.toISOString()).toBe('2026-06-11T16:59:59.999Z')
  })

  it('đơn hàng tạo lúc 01:00 sáng VN thuộc đúng ngày báo cáo', async () => {
    const base = await createTestEnv()
    try {
      // Tạo đơn hàng với createdAt = 2026-06-11T01:00:00+07:00
      // Tức 2026-06-10T18:00:00Z (UTC)
      const [product] = await base.db
        .insert(products)
        .values({
          storeId: base.storeId,
          name: 'SP H11',
          sku: 'SKU-H11',
          currentStock: 100,
          trackInventory: false,
          unit: 'cái',
          costPrice: 50000,
          sellingPrice: 100000,
          hasVariants: false,
        })
        .returning()

      const earlyMorningVN = new Date('2026-06-11T01:00:00+07:00') // 18:00 UTC ngày 10

      const [order] = await base.db
        .insert(orders)
        .values({
          storeId: base.storeId,
          orderNumber: 'HD-H11-0001',
          userId: base.owner.id,
          subtotal: 100000,
          discountAmount: 0,
          total: 100000,
          paymentMethod: 'cash',
          paymentStatus: 'paid',
          cashAmount: 100000,
          change: 0,
          status: 'completed',
          createdAt: earlyMorningVN,
        })
        .returning()

      await base.db.insert(orderItems).values({
        orderId: order!.id,
        productId: product!.id,
        productName: 'SP H11',
        unit: 'cái',
        unitPrice: 100000,
        quantity: 1,
        discountAmount: 0,
        lineTotal: 100000,
      })

      // Import revenue report service
      const { getRevenueByTime } = await import('../services/revenue-report.service.js')

      // Báo cáo cho ngày 2026-06-11 phải bao gồm đơn này
      const report = await getRevenueByTime(
        base.db,
        base.storeId,
        '2026-06-11',
        '2026-06-11',
        'day',
      )
      expect(report.summary.totalRevenue).toBe(100000)
      expect(report.summary.totalOrders).toBe(1)

      // Báo cáo cho ngày 2026-06-10 phải KHÔNG bao gồm đơn này
      const reportPrev = await getRevenueByTime(
        base.db,
        base.storeId,
        '2026-06-10',
        '2026-06-10',
        'day',
      )
      expect(reportPrev.summary.totalRevenue).toBe(0)
      expect(reportPrev.summary.totalOrders).toBe(0)
    } finally {
      await base.close()
    }
  })
})

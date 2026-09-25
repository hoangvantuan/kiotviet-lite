/**
 * Đợt 3, luồng báo cáo: R7 (mốc ngày theo múi giờ cửa hàng) và các mã BC.
 *
 * Tiến trình chạy TZ=UTC như máy chủ production (Docker), đặt chung cho mọi test API ở
 * vitest.workspace.ts. Trên máy phát triển giờ +07, các lỗi
 * startOfDay, getHours, toISOString().slice(0, 10) không lộ ra nếu không ép múi giờ này.
 */

import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  customers,
  type DashboardResponse,
  debts,
  orderItems,
  orders,
  products,
  productVariants,
  receipts,
} from '@kiotviet-lite/shared'

import { errorHandler } from '../middleware/error-handler.js'
import { createReportsRoutes } from '../routes/reports.routes.js'
import { createUsersRoutes } from '../routes/users.routes.js'
import {
  getLowStockCount,
  listLowStockProducts,
} from '../services/inventory-transactions.service.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

interface Env {
  base: TestEnv
  app: Hono
}

async function setup(): Promise<Env> {
  const base = await createTestEnv()
  const app = new Hono()
  app.onError(errorHandler)
  app.route('/api/v1/reports', createReportsRoutes({ db: base.db }))
  app.route('/api/v1/users', createUsersRoutes({ db: base.db }))
  return { base, app }
}

async function getJson<T>(env: Env, path: string): Promise<T> {
  const res = await env.app.request(path, { headers: env.base.owner.authHeader })
  expect(res.status).toBe(200)
  return ((await res.json()) as { data: T }).data
}

async function getText(env: Env, path: string): Promise<string> {
  const res = await env.app.request(path, { headers: env.base.owner.authHeader })
  expect(res.status).toBe(200)
  return res.text()
}

let seq = 0
async function insertOrder(env: Env, createdAt: string, total: number) {
  seq += 1
  const [row] = await env.base.db
    .insert(orders)
    .values({
      storeId: env.base.storeId,
      orderNumber: `R7-${seq}`,
      subtotal: total,
      discountAmount: 0,
      total,
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      status: 'completed',
      userId: env.base.owner.id,
      createdAt: new Date(createdAt),
    })
    .returning()
  return row!
}

describe('R7 / BC-02: tổng quan cắt kỳ theo lịch cửa hàng khi máy chủ chạy TZ=UTC', () => {
  let env: Env
  beforeEach(async () => {
    // Bây giờ: 07:30 sáng 26/09 giờ VN, tức 00:30 UTC. Nửa đêm UTC là 07:00 giờ VN.
    // Đặt trước khi ký token để token không hết hạn theo đồng hồ giả.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-26T07:30:00+07:00'))
    env = await setup()
    // Bước tái hiện gốc (w5 BC-02): T1 01:30, T2 06:50 ngày 26/09 giờ VN; T3 23:30 ngày 25/09;
    // T4 03:00 ngày 01/09; T5 23:00 ngày 31/08.
    await insertOrder(env, '2026-09-26T01:30:00+07:00', 12_000)
    await insertOrder(env, '2026-09-26T06:50:00+07:00', 24_000)
    await insertOrder(env, '2026-09-25T23:30:00+07:00', 18_000)
    await insertOrder(env, '2026-09-01T03:00:00+07:00', 15_000)
    await insertOrder(env, '2026-08-31T23:00:00+07:00', 25_000)
  })
  afterEach(async () => {
    vi.useRealTimers()
    await env.base.close()
  })

  it('thẻ "Hôm nay" gồm đơn 00:00 đến 07:00, khớp cột hôm nay của biểu đồ và báo cáo doanh thu', async () => {
    const dash = await getJson<DashboardResponse>(env, '/api/v1/reports/dashboard?period=today')
    expect(dash.metrics.orderCount.value).toBe(2)
    expect(dash.metrics.revenue.value).toBe(36_000)

    const todayBar = dash.revenueChart.at(-1)!
    expect(todayBar.date).toBe('2026-09-26')
    expect(todayBar.orderCount).toBe(dash.metrics.orderCount.value)
    expect(todayBar.revenue).toBe(dash.metrics.revenue.value)
    expect(dash.metrics.revenue.sparkline.at(-1)).toBe(36_000)

    const rev = await getJson<{ summary: { totalOrders: number; totalRevenue: number } }>(
      env,
      '/api/v1/reports/revenue?tab=time&from=2026-09-26&to=2026-09-26&groupBy=day',
    )
    expect(rev.summary.totalOrders).toBe(dash.metrics.orderCount.value)
    expect(rev.summary.totalRevenue).toBe(dash.metrics.revenue.value)
  })

  it('thẻ "Tháng" gồm đơn 03:00 ngày 01/09, không gồm đơn 23:00 ngày 31/08', async () => {
    const dash = await getJson<DashboardResponse>(env, '/api/v1/reports/dashboard?period=month')
    expect(dash.metrics.orderCount.value).toBe(4)
    expect(dash.metrics.revenue.value).toBe(69_000)
    // Kỳ trước: 01/08 đến cùng thời điểm ngày 26/08, đơn 31/08 không thuộc
    expect(dash.metrics.orderCount.previousValue).toBe(0)

    const rev = await getJson<{ summary: { totalOrders: number; totalRevenue: number } }>(
      env,
      '/api/v1/reports/revenue?tab=time&from=2026-09-01&to=2026-09-30&groupBy=day',
    )
    expect(rev.summary.totalOrders).toBe(4)
    expect(rev.summary.totalRevenue).toBe(69_000)
  })

  it('thẻ "Tuần" bắt đầu thứ Hai 21/09 00:00 giờ VN; kỳ "Hôm nay" trước là hôm qua', async () => {
    const week = await getJson<DashboardResponse>(env, '/api/v1/reports/dashboard?period=week')
    expect(week.metrics.orderCount.value).toBe(3)
    const today = await getJson<DashboardResponse>(env, '/api/v1/reports/dashboard?period=today')
    // Hôm qua từ 00:00 tới 07:30 ngày 25/09: T3 lúc 23:30 chưa tới
    expect(today.metrics.orderCount.previousValue).toBe(0)
  })
})

describe('BC-11: tồn kho tính theo biến thể; UAT 04 mục 4.3: dòng tổng', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
    // Tồn cha lệch tổng biến thể (dữ liệu seed ST001: cha 80, biến thể 100)
    const [shirt] = await env.base.db
      .insert(products)
      .values({
        storeId: env.base.storeId,
        name: 'Áo thun',
        sku: 'ST001',
        sellingPrice: 150_000,
        costPrice: 70_000,
        currentStock: 80,
        minStock: 120,
        trackInventory: true,
        hasVariants: true,
      })
      .returning()
    await env.base.db.insert(productVariants).values([
      {
        storeId: env.base.storeId,
        productId: shirt!.id,
        sku: 'ST001-M',
        attribute1Name: 'Size',
        attribute1Value: 'M',
        stockQuantity: 60,
        costPrice: 80_000,
      },
      {
        storeId: env.base.storeId,
        productId: shirt!.id,
        sku: 'ST001-L',
        attribute1Name: 'Size',
        attribute1Value: 'L',
        stockQuantity: 40,
        costPrice: null,
      },
    ])
    await env.base.db.insert(products).values({
      storeId: env.base.storeId,
      name: 'Nước suối',
      sku: 'NS001',
      sellingPrice: 5_000,
      costPrice: 3_000,
      currentStock: 10,
      minStock: 0,
      trackInventory: true,
    })
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('báo cáo tồn hiện tại: tồn và giá trị theo biến thể, có tổng số lượng và tổng giá trị', async () => {
    const data = await getJson<{
      rows: Array<{ sku: string; currentStock: number; stockValue: number }>
      summary: { totalProducts: number; totalQuantity: number; totalStockValue: number }
    }>(env, '/api/v1/reports/inventory?tab=current')
    const shirt = data.rows.find((r) => r.sku === 'ST001')!
    expect(shirt.currentStock).toBe(100)
    // 60 × 80.000 + 40 × 70.000 (biến thể L lấy giá vốn cha)
    expect(shirt.stockValue).toBe(7_600_000)
    expect(data.summary.totalQuantity).toBe(110)
    expect(data.summary.totalStockValue).toBe(7_630_000)
  })

  it('cần nhập và cảnh báo tổng quan dùng cùng tồn hiệu lực', async () => {
    const reorder = await getJson<{
      rows: Array<{ sku: string; currentStock: number; reorderQuantity: number }>
    }>(env, '/api/v1/reports/inventory?tab=reorder')
    const shirt = reorder.rows.find((r) => r.sku === 'ST001')!
    expect(shirt.currentStock).toBe(100)
    expect(shirt.reorderQuantity).toBe(20)

    const dash = await getJson<DashboardResponse>(env, '/api/v1/reports/dashboard?period=today')
    const alert = dash.lowStockAlerts.find((a) => a.name === 'Áo thun')!
    expect(alert.currentStock).toBe(100)
  })
  it('chuông, cảnh báo tổng quan và cần nhập cùng một danh sách: bỏ sản phẩm không theo dõi tồn', async () => {
    await env.base.db.insert(products).values({
      storeId: env.base.storeId,
      name: 'Túi nilon',
      sku: 'TN001',
      sellingPrice: 0,
      costPrice: 0,
      currentStock: 0,
      minStock: 5,
      trackInventory: false,
    })
    const reorder = await getJson<{ rows: Array<{ sku: string }> }>(
      env,
      '/api/v1/reports/inventory?tab=reorder',
    )
    const dash = await getJson<DashboardResponse>(env, '/api/v1/reports/dashboard?period=today')
    const bell = await getLowStockCount({ db: env.base.db, storeId: env.base.storeId })
    const bellList = await listLowStockProducts({ db: env.base.db, storeId: env.base.storeId })

    expect(reorder.rows.map((r) => r.sku)).toEqual(['ST001'])
    expect(dash.lowStockAlerts.map((a) => a.name)).toEqual(['Áo thun'])
    expect(bell).toBe(1)
    expect(bellList.items.map((i) => i.sku)).toEqual(['ST001'])
  })
})

describe('BC-17: top sản phẩm trên tổng quan xếp theo doanh thu', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('1 thùng 1.900.000 đứng trên 5 gói mì 20.000', async () => {
    const [omo] = await env.base.db
      .insert(products)
      .values({ storeId: env.base.storeId, name: 'Bột giặt Omo', sku: 'BO001', sellingPrice: 1 })
      .returning()
    const [mi] = await env.base.db
      .insert(products)
      .values({ storeId: env.base.storeId, name: 'Mì gói', sku: 'MI001', sellingPrice: 1 })
      .returning()
    const now = new Date().toISOString()
    const o1 = await insertOrder(env, now, 1_900_000)
    const o2 = await insertOrder(env, now, 20_000)
    await env.base.db.insert(orderItems).values([
      {
        orderId: o1.id,
        productId: omo!.id,
        productName: 'Bột giặt Omo',
        quantity: 1,
        unitPrice: 1_900_000,
        lineTotal: 1_900_000,
      },
      {
        orderId: o2.id,
        productId: mi!.id,
        productName: 'Mì gói',
        quantity: 5,
        unitPrice: 4_000,
        lineTotal: 20_000,
      },
    ])
    const dash = await getJson<DashboardResponse>(env, '/api/v1/reports/dashboard?period=today')
    expect(dash.topProducts.map((p) => p.name)).toEqual(['Bột giặt Omo', 'Mì gói'])
  })
})

describe('Công nợ: TIEN-112 tuổi nợ theo ngày lịch, BC-14 tổng hợp nhận YYYY-MM-DD, BC-12 CSV', () => {
  let env: Env
  let customerId: string
  beforeEach(async () => {
    env = await setup()
    const [c] = await env.base.db
      .insert(customers)
      .values({
        storeId: env.base.storeId,
        name: "=cmd|' /C calc'!A0",
        code: 'KH000001',
        phone: '0911000003',
        currentDebt: 270_000,
        debtLimit: 1_000_000,
      })
      .returning()
    customerId = c!.id
  })
  afterEach(async () => {
    await env.base.close()
  })

  function todayKey(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())
  }

  it('TIEN-112: nợ phát sinh 23:30 ngày lịch cách đây 31 ngày thuộc nhóm 31-60, không phải 0-30', async () => {
    // 23:30 giờ VN của ngày (hôm nay − 31). Tính theo 24 giờ trôi qua thì chưa đủ 31 ngày.
    const startToday = new Date(`${todayKey()}T00:00:00+07:00`)
    const createdAt = new Date(startToday.getTime() - 30 * 86_400_000 - 30 * 60_000)
    await env.base.db.insert(debts).values({
      storeId: env.base.storeId,
      customerId,
      amount: 270_000,
      remaining: 270_000,
      createdAt,
    })
    const aging = await getJson<{
      rows: Array<{ buckets: number[] }>
      bucketLabels: string[]
    }>(env, '/api/v1/reports/debt-aging')
    expect(aging.bucketLabels[1]).toBe('31-60 ngày')
    expect(aging.rows[0]!.buckets).toEqual([0, 270_000, 0, 0])
  })

  it('BC-14: debt-summary from=to=hôm nay (YYYY-MM-DD) đếm phiếu thu trong ngày giờ VN', async () => {
    const day = todayKey()
    await env.base.db.insert(receipts).values({
      storeId: env.base.storeId,
      customerId,
      amount: 30_000,
      createdBy: env.base.owner.id,
      createdAt: new Date(`${day}T10:00:00+07:00`),
    })
    const summary = await getJson<{ receivable: { totalCollected: number } }>(
      env,
      `/api/v1/reports/debt-summary?from=${day}&to=${day}`,
    )
    expect(summary.receivable.totalCollected).toBe(30_000)
  })

  it('BC-12: CSV tuổi nợ giữ số 0 đầu SĐT, chặn công thức, tiền là số', async () => {
    await env.base.db.insert(debts).values({
      storeId: env.base.storeId,
      customerId,
      amount: 270_000,
      remaining: 270_000,
    })
    const csv = await getText(env, '/api/v1/reports/debt-aging/csv')
    const line = csv.split('\n')[1]!
    expect(line).toBe(`'=cmd|' /C calc'!A0,"=""0911000003""",1000000,270000,270000,0,0,0`)
    expect(csv).not.toContain('270.000')

    const summaryCsv = await getText(env, '/api/v1/reports/debt-summary/csv')
    expect(summaryCsv).toContain('Tổng nợ phải thu,270000')
  })

  it('BC-12: CSV doanh thu theo khách dùng cùng helper', async () => {
    const [o] = await env.base.db
      .insert(orders)
      .values({
        storeId: env.base.storeId,
        orderNumber: 'CSV-1',
        subtotal: 50_000,
        discountAmount: 0,
        total: 50_000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        status: 'completed',
        userId: env.base.owner.id,
        customerId,
      })
      .returning()
    expect(o).toBeDefined()
    const day = todayKey()
    const csv = await getText(
      env,
      `/api/v1/reports/revenue/export?tab=customer&format=csv&from=${day}&to=${day}`,
    )
    expect(csv).toContain(`'=cmd|' /C calc'!A0,"=""0911000003""",1,50000,`)
  })
})

describe('POS-10: giờ mở khóa PIN theo giờ cửa hàng, PIN sai có lý do riêng', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  async function wrongPin() {
    return env.app.request('/api/v1/users/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...env.base.staff.authHeader },
      body: JSON.stringify({ pin: '000000' }),
    })
  }

  it('PIN sai trả 401 kèm reason pin_invalid để máy khách không gửi lại', async () => {
    const res = await wrongPin()
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: { details: { reason: string; remaining: number } } }
    expect(body.error.details).toEqual({ remaining: 4, reason: 'pin_invalid' })
  })

  it('sau 5 lần sai, thông báo khóa ghi giờ Việt Nam, không phải giờ UTC', async () => {
    let res: Response | undefined
    for (let i = 0; i < 5; i++) res = await wrongPin()
    expect(res!.status).toBe(423)
    const body = (await res!.json()) as {
      error: { message: string; details: { lockedUntil: string } }
    }
    const expected = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(body.error.details.lockedUntil))
    expect(body.error.message).toContain(`khoá PIN đến ${expected}`)
  })
})

import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  type CashFlowReport,
  cashShifts,
  type CreateOrderInput,
  orderItems,
  orderReturns,
  orders,
  receipts,
  type ShiftDetail,
  stores,
  suppliers,
} from '@kiotviet-lite/shared'

import { createCashReportsRoutes } from '../routes/cash-reports.routes.js'
import { createOrdersRoutes } from '../routes/orders.routes.js'
import { createPosRoutes } from '../routes/pos.routes.js'
import { createReceiptsRoutes } from '../routes/receipts.routes.js'
import { createShiftsRoutes } from '../routes/shifts.routes.js'
import { createSupplierPaymentsRoutes } from '../routes/supplier-payments.routes.js'
import { formatDateForCode } from '../services/document-codes.service.js'
import { createOrder } from '../services/orders.service.js'
import { createCustomer, createProduct } from './helpers/factories.js'
import { createTestEnv, type SeededUser, type TestEnv } from './helpers/test-env.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

interface App {
  request: (path: string, init?: RequestInit) => Response | Promise<Response>
}

let env: TestEnv
let apps: {
  pos: App
  orders: App
  receipts: App
  shifts: App
  supplierPayments: App
  cashReports: App
}

beforeEach(async () => {
  env = await createTestEnv()
  apps = {
    pos: createPosRoutes({ db: env.db }),
    orders: createOrdersRoutes({ db: env.db }),
    receipts: createReceiptsRoutes({ db: env.db }),
    shifts: createShiftsRoutes({ db: env.db }),
    supplierPayments: createSupplierPaymentsRoutes({ db: env.db }),
    cashReports: createCashReportsRoutes({ db: env.db }),
  }
})

afterEach(async () => {
  await env.close()
})

async function call<T = unknown>(
  app: App,
  method: 'GET' | 'POST',
  path: string,
  user: SeededUser,
  body?: unknown,
): Promise<{ status: number; body: T }> {
  const res = await app.request(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...user.authHeader,
      ...(method === 'POST' ? { 'Idempotency-Key': randomUUID() } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: res.status, body: (await res.json()) as T }
}

interface SaleLine {
  product: { id: string; name: string }
  price: number
  quantity: number
  lineDiscount?: number
}

interface SaleOptions {
  paymentMethod: CreateOrderInput['paymentMethod']
  lines: SaleLine[]
  orderDiscount?: number
  cashAmount?: number
  transferAmount?: number
  customerId?: string
  debtAmount?: number
}

function orderInput(opts: SaleOptions): CreateOrderInput {
  const items = opts.lines.map((l) => {
    const discount = l.lineDiscount ?? 0
    return {
      productId: l.product.id,
      variantId: null,
      productName: l.product.name,
      variantName: null,
      unit: 'cái',
      unitPrice: l.price,
      quantity: l.quantity,
      discountType: discount > 0 ? ('amount' as const) : null,
      discountValue: discount,
      discountAmount: discount,
      lineTotal: l.price * l.quantity - discount,
      note: null,
      unitConversionId: null,
      originalPrice: null,
      priceOverride: false,
      priceOverrideReason: null,
      priceOverridePinUsed: false,
    }
  })
  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0)
  const orderDiscount = opts.orderDiscount ?? 0
  const total = subtotal - orderDiscount
  return {
    customerId: opts.customerId ?? null,
    subtotal,
    discountType: orderDiscount > 0 ? 'amount' : null,
    discountValue: orderDiscount,
    discountAmount: orderDiscount,
    total,
    paymentMethod: opts.paymentMethod,
    paymentStatus:
      opts.paymentMethod !== 'debt'
        ? 'paid'
        : (opts.debtAmount ?? total) === total
          ? 'unpaid'
          : 'partial',
    ...(opts.cashAmount !== undefined
      ? { cashAmount: opts.cashAmount }
      : opts.paymentMethod === 'cash'
        ? { cashAmount: total }
        : {}),
    ...(opts.transferAmount !== undefined ? { transferAmount: opts.transferAmount } : {}),
    ...(opts.debtAmount !== undefined ? { debtAmount: opts.debtAmount } : {}),
    debtLimitOverridden: false,
    note: null,
    items,
  } as CreateOrderInput
}

async function sell(user: SeededUser, opts: SaleOptions) {
  const res = await call<{ data: { id: string; total: number } }>(
    apps.pos,
    'POST',
    '/orders',
    user,
    orderInput(opts),
  )
  expect(res.status, JSON.stringify(res.body)).toBe(201)
  return res.body.data
}

async function orderItemIds(orderId: string) {
  const rows = await env.db
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
  return rows.map((r) => r.id)
}

async function returnAll(user: SeededUser, orderId: string, refundMethod?: string) {
  const ids = await orderItemIds(orderId)
  const res = await call<{
    data: { id: string; refundMethod: string | null; refundAmount: number }
  }>(apps.orders, 'POST', `/${orderId}/returns`, user, {
    items: [{ orderItemId: ids[0]!, quantity: 1, reason: 'defective' }],
    note: null,
    ...(refundMethod ? { refundMethod } : {}),
  })
  expect(res.status, JSON.stringify(res.body)).toBe(201)
  return res.body.data
}

/** Khách đang nợ `amount` qua một đơn ghi nợ; trả về khách và id khoản nợ. */
async function customerWithDebt(amount: number) {
  const product = await createProduct(env, { sellingPrice: amount, currentStock: 10 })
  const customer = await createCustomer(env, { debtLimit: 10_000_000 })
  await sell(env.owner, {
    paymentMethod: 'debt',
    customerId: customer.id,
    debtAmount: amount,
    lines: [{ product, price: amount, quantity: 1 }],
  })
  const debts = await call<{ data: { items: Array<{ id: string }> } }>(
    apps.receipts,
    'GET',
    `/customer-debts/${customer.id}`,
    env.owner,
  )
  return { customer, debtId: debts.body.data.items[0]!.id }
}

async function postReceipt(
  user: SeededUser,
  customerId: string,
  debtId: string,
  amount: number,
  paymentMethod?: string,
) {
  return call<{ data: { id: string; code: string; paymentMethod: string | null } }>(
    apps.receipts,
    'POST',
    '/',
    user,
    {
      customerId,
      amount,
      ...(paymentMethod ? { paymentMethod } : {}),
      allocationMode: 'manual',
      allocations: [{ debtId, amount }],
    },
  )
}

async function enableShifts() {
  await env.db.update(stores).set({ shiftsEnabled: true }).where(eq(stores.id, env.storeId))
}

async function openShift(user: SeededUser, openingCash: number) {
  const res = await call<{ data: ShiftDetail }>(apps.shifts, 'POST', '/open', user, {
    openingCash,
  })
  expect(res.status, JSON.stringify(res.body)).toBe(201)
  return res.body.data
}

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())
}

// ---------------------------------------------------------------------------

describe('TIEN-05, TIEN-109: phiếu thu lưu phương thức nhận tiền và có mã PT', () => {
  it('lưu và trả phương thức, mã PT-yymmdd-nnnn tăng dần, tìm được theo mã', async () => {
    const { customer, debtId } = await customerWithDebt(300_000)

    const first = await postReceipt(env.owner, customer.id, debtId, 100_000, 'transfer')
    expect(first.status, JSON.stringify(first.body)).toBe(201)
    const prefix = `PT-${formatDateForCode(new Date()).slice(2)}-`
    expect(first.body.data).toMatchObject({ paymentMethod: 'transfer', code: `${prefix}0001` })

    const second = await postReceipt(env.owner, customer.id, debtId, 50_000, 'qr')
    expect(second.body.data).toMatchObject({ paymentMethod: 'qr', code: `${prefix}0002` })

    const [saved] = await env.db.select().from(receipts).where(eq(receipts.id, first.body.data.id))
    expect(saved).toMatchObject({ paymentMethod: 'transfer', code: `${prefix}0001` })

    const list = await call<{ data: Array<{ code: string; paymentMethod: string }> }>(
      apps.receipts,
      'GET',
      `/?search=${encodeURIComponent(`${prefix}0002`)}`,
      env.owner,
    )
    expect(list.body.data).toEqual([
      expect.objectContaining({ code: `${prefix}0002`, paymentMethod: 'qr' }),
    ])

    const detail = await call<{ data: { code: string; paymentMethod: string } }>(
      apps.receipts,
      'GET',
      `/${first.body.data.id}`,
      env.owner,
    )
    expect(detail.body.data).toMatchObject({ code: `${prefix}0001`, paymentMethod: 'transfer' })
  })

  it('thiếu phương thức nhận tiền thì 400, không tạo phiếu', async () => {
    const { customer, debtId } = await customerWithDebt(100_000)
    const res = await postReceipt(env.owner, customer.id, debtId, 100_000)
    expect(res.status).toBe(400)
    expect(await env.db.select().from(receipts)).toHaveLength(0)
  })

  it('phương thức "Ghi nợ" không phải kênh nhận tiền: 400', async () => {
    const { customer, debtId } = await customerWithDebt(100_000)
    const res = await postReceipt(env.owner, customer.id, debtId, 100_000, 'debt')
    expect(res.status).toBe(400)
  })
})

describe('TIEN-02: phiếu trả lưu phương thức hoàn tiền', () => {
  it('mặc định theo đơn gốc: đơn chuyển khoản hoàn chuyển khoản, đơn tiền mặt hoàn tiền mặt', async () => {
    const product = await createProduct(env, { sellingPrice: 50_000, currentStock: 10 })
    const transferOrder = await sell(env.owner, {
      paymentMethod: 'transfer',
      lines: [{ product, price: 50_000, quantity: 2 }],
    })
    const cashOrder = await sell(env.owner, {
      paymentMethod: 'cash',
      cashAmount: 100_000,
      lines: [{ product, price: 50_000, quantity: 2 }],
    })

    const r1 = await returnAll(env.owner, transferOrder.id)
    expect(r1).toMatchObject({ refundAmount: 50_000, refundMethod: 'transfer' })
    const r2 = await returnAll(env.owner, cashOrder.id)
    expect(r2).toMatchObject({ refundAmount: 50_000, refundMethod: 'cash' })

    const [saved] = await env.db.select().from(orderReturns).where(eq(orderReturns.id, r1.id))
    expect(saved!.refundMethod).toBe('transfer')

    const list = await call<{ data: Array<{ refundMethod: string | null }> }>(
      apps.orders,
      'GET',
      `/${transferOrder.id}/returns`,
      env.owner,
    )
    expect(list.body.data[0]!.refundMethod).toBe('transfer')
  })

  it('mặc định hoàn theo kênh chiếm phần lớn; đơn QR hoàn chuyển khoản (MINOR 1, 8)', async () => {
    const product = await createProduct(env, { sellingPrice: 50_000, currentStock: 20 })
    // Kết hợp 30k tiền mặt + 70k chuyển khoản: chuyển khoản chiếm phần lớn
    const combinedOrder = await sell(env.owner, {
      paymentMethod: 'combined',
      cashAmount: 30_000,
      transferAmount: 70_000,
      lines: [{ product, price: 50_000, quantity: 2 }],
    })
    expect((await returnAll(env.owner, combinedOrder.id)).refundMethod).toBe('transfer')
    const qrOrder = await sell(env.owner, {
      paymentMethod: 'qr',
      lines: [{ product, price: 50_000, quantity: 2 }],
    })
    expect((await returnAll(env.owner, qrOrder.id)).refundMethod).toBe('transfer')
  })

  it('người trả hàng chọn phương thức khác thì lưu đúng lựa chọn', async () => {
    const product = await createProduct(env, { sellingPrice: 50_000, currentStock: 10 })
    const order = await sell(env.owner, {
      paymentMethod: 'transfer',
      lines: [{ product, price: 50_000, quantity: 2 }],
    })
    const ret = await returnAll(env.owner, order.id, 'cash')
    expect(ret.refundMethod).toBe('cash')
  })

  it('trả hàng chỉ cấn nợ (không hoàn tiền) thì phương thức hoàn để trống', async () => {
    const product = await createProduct(env, { sellingPrice: 50_000, currentStock: 10 })
    const customer = await createCustomer(env, { debtLimit: 10_000_000 })
    const order = await sell(env.owner, {
      paymentMethod: 'debt',
      customerId: customer.id,
      debtAmount: 100_000,
      lines: [{ product, price: 50_000, quantity: 2 }],
    })
    const ret = await returnAll(env.owner, order.id, 'cash')
    expect(ret).toMatchObject({ refundAmount: 0, refundMethod: null })
  })
})

describe('POS-06: ca bán hàng', () => {
  it('cửa hàng bật dùng ca: POS chặn bán khi chưa mở ca, mở ca rồi đơn gắn vào ca', async () => {
    await enableShifts()
    const product = await createProduct(env, { sellingPrice: 20_000, currentStock: 10 })

    const blocked = await call<{ error: { code: string; details: { reason: string } } }>(
      apps.pos,
      'POST',
      '/orders',
      env.staff,
      orderInput({ paymentMethod: 'cash', lines: [{ product, price: 20_000, quantity: 1 }] }),
    )
    expect(blocked.status).toBe(422)
    expect(blocked.body.error.details.reason).toBe('shift_required')
    expect(await env.db.select().from(orders)).toHaveLength(0)

    const current = await call<{ data: { shiftsEnabled: boolean; shift: null } }>(
      apps.shifts,
      'GET',
      '/current',
      env.staff,
    )
    expect(current.body.data).toEqual({ shiftsEnabled: true, shift: null })

    const shift = await openShift(env.staff, 200_000)
    const order = await sell(env.staff, {
      paymentMethod: 'cash',
      lines: [{ product, price: 20_000, quantity: 1 }],
    })
    const [saved] = await env.db.select().from(orders).where(eq(orders.id, order.id))
    expect(saved!.shiftId).toBe(shift.id)
  })

  it('không bật dùng ca: bán bình thường, đơn không gắn ca', async () => {
    const product = await createProduct(env, { sellingPrice: 20_000, currentStock: 10 })
    const order = await sell(env.staff, {
      paymentMethod: 'cash',
      lines: [{ product, price: 20_000, quantity: 1 }],
    })
    const [saved] = await env.db.select().from(orders).where(eq(orders.id, order.id))
    expect(saved!.shiftId).toBeNull()
  })

  it('mỗi người bán tối đa một ca mở; người khác vẫn mở ca riêng được', async () => {
    await openShift(env.staff, 100_000)
    const again = await call<{ error: { details: { reason: string } } }>(
      apps.shifts,
      'POST',
      '/open',
      env.staff,
      { openingCash: 0 },
    )
    expect(again.status).toBe(409)
    expect(again.body.error.details.reason).toBe('shift_already_open')
    await openShift(env.manager, 0)
    expect(await env.db.select().from(cashShifts)).toHaveLength(2)
  })

  it('đóng ca: phải có = đầu ca + thu tiền mặt - hoàn và chi tiền mặt; chênh lệch so với thực đếm', async () => {
    await enableShifts()
    const product = await createProduct(env, { sellingPrice: 50_000, currentStock: 50 })
    const shift = await openShift(env.owner, 500_000)

    // Tiền mặt: khách đưa 200k cho đơn 100k, thối 100k, ngăn kéo giữ 100k
    const cashOrder = await sell(env.owner, {
      paymentMethod: 'cash',
      cashAmount: 200_000,
      lines: [{ product, price: 50_000, quantity: 2 }],
    })
    // Kết hợp: đơn 150k, khách đưa 100k tiền mặt + chuyển 60k, thối 10k: ngăn kéo giữ 90k
    await sell(env.owner, {
      paymentMethod: 'combined',
      cashAmount: 100_000,
      transferAmount: 60_000,
      lines: [{ product, price: 50_000, quantity: 3 }],
    })
    // Chuyển khoản và QR không vào ngăn kéo
    await sell(env.owner, {
      paymentMethod: 'transfer',
      lines: [{ product, price: 50_000, quantity: 1 }],
    })
    await sell(env.owner, { paymentMethod: 'qr', lines: [{ product, price: 50_000, quantity: 1 }] })
    // Ghi nợ trả trước 20k tiền mặt
    const customer = await createCustomer(env, { debtLimit: 10_000_000 })
    await sell(env.owner, {
      paymentMethod: 'debt',
      customerId: customer.id,
      cashAmount: 20_000,
      debtAmount: 30_000,
      lines: [{ product, price: 50_000, quantity: 1 }],
    })
    // Thu nợ tiền mặt 10k
    const debts = await call<{ data: { items: Array<{ id: string }> } }>(
      apps.receipts,
      'GET',
      `/customer-debts/${customer.id}`,
      env.owner,
    )
    const receipt = await postReceipt(
      env.owner,
      customer.id,
      debts.body.data.items[0]!.id,
      10_000,
      'cash',
    )
    expect(receipt.status).toBe(201)
    // Hoàn tiền mặt 50k cho một món của đơn tiền mặt
    await returnAll(env.owner, cashOrder.id)
    // Chi trả nhà cung cấp 30k tiền mặt
    const [supplier] = await env.db
      .insert(suppliers)
      .values({ storeId: env.storeId, code: 'NCC-D3', name: 'NCC', currentDebt: 100_000 })
      .returning()
    const pay = await call(apps.supplierPayments, 'POST', '/', env.owner, {
      supplierId: supplier!.id,
      amount: 30_000,
      paymentMethod: 'cash',
    })
    expect(pay.status, JSON.stringify(pay.body)).toBe(201)

    const expected = 500_000 + 100_000 + 90_000 + 20_000 + 10_000 - 50_000 - 30_000
    const current = await call<{ data: { shift: ShiftDetail } }>(
      apps.shifts,
      'GET',
      '/current',
      env.owner,
    )
    expect(current.body.data.shift.summary).toMatchObject({
      openingCash: 500_000,
      cashSales: 210_000,
      cashReceipts: 10_000,
      cashRefunds: 50_000,
      cashSupplierPayments: 30_000,
      expectedCash: expected,
      transferIn: 110_000,
      qrIn: 50_000,
      debtSales: 30_000,
      orderCount: 5,
      receiptCount: 1,
      returnCount: 1,
      supplierPaymentCount: 1,
    })

    const closed = await call<{ data: ShiftDetail }>(
      apps.shifts,
      'POST',
      `/${shift.id}/close`,
      env.owner,
      { countedCash: expected - 5_000, note: 'Thiếu 5k' },
    )
    expect(closed.status, JSON.stringify(closed.body)).toBe(200)
    expect(closed.body.data).toMatchObject({
      status: 'closed',
      expectedCash: expected,
      countedCash: expected - 5_000,
      difference: -5_000,
    })
    expect(closed.body.data.closeSummary).toEqual(closed.body.data.summary)

    const again = await call(apps.shifts, 'POST', `/${shift.id}/close`, env.owner, {
      countedCash: expected,
    })
    expect(again.status).toBe(422)
  })

  it('nhân viên không xem, không đóng được ca người khác; quản lý đóng thay được', async () => {
    const shift = await openShift(env.staff, 100_000)
    const other = await createShiftUserView(shift.id)
    expect(other.status).toBe(200)

    const staffOnOwner = await openShift(env.owner, 0)
    const denied = await call(apps.shifts, 'GET', `/${staffOnOwner.id}`, env.staff)
    expect(denied.status).toBe(404)
    const closeDenied = await call(apps.shifts, 'POST', `/${staffOnOwner.id}/close`, env.staff, {
      countedCash: 0,
    })
    expect(closeDenied.status).toBe(404)

    const byManager = await call<{ data: ShiftDetail }>(
      apps.shifts,
      'POST',
      `/${shift.id}/close`,
      env.manager,
      { countedCash: 100_000 },
    )
    expect(byManager.status).toBe(200)
    expect(byManager.body.data).toMatchObject({ difference: 0, closedBy: env.manager.id })

    const staffList = await call<{ data: Array<{ userId: string }> }>(
      apps.shifts,
      'GET',
      '/',
      env.staff,
    )
    expect(staffList.body.data.every((s) => s.userId === env.staff.id)).toBe(true)
    const managerList = await call<{ data: unknown[] }>(apps.shifts, 'GET', '/', env.manager)
    expect(managerList.body.data).toHaveLength(2)
  })

  it('đơn ngoại tuyến đồng bộ gắn ca theo giờ bán và người bán; ngoài ca thì để trống', async () => {
    await enableShifts()
    const product = await createProduct(env, { sellingPrice: 10_000, currentStock: 10 })
    const actor = { userId: env.staff.id, storeId: env.storeId, role: env.staff.role }
    const openedAt = new Date(Date.now() - 2 * 3_600_000)
    const closedAt = new Date(Date.now() - 3_600_000)
    const [shift] = await env.db
      .insert(cashShifts)
      .values({
        storeId: env.storeId,
        userId: env.staff.id,
        openingCash: 0,
        openedAt,
        status: 'closed',
        closedAt,
        closedBy: env.staff.id,
        expectedCash: 0,
        countedCash: 0,
        difference: 0,
      })
      .returning()

    const input = () =>
      orderInput({ paymentMethod: 'cash', lines: [{ product, price: 10_000, quantity: 1 }] })
    const inside = await createOrder({
      db: env.db,
      actor,
      input: { ...input(), clientId: randomUUID() } as CreateOrderInput,
      source: 'offline_sync',
      offlineCreatedAt: new Date(openedAt.getTime() + 60_000).toISOString(),
    })
    // Bán ngoại tuyến sau khi đóng ca, chưa mở ca mới: không chặn đồng bộ, đơn chưa gắn ca
    const outside = await createOrder({
      db: env.db,
      actor,
      input: { ...input(), clientId: randomUUID() } as CreateOrderInput,
      source: 'offline_sync',
      offlineCreatedAt: new Date(closedAt.getTime() + 60_000).toISOString(),
    })
    // Đơn của người khác trong khung giờ ca này không gắn vào ca của nhân viên
    const otherUser = await createOrder({
      db: env.db,
      actor: { userId: env.owner.id, storeId: env.storeId, role: env.owner.role },
      input: { ...input(), clientId: randomUUID() } as CreateOrderInput,
      source: 'offline_sync',
      offlineCreatedAt: new Date(openedAt.getTime() + 60_000).toISOString(),
    })

    const shiftOf = async (id: string) =>
      (await env.db.select().from(orders).where(eq(orders.id, id)))[0]!.shiftId
    expect(await shiftOf(inside.id)).toBe(shift!.id)
    expect(await shiftOf(outside.id)).toBeNull()
    expect(await shiftOf(otherUser.id)).toBeNull()

    const report = await call<{ data: CashFlowReport }>(
      apps.cashReports,
      'GET',
      `/cash-flow?from=${today()}&to=${today()}`,
      env.owner,
    )
    expect(report.body.data.unassigned).toMatchObject({ orderCount: 2, cashIn: 20_000 })
  })
})

/** Nhân viên xem ca của chính mình */
function createShiftUserView(shiftId: string) {
  return call(apps.shifts, 'GET', `/${shiftId}`, env.staff)
}

describe('BC-06: báo cáo dòng tiền theo phương thức', () => {
  it('khớp tổng chứng từ khi có chiết khấu dòng, chiết khấu đơn và trả hàng', async () => {
    const product = await createProduct(env, { sellingPrice: 100_000, currentStock: 50 })
    const customer = await createCustomer(env, { debtLimit: 10_000_000 })

    // Đơn 1: tiền mặt, 2 × 100k, giảm dòng 20k, giảm đơn 30k: total 150k
    const o1 = await sell(env.owner, {
      paymentMethod: 'cash',
      cashAmount: 200_000,
      lines: [{ product, price: 100_000, quantity: 2, lineDiscount: 20_000 }],
      orderDiscount: 30_000,
    })
    expect(o1.total).toBe(150_000)
    // Đơn 2: chuyển khoản 100k
    const o2 = await sell(env.owner, {
      paymentMethod: 'transfer',
      lines: [{ product, price: 100_000, quantity: 1 }],
    })
    // Đơn 3: kết hợp 200k: 150k tiền mặt + 70k chuyển khoản, thối 20k
    await sell(env.owner, {
      paymentMethod: 'combined',
      cashAmount: 150_000,
      transferAmount: 70_000,
      lines: [{ product, price: 100_000, quantity: 2 }],
    })
    // Đơn 4: QR 100k
    await sell(env.owner, {
      paymentMethod: 'qr',
      lines: [{ product, price: 100_000, quantity: 1 }],
    })
    // Đơn 5: ghi nợ 300k, trả trước 50k tiền mặt
    await sell(env.owner, {
      paymentMethod: 'debt',
      customerId: customer.id,
      cashAmount: 50_000,
      debtAmount: 250_000,
      lines: [{ product, price: 100_000, quantity: 3 }],
    })
    // Phiếu thu 100k chuyển khoản
    const debtList = await call<{ data: { items: Array<{ id: string }> } }>(
      apps.receipts,
      'GET',
      `/customer-debts/${customer.id}`,
      env.owner,
    )
    const receipt = await postReceipt(
      env.owner,
      customer.id,
      debtList.body.data.items[0]!.id,
      100_000,
      'transfer',
    )
    expect(receipt.status).toBe(201)
    // Trả 1 món đơn 1 (giá trị ròng 75k), hoàn tiền mặt; trả 1 món đơn 2 hoàn chuyển khoản 100k
    const r1 = await returnAll(env.owner, o1.id)
    expect(r1.refundAmount).toBe(75_000)
    await returnAll(env.owner, o2.id)

    const res = await call<{ data: CashFlowReport }>(
      apps.cashReports,
      'GET',
      `/cash-flow?from=${today()}&to=${today()}`,
      env.owner,
    )
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const report = res.body.data

    const gross = 200_000 + 100_000 + 200_000 + 100_000 + 300_000
    expect(report.revenue).toEqual({
      orderCount: 5,
      gross,
      lineDiscount: 20_000,
      orderDiscount: 30_000,
      returnCount: 2,
      returns: 175_000,
      net: gross - 20_000 - 30_000 - 175_000,
    })

    // Tổng total các đơn = gộp - chiết khấu: thuần + trả hàng
    const totals = await env.db.select({ total: orders.total }).from(orders)
    const sumTotal = totals.reduce((s, o) => s + Number(o.total), 0)
    expect(report.revenue.net + report.revenue.returns).toBe(sumTotal)

    const byMethod = Object.fromEntries(report.methods.map((m) => [m.method ?? 'unknown', m]))
    expect(byMethod.cash).toMatchObject({
      salesIn: 150_000 + 130_000 + 50_000,
      receiptsIn: 0,
      refundsOut: 75_000,
      net: 150_000 + 130_000 + 50_000 - 75_000,
    })
    expect(byMethod.transfer).toMatchObject({
      salesIn: 100_000 + 70_000,
      receiptsIn: 100_000,
      refundsOut: 100_000,
      net: 170_000,
    })
    expect(byMethod.qr).toMatchObject({ salesIn: 100_000, net: 100_000 })
    expect(byMethod.unknown).toBeUndefined()

    // Tiền thu trên đơn + phần ghi nợ = tổng đơn: không cộng debts.paid lần nữa (TIEN-01)
    const salesIn = report.methods.reduce((s, m) => s + m.salesIn, 0)
    expect(salesIn + report.debt.debtSales).toBe(sumTotal)
    expect(report.debt.debtSales).toBe(250_000)

    expect(report.cash).toEqual({
      cashIn: 330_000,
      cashOut: 75_000,
      netCash: 255_000,
      openingCash: 0,
      shiftDifference: 0,
      closedShiftCount: 0,
      openShiftCount: 0,
    })
  })

  it('chứng từ cũ không có phương thức hiện ở nhóm "chưa rõ", không tính vào tiền mặt', async () => {
    const { customer, debtId } = await customerWithDebt(100_000)
    const res = await postReceipt(env.owner, customer.id, debtId, 40_000, 'cash')
    expect(res.status).toBe(201)
    await env.db
      .update(receipts)
      .set({ paymentMethod: null })
      .where(eq(receipts.id, res.body.data.id))

    const report = await call<{ data: CashFlowReport }>(
      apps.cashReports,
      'GET',
      `/cash-flow?from=${today()}&to=${today()}`,
      env.owner,
    )
    const unknown = report.body.data.methods.find((m) => m.method === null)
    expect(unknown).toMatchObject({ receiptsIn: 40_000 })
    expect(report.body.data.cash.cashIn).toBe(0)
  })

  it('nhân viên không xem được báo cáo dòng tiền', async () => {
    const res = await call(
      apps.cashReports,
      'GET',
      `/cash-flow?from=${today()}&to=${today()}`,
      env.staff,
    )
    expect(res.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// Review PR #58
// ---------------------------------------------------------------------------

async function shiftDetail(id: string) {
  const res = await call<{ data: ShiftDetail }>(apps.shifts, 'GET', `/${id}`, env.owner)
  expect(res.status).toBe(200)
  return res.body.data
}

async function closeShift(user: SeededUser, id: string, countedCash: number) {
  const res = await call<{ data: ShiftDetail }>(apps.shifts, 'POST', `/${id}/close`, user, {
    countedCash,
  })
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  return res.body.data
}

async function cashFlow(from: string, to: string = from) {
  const res = await call<{ data: CashFlowReport }>(
    apps.cashReports,
    'GET',
    `/cash-flow?from=${from}&to=${to}`,
    env.owner,
  )
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  return res.body.data
}

function dayKey(offsetDays: number) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
    new Date(Date.now() + offsetDays * 86_400_000),
  )
}

describe('POS-06 (review MAJOR 1): chứng từ quản lý lập thay gắn vào ca của thu ngân', () => {
  it('nhân viên mở ca 500k, bán 100k; quản lý hoàn 50k: ca nhân viên phải có 550k', async () => {
    await enableShifts()
    const product = await createProduct(env, { sellingPrice: 50_000, currentStock: 10 })
    const shift = await openShift(env.staff, 500_000)
    const order = await sell(env.staff, {
      paymentMethod: 'cash',
      lines: [{ product, price: 50_000, quantity: 2 }],
    })
    // Quản lý không có ca; cửa hàng chỉ có một ca đang mở nên phiếu trả vào ca đó
    const ret = await returnAll(env.manager, order.id)
    expect(ret.refundAmount).toBe(50_000)
    const [saved] = await env.db.select().from(orderReturns).where(eq(orderReturns.id, ret.id))
    expect(saved!.shiftId).toBe(shift.id)
    expect((await shiftDetail(shift.id)).summary.expectedCash).toBe(550_000)
  })

  it('phiếu thu của quản lý và phiếu chi của chủ vào ca duy nhất đang mở', async () => {
    const { customer, debtId } = await customerWithDebt(80_000)
    const shift = await openShift(env.staff, 100_000)
    const receipt = await postReceipt(env.manager, customer.id, debtId, 30_000, 'cash')
    expect(receipt.status, JSON.stringify(receipt.body)).toBe(201)
    const [savedReceipt] = await env.db
      .select()
      .from(receipts)
      .where(eq(receipts.id, receipt.body.data.id))
    expect(savedReceipt!.shiftId).toBe(shift.id)

    const [supplier] = await env.db
      .insert(suppliers)
      .values({ storeId: env.storeId, code: 'NCC-R1', name: 'NCC R1', currentDebt: 40_000 })
      .returning()
    const paid = await call<{ data: { id: string } }>(
      apps.supplierPayments,
      'POST',
      '/',
      env.owner,
      {
        supplierId: supplier!.id,
        amount: 40_000,
        paymentMethod: 'cash',
      },
    )
    expect(paid.status, JSON.stringify(paid.body)).toBe(201)
    expect((await shiftDetail(shift.id)).summary).toMatchObject({
      cashReceipts: 30_000,
      cashSupplierPayments: 40_000,
      expectedCash: 90_000,
    })
  })

  it('nhiều ca đang mở: hoàn tiền mặt phải chọn ca; chọn rồi thì gắn đúng ca đã chọn', async () => {
    await enableShifts()
    const product = await createProduct(env, { sellingPrice: 50_000, currentStock: 10 })
    const staffShift = await openShift(env.staff, 0)
    await openShift(env.owner, 0)
    const order = await sell(env.staff, {
      paymentMethod: 'cash',
      lines: [{ product, price: 50_000, quantity: 2 }],
    })
    const ids = await orderItemIds(order.id)
    const body = {
      items: [{ orderItemId: ids[0]!, quantity: 1, reason: 'defective' }],
      note: null,
    }
    const ask = await call<{
      error: { details: { reason: string; shifts: Array<{ id: string; userName: string | null }> } }
    }>(apps.orders, 'POST', `/${order.id}/returns`, env.manager, body)
    expect(ask.status).toBe(422)
    expect(ask.body.error.details.reason).toBe('shift_choice_required')
    expect(ask.body.error.details.shifts.map((s) => s.id)).toContain(staffShift.id)
    expect(await env.db.select().from(orderReturns)).toHaveLength(0)

    const chosen = await call<{ data: { id: string } }>(
      apps.orders,
      'POST',
      `/${order.id}/returns`,
      env.manager,
      { ...body, shiftId: staffShift.id },
    )
    expect(chosen.status, JSON.stringify(chosen.body)).toBe(201)
    const [saved] = await env.db
      .select()
      .from(orderReturns)
      .where(eq(orderReturns.id, chosen.body.data.id))
    expect(saved!.shiftId).toBe(staffShift.id)
  })

  it('ca đã chọn đã đóng hoặc thuộc cửa hàng khác: 422, không tạo chứng từ', async () => {
    const { customer, debtId } = await customerWithDebt(50_000)
    const shift = await openShift(env.staff, 0)
    await closeShift(env.staff, shift.id, 0)
    const res = await call<{ error: { details: { reason: string } } }>(
      apps.receipts,
      'POST',
      '/',
      env.manager,
      {
        customerId: customer.id,
        amount: 10_000,
        paymentMethod: 'cash',
        shiftId: shift.id,
        allocationMode: 'manual',
        allocations: [{ debtId, amount: 10_000 }],
      },
    )
    expect(res.status).toBe(422)
    expect(res.body.error.details.reason).toBe('shift_not_open')
    expect(await env.db.select().from(receipts)).toHaveLength(0)
  })
})

describe('BC-06 (review MAJOR 2): đối soát trong ngày với các ca nối tiếp', () => {
  it('ca sáng 1.000k bán 2.000k, ca chiều mở 3.000k bán 1.000k: phải có 4.000k, không cộng dồn đầu ca', async () => {
    await enableShifts()
    const product = await createProduct(env, { sellingPrice: 1_000_000, currentStock: 10 })
    const morning = await openShift(env.staff, 1_000_000)
    await sell(env.staff, {
      paymentMethod: 'cash',
      lines: [{ product, price: 1_000_000, quantity: 2 }],
    })
    await closeShift(env.staff, morning.id, 3_000_000)
    const afternoon = await openShift(env.manager, 3_000_000)
    await sell(env.manager, {
      paymentMethod: 'cash',
      lines: [{ product, price: 1_000_000, quantity: 1 }],
    })
    await closeShift(env.manager, afternoon.id, 3_900_000)

    const report = await cashFlow(today())
    // Tiền đầu ngày là quỹ đầu ca của ca mở sớm nhất, không cộng quỹ đầu ca các ca sau
    expect(report.cash.openingCash).toBe(1_000_000)
    expect(report.cash.openingCash + report.cash.netCash).toBe(4_000_000)
    // Tổng chênh lệch ngày = tổng chênh lệch các ca đã đóng
    expect(report.cash.shiftDifference).toBe(-100_000)
    expect(report.cash.closedShiftCount).toBe(2)
    expect(report.cash.openShiftCount).toBe(0)
  })

  it('ca vắt qua 0h thuộc ngày mở ca', async () => {
    const openedAt = new Date(`${dayKey(-1)}T23:00:00+07:00`)
    await env.db.insert(cashShifts).values({
      storeId: env.storeId,
      userId: env.staff.id,
      openingCash: 700_000,
      openedAt,
      status: 'closed',
      closedAt: new Date(Math.min(Date.now(), openedAt.getTime() + 3 * 3_600_000)),
      closedBy: env.staff.id,
      expectedCash: 700_000,
      countedCash: 650_000,
      difference: -50_000,
    })
    const yesterday = await cashFlow(dayKey(-1))
    expect(yesterday.shifts).toHaveLength(1)
    expect(yesterday.cash).toMatchObject({ openingCash: 700_000, shiftDifference: -50_000 })
    const todayReport = await cashFlow(today())
    expect(todayReport.shifts).toHaveLength(0)
    expect(todayReport.cash).toMatchObject({ openingCash: 0, shiftDifference: 0 })
  })
})

describe('BC-06 (review MAJOR 3): đơn ngoại tuyến tính theo giờ bán', () => {
  it('bán ngoại tuyến 21:00 hôm qua, đồng bộ hôm nay: đơn ở ngày hôm qua và ở ca A', async () => {
    const product = await createProduct(env, { sellingPrice: 30_000, currentStock: 10 })
    const soldAt = new Date(`${dayKey(-1)}T21:00:00+07:00`)
    const [shiftA] = await env.db
      .insert(cashShifts)
      .values({
        storeId: env.storeId,
        userId: env.staff.id,
        openingCash: 0,
        openedAt: new Date(soldAt.getTime() - 3_600_000),
        status: 'closed',
        closedAt: new Date(soldAt.getTime() + 3_600_000),
        closedBy: env.staff.id,
        expectedCash: 0,
        countedCash: 0,
        difference: 0,
      })
      .returning()
    const order = await createOrder({
      db: env.db,
      actor: { userId: env.staff.id, storeId: env.storeId, role: env.staff.role },
      input: {
        ...orderInput({ paymentMethod: 'cash', lines: [{ product, price: 30_000, quantity: 1 }] }),
        clientId: randomUUID(),
      } as CreateOrderInput,
      source: 'offline_sync',
      offlineCreatedAt: soldAt.toISOString(),
    })
    const [saved] = await env.db.select().from(orders).where(eq(orders.id, order.id))
    expect(saved!.shiftId).toBe(shiftA!.id)
    expect(saved!.soldAt.toISOString()).toBe(soldAt.toISOString())

    const yesterday = await cashFlow(dayKey(-1))
    expect(yesterday.revenue.orderCount).toBe(1)
    expect(yesterday.methods.find((m) => m.method === 'cash')!.salesIn).toBe(30_000)
    const todayReport = await cashFlow(today())
    expect(todayReport.revenue.orderCount).toBe(0)
  })

  it('đơn trực tuyến có giờ bán bằng giờ tạo', async () => {
    const product = await createProduct(env, { sellingPrice: 30_000, currentStock: 10 })
    const order = await sell(env.staff, {
      paymentMethod: 'cash',
      lines: [{ product, price: 30_000, quantity: 1 }],
    })
    const [saved] = await env.db.select().from(orders).where(eq(orders.id, order.id))
    expect(saved!.soldAt.getTime()).toBe(saved!.createdAt.getTime())
  })
})

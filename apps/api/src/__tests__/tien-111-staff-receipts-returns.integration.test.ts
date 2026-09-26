import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { debts, orderReturns, receipts, stores } from '@kiotviet-lite/shared'

import { createOrdersRoutes } from '../routes/orders.routes.js'
import { createReceiptsRoutes } from '../routes/receipts.routes.js'
import { createShiftsRoutes } from '../routes/shifts.routes.js'
import { expectDebtLedgerConsistent } from './helpers/debt-ledger.js'
import { createCustomer } from './helpers/factories.js'
import { expectInvariantsClean } from './helpers/invariants.js'
import { sell, stockedProduct } from './helpers/sell.js'
import { createTestEnv, type SeededUser, type TestEnv } from './helpers/test-env.js'

// TIEN-111: nhân viên lập được phiếu thu và phiếu trả hàng. Hoàn tiền qua kênh khác kênh khách
// đã trả là vượt quyền, cần người duyệt có `orders.returnOverride` nhập PIN (R1, ADR-0009).
// Chứng từ tiền mặt nhân viên lập gắn vào ca của chính họ.

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

let env: TestEnv
let app: Hono

beforeEach(async () => {
  env = await createTestEnv()
  app = new Hono()
  app.route('/orders', createOrdersRoutes({ db: env.db }))
  app.route('/receipts', createReceiptsRoutes({ db: env.db }))
  app.route('/shifts', createShiftsRoutes({ db: env.db }))
})

afterEach(async () => {
  await expectInvariantsClean(env.db)
  await expectDebtLedgerConsistent(env.db, env.storeId)
  await env.close()
})

interface Resp {
  status: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
}

async function call(method: string, path: string, user: SeededUser, body?: unknown): Promise<Resp> {
  const res = await app.request(path, {
    method,
    headers: { ...user.authHeader, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : undefined }
}

async function openShift(user: SeededUser) {
  await env.db.update(stores).set({ shiftsEnabled: true }).where(eq(stores.id, env.storeId))
  const r = await call('POST', '/shifts/open', user, { openingCash: 0 })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return r.body.data as { id: string }
}

async function debtSale() {
  const product = await stockedProduct(env)
  const customer = await createCustomer(env, { debtLimit: 10_000_000 })
  const order = await sell(env, [{ product, quantity: 2 }], { customerId: customer.id })
  const [debt] = await env.db.select().from(debts).where(eq(debts.orderId, order.id))
  return { customer, order, debt: debt! }
}

const receiptBody = (customerId: string, debtId: string, extra: Record<string, unknown> = {}) => ({
  customerId,
  amount: 50_000,
  paymentMethod: 'cash',
  allocationMode: 'manual',
  allocations: [{ debtId, amount: 50_000 }],
  ...extra,
})

async function transferSale() {
  const product = await stockedProduct(env)
  const order = await sell(env, [{ product, quantity: 2 }], { paymentMethod: 'transfer' })
  return { order, itemId: order.items[0]!.id }
}

const returnBody = (itemId: string, extra: Record<string, unknown> = {}) => ({
  items: [{ orderItemId: itemId, quantity: 1, reason: 'defective' }],
  ...extra,
})

describe('TIEN-111: nhân viên lập phiếu thu', () => {
  it('staff lập phiếu thu được, phiếu gắn ca của chính staff', async () => {
    const { customer, debt } = await debtSale()
    const staffShift = await openShift(env.staff)

    const r = await call('POST', '/receipts', env.staff, receiptBody(customer.id, debt.id))
    expect(r.status, JSON.stringify(r.body)).toBe(201)

    const [row] = await env.db.select().from(receipts).where(eq(receipts.id, r.body.data.id))
    expect(row!.shiftId).toBe(staffShift.id)
    expect(row!.createdBy).toBe(env.staff.id)

    const list = await call('GET', '/receipts', env.staff)
    expect(list.status).toBe(200)
  })

  it('staff không được ghi phiếu thu vào ca của người khác', async () => {
    const { customer, debt } = await debtSale()
    const managerShift = await openShift(env.manager)
    await openShift(env.staff)

    const r = await call(
      'POST',
      '/receipts',
      env.staff,
      receiptBody(customer.id, debt.id, { shiftId: managerShift.id }),
    )
    expect(r.status).toBe(422)
    expect(r.body.error.message).toContain('ca của chính bạn')
  })

  it('bật ca mà staff chưa mở ca thì không thu tiền mặt được', async () => {
    const { customer, debt } = await debtSale()
    await openShift(env.manager)

    const r = await call('POST', '/receipts', env.staff, receiptBody(customer.id, debt.id))
    expect(r.status).toBe(422)
    expect(r.body.error.message).toContain('Chưa mở ca')
  })

  it('staff vẫn không hủy được phiếu thu khi thiếu PIN', async () => {
    const { customer, debt } = await debtSale()
    const created = await call('POST', '/receipts', env.staff, receiptBody(customer.id, debt.id))
    expect(created.status).toBe(201)

    const cancel = await call('POST', `/receipts/${created.body.data.id}/cancel`, env.staff, {
      reason: 'Nhập nhầm',
    })
    expect(cancel.status).toBe(403)
  })
})

describe('TIEN-111: nhân viên lập phiếu trả hàng', () => {
  it('staff trả hàng hoàn đúng kênh khách đã trả, không cần PIN', async () => {
    const { order, itemId } = await transferSale()
    const r = await call('POST', `/orders/${order.id}/returns`, env.staff, returnBody(itemId))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.refundMethod).toBe('transfer')
  })

  it('staff hoàn tiền mặt cho đơn chuyển khoản mà không có PIN thì bị 403', async () => {
    const { order, itemId } = await transferSale()
    const r = await call(
      'POST',
      `/orders/${order.id}/returns`,
      env.staff,
      returnBody(itemId, { refundMethod: 'cash' }),
    )
    expect(r.status).toBe(403)
    expect(r.body.error.details).toMatchObject({
      requiredPermissions: ['orders.returnOverride'],
      reason: 'refund_method_override',
    })
    expect(await env.db.select().from(orderReturns)).toHaveLength(0)
  })

  it('có PIN hợp lệ của quản lý thì staff hoàn khác kênh được', async () => {
    const { order, itemId } = await transferSale()
    const r = await call(
      'POST',
      `/orders/${order.id}/returns`,
      env.staff,
      returnBody(itemId, {
        refundMethod: 'cash',
        approverId: env.manager.id,
        approverPin: env.manager.pin,
      }),
    )
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.refundMethod).toBe('cash')
  })

  it('PIN sai hoặc PIN của người không có quyền duyệt bị từ chối', async () => {
    const { order, itemId } = await transferSale()
    const wrongPin = await call(
      'POST',
      `/orders/${order.id}/returns`,
      env.staff,
      returnBody(itemId, {
        refundMethod: 'cash',
        approverId: env.manager.id,
        approverPin: '999999',
      }),
    )
    // R1: PIN sai là 401 (được đếm chống dò), người duyệt thiếu quyền là 403
    expect(wrongPin.status).toBe(401)

    const staffPin = await call(
      'POST',
      `/orders/${order.id}/returns`,
      env.staff,
      returnBody(itemId, {
        refundMethod: 'cash',
        approverId: env.staff.id,
        approverPin: env.staff.pin,
      }),
    )
    expect(staffPin.status).toBe(403)
    expect(await env.db.select().from(orderReturns)).toHaveLength(0)
  })

  it('quản lý hoàn khác kênh không cần PIN', async () => {
    const { order, itemId } = await transferSale()
    const r = await call(
      'POST',
      `/orders/${order.id}/returns`,
      env.manager,
      returnBody(itemId, { refundMethod: 'cash' }),
    )
    expect(r.status, JSON.stringify(r.body)).toBe(201)
  })

  it('phiếu trả tiền mặt staff lập gắn ca của chính staff', async () => {
    const product = await stockedProduct(env)
    const order = await sell(env, [{ product, quantity: 2 }])
    await openShift(env.manager)
    const staffShift = await openShift(env.staff)

    const r = await call(
      'POST',
      `/orders/${order.id}/returns`,
      env.staff,
      returnBody(order.items[0]!.id),
    )
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const [row] = await env.db
      .select()
      .from(orderReturns)
      .where(eq(orderReturns.id, r.body.data.id))
    expect(row!.shiftId).toBe(staffShift.id)
  })
})

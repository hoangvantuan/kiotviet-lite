import { eq } from 'drizzle-orm'
import { drizzle as pgliteDrizzle } from 'drizzle-orm/pglite'
import type { Hono } from 'hono'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { customers, debtAdjustments, debts } from '@kiotviet-lite/shared'
import * as schema from '@kiotviet-lite/shared/schema'

import type { Db } from '../db/index.js'
import { createCustomersRoutes } from '../routes/customers.routes.js'
import { createDebtAdjustmentsRoutes } from '../routes/debt-adjustments.routes.js'
import { createDebtAdjustment } from '../services/debt-adjustments.service.js'
import { getOrderDetail } from '../services/orders.service.js'
import { createReceipt, listCustomerOpenDebts } from '../services/receipts.service.js'
import { getDebtAgingReport, getDebtSummaryReport } from '../services/reports.service.js'
import { createReturn } from '../services/returns.service.js'
import { expectDebtLedgerConsistent } from './helpers/debt-ledger.js'
import { createCustomer, createDebtOrder, createProduct } from './helpers/factories.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

let env: TestEnv
let customersApp: Hono
let adjustApp: Hono

beforeEach(async () => {
  env = await createTestEnv()
  customersApp = createCustomersRoutes({ db: env.db })
  adjustApp = createDebtAdjustmentsRoutes({ db: env.db })
})

afterEach(async () => {
  await expectDebtLedgerConsistent(env.db, env.storeId)
  await env.close()
})

const ownerActor = () => ({ userId: env.owner.id, storeId: env.storeId, role: env.owner.role })

async function openingDebt(customerId: string, amount: number, incurredAt = '2026-08-25') {
  const res = await customersApp.request(`/${customerId}/opening-debt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...env.owner.authHeader },
    body: JSON.stringify({ amount, incurredAt }),
  })
  expect(res.status).toBe(201)
}

async function adjust(body: Record<string, unknown>) {
  const res = await adjustApp.request('/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...env.owner.authHeader },
    body: JSON.stringify(body),
  })
  return {
    status: res.status,
    body: (await res.json()) as {
      data?: { oldAmount: number; newAmount: number }
      error?: { code: string; message: string }
    },
  }
}

async function currentDebt(customerId: string) {
  const row = await env.db.query.customers.findFirst({ where: eq(customers.id, customerId) })
  return Number(row!.currentDebt)
}

async function receiptFifo(customerId: string, amount: number) {
  const open = await listCustomerOpenDebts({ db: env.db, storeId: env.storeId, customerId })
  let left = amount
  const allocations: Array<{ debtId: string; amount: number }> = []
  for (const item of open.items) {
    if (left <= 0) break
    const take = Math.min(left, item.remaining)
    allocations.push({ debtId: item.id, amount: take })
    left -= take
  }
  return createReceipt({
    db: env.db,
    actor: ownerActor(),
    input: { customerId, amount, allocationMode: 'fifo', allocations },
  })
}

async function expectReportsMatchReceivable() {
  const aging = await getDebtAgingReport({ db: env.db, storeId: env.storeId, query: {} })
  const summary = await getDebtSummaryReport({ db: env.db, storeId: env.storeId, query: {} })
  expect(aging.totals.totalDebt).toBe(summary.receivable.totalDebt)
}

describe('TIEN-03 / BC-05: điều chỉnh tăng nợ tạo khoản nợ', () => {
  it('đầu kỳ 500k, giảm còn 400k, tăng lên 450k, rồi thu đủ 450k được chấp nhận', async () => {
    const customer = await createCustomer(env)
    await openingDebt(customer.id, 500_000)

    const down = await adjust({
      customerId: customer.id,
      direction: 'decrease',
      amount: 100_000,
      expectedCurrentDebt: 500_000,
      reason: 'Chiết khấu thương mại dịp sinh nhật khách hàng',
    })
    expect(down.status).toBe(201)
    expect(down.body.data).toMatchObject({ oldAmount: 500_000, newAmount: 400_000 })
    await expectDebtLedgerConsistent(env.db, env.storeId)

    const up = await adjust({
      customerId: customer.id,
      direction: 'increase',
      amount: 50_000,
      expectedCurrentDebt: 400_000,
      reason: 'Phí vận chuyển phát sinh thỏa thuận thêm',
    })
    expect(up.status).toBe(201)
    expect(up.body.data).toMatchObject({ oldAmount: 400_000, newAmount: 450_000 })
    await expectDebtLedgerConsistent(env.db, env.storeId)

    // Phần tăng là một khoản nợ không gắn đơn, loại điều chỉnh, có tuổi nợ
    const rows = await env.db.select().from(debts).where(eq(debts.customerId, customer.id))
    const adjustmentDebt = rows.find((d) => d.type === 'adjustment')
    expect(adjustmentDebt).toMatchObject({ orderId: null, amount: 50_000, remaining: 50_000 })
    expect(adjustmentDebt!.note).toBe('Phí vận chuyển phát sinh thỏa thuận thêm')

    await expectReportsMatchReceivable()
    const aging = await getDebtAgingReport({ db: env.db, storeId: env.storeId, query: {} })
    expect(aging.totals.totalDebt).toBe(450_000)

    const receipt = await receiptFifo(customer.id, 450_000)
    expect(receipt.debtAfter).toBe(0)
    expect(await currentDebt(customer.id)).toBe(0)
    await expectReportsMatchReceivable()
  })

  it('giảm nợ về 0 ghi vào phần giảm trừ, không coi là đã thu tiền', async () => {
    const customer = await createCustomer(env)
    await openingDebt(customer.id, 300_000)

    const res = await adjust({
      customerId: customer.id,
      direction: 'decrease',
      amount: 300_000,
      expectedCurrentDebt: 300_000,
      reason: 'Xoá nợ xấu',
    })
    expect(res.status).toBe(201)
    const [row] = await env.db.select().from(debts).where(eq(debts.customerId, customer.id))
    expect(row).toMatchObject({ paid: 0, reduced: 300_000, remaining: 0 })
  })

  it('giảm vượt số nợ hiện tại bị từ chối', async () => {
    const customer = await createCustomer(env)
    await openingDebt(customer.id, 100_000)
    const res = await adjust({
      customerId: customer.id,
      direction: 'decrease',
      amount: 150_000,
      expectedCurrentDebt: 100_000,
      reason: 'Nhập nhầm',
    })
    expect(res.status).toBe(400)
    expect(await currentDebt(customer.id)).toBe(100_000)
  })

  it('không còn nhận hợp đồng số nợ mới tuyệt đối', async () => {
    const customer = await createCustomer(env)
    await openingDebt(customer.id, 100_000)
    const res = await adjust({ customerId: customer.id, newAmount: 0, reason: 'Xoá nợ' })
    expect(res.status).toBe(400)
    expect(await currentDebt(customer.id)).toBe(100_000)
  })
})

describe('TIEN-102: điều chỉnh nợ kiểm số nợ cũ máy khách thấy', () => {
  it('phiếu thu chen vào giữa lúc mở hộp và lúc xác nhận: trả 409, không ghi gì', async () => {
    const customer = await createCustomer(env)
    await openingDebt(customer.id, 500_000, '2026-09-20')

    // Owner mở hộp thoại, thấy 500k. Thu ngân máy khác lập phiếu thu 200k.
    await receiptFifo(customer.id, 200_000)

    const res = await adjust({
      customerId: customer.id,
      direction: 'decrease',
      amount: 100_000,
      expectedCurrentDebt: 500_000,
      reason: 'Chiết khấu thương mại dịp sinh nhật khách hàng',
    })
    expect(res.status).toBe(409)
    expect(res.body.error?.code).toBe('CONFLICT')
    expect(res.body.error?.message).toContain('tải lại')
    expect(await currentDebt(customer.id)).toBe(300_000)
    const logs = await env.db
      .select()
      .from(debtAdjustments)
      .where(eq(debtAdjustments.customerId, customer.id))
    expect(logs).toHaveLength(0)

    // Tải lại thấy 300k thì giảm 100k thành 200k như ý định
    const retry = await adjust({
      customerId: customer.id,
      direction: 'decrease',
      amount: 100_000,
      expectedCurrentDebt: 300_000,
      reason: 'Chiết khấu thương mại dịp sinh nhật khách hàng',
    })
    expect(retry.status).toBe(201)
    expect(retry.body.data).toMatchObject({ oldAmount: 300_000, newAmount: 200_000 })
  })
})

describe('TIEN-01: trả hàng đơn ghi nợ không bị tính là đã thu tiền', () => {
  it('trả toàn bộ đơn nợ 450k chưa thu đồng nào: đã thanh toán 0, không gắn nhãn đã thanh toán', async () => {
    const product = await createProduct(env, { sellingPrice: 450_000 })
    const customer = await createCustomer(env)
    const { order, items } = await createDebtOrder(env, product.id, customer.id, {
      items: [{ productId: product.id, unitPrice: 450_000, quantity: 1 }],
    })

    const ret = await createReturn({
      db: env.db,
      actor: ownerActor(),
      orderId: order.id,
      input: {
        items: [{ orderItemId: items[0]!.id, quantity: 1, reason: 'defective' }],
        note: null,
      },
    })
    expect(ret).toMatchObject({ refundAmount: 0, debtReductionAmount: 450_000 })

    const [debt] = await env.db.select().from(debts).where(eq(debts.orderId, order.id))
    expect(debt).toMatchObject({ paid: 0, reduced: 450_000, remaining: 0 })

    const detail = await getOrderDetail({ db: env.db, storeId: env.storeId, orderId: order.id })
    expect(detail.paidAmount).toBe(0)
    expect(detail.debtAmount).toBe(0)
    expect(detail.paymentStatus).not.toBe('paid')
    expect(await currentDebt(customer.id)).toBe(0)
  })

  it('đã thu 200k rồi trả toàn bộ: đã thanh toán đúng bằng 200k thực thu', async () => {
    const product = await createProduct(env, { sellingPrice: 450_000 })
    const customer = await createCustomer(env)
    const { order, items } = await createDebtOrder(env, product.id, customer.id, {
      items: [{ productId: product.id, unitPrice: 450_000, quantity: 1 }],
    })
    await receiptFifo(customer.id, 200_000)

    const ret = await createReturn({
      db: env.db,
      actor: ownerActor(),
      orderId: order.id,
      input: {
        items: [{ orderItemId: items[0]!.id, quantity: 1, reason: 'defective' }],
        note: null,
      },
    })
    expect(ret).toMatchObject({ refundAmount: 200_000, debtReductionAmount: 250_000 })

    const [debt] = await env.db.select().from(debts).where(eq(debts.orderId, order.id))
    expect(debt).toMatchObject({ paid: 200_000, reduced: 250_000, remaining: 0 })
    const detail = await getOrderDetail({ db: env.db, storeId: env.storeId, orderId: order.id })
    expect(detail.paidAmount).toBe(200_000)
    expect(detail.paymentStatus).toBe('paid')
  })
})

describe('TIEN-103: mọi luồng tiền khóa customers trước debts', () => {
  function loggingDb() {
    const queries: string[] = []
    const db = pgliteDrizzle(env.pglite, {
      schema,
      casing: 'snake_case',
      logger: { logQuery: (query) => queries.push(query) },
    }) as unknown as Db
    return { db, queries }
  }

  function expectCustomerLockedBeforeDebts(queries: string[]) {
    const customerLock = queries.findIndex((q) => /from "customers".*for update/is.test(q))
    const debtTouch = queries.findIndex(
      (q) => /from "debts".*for update/is.test(q) || /^update "debts"/i.test(q),
    )
    expect(customerLock).toBeGreaterThanOrEqual(0)
    expect(debtTouch).toBeGreaterThan(customerLock)
  }

  it('trả hàng đơn nợ khóa khách trước khi khóa khoản nợ', async () => {
    const product = await createProduct(env)
    const customer = await createCustomer(env)
    const { order, items } = await createDebtOrder(env, product.id, customer.id)
    const { db, queries } = loggingDb()
    await createReturn({
      db,
      actor: ownerActor(),
      orderId: order.id,
      input: {
        items: [{ orderItemId: items[0]!.id, quantity: 1, reason: 'defective' }],
        note: null,
      },
    })
    expectCustomerLockedBeforeDebts(queries)
  })

  it('phiếu thu và điều chỉnh nợ khóa khách trước khi khóa khoản nợ', async () => {
    const product = await createProduct(env)
    const customer = await createCustomer(env)
    await createDebtOrder(env, product.id, customer.id)

    const receiptLog = loggingDb()
    const open = await listCustomerOpenDebts({
      db: env.db,
      storeId: env.storeId,
      customerId: customer.id,
    })
    await createReceipt({
      db: receiptLog.db,
      actor: ownerActor(),
      input: {
        customerId: customer.id,
        amount: 1_000,
        allocationMode: 'fifo',
        allocations: [{ debtId: open.items[0]!.id, amount: 1_000 }],
      },
    })
    expectCustomerLockedBeforeDebts(receiptLog.queries)

    const adjustLog = loggingDb()
    await createDebtAdjustment({
      db: adjustLog.db,
      actor: ownerActor(),
      input: {
        customerId: customer.id,
        direction: 'decrease',
        amount: 1_000,
        expectedCurrentDebt: await currentDebt(customer.id),
        reason: 'Làm tròn',
      },
    })
    expectCustomerLockedBeforeDebts(adjustLog.queries)
  })
})

describe('bất biến công nợ kiểm trong transaction', () => {
  it('dữ liệu lệch sẵn (current_debt khác tổng khoản nợ) thì phiếu thu bị rollback', async () => {
    const product = await createProduct(env)
    const customer = await createCustomer(env)
    const { debt } = await createDebtOrder(env, product.id, customer.id)
    // Giả lập dữ liệu hỏng do đường ghi cũ: current_debt lệch 50k
    await env.db
      .update(customers)
      .set({ currentDebt: Number(debt.amount) + 50_000 })
      .where(eq(customers.id, customer.id))

    await expect(
      createReceipt({
        db: env.db,
        actor: ownerActor(),
        input: {
          customerId: customer.id,
          amount: 1_000,
          allocationMode: 'fifo',
          allocations: [{ debtId: debt.id, amount: 1_000 }],
        },
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' })

    const [after] = await env.db.select().from(debts).where(eq(debts.id, debt.id))
    expect(after!.remaining).toBe(debt.remaining)

    // Dọn để afterEach kiểm bất biến trên phần còn lại
    await env.db
      .update(customers)
      .set({ currentDebt: Number(debt.amount) })
      .where(eq(customers.id, customer.id))
  })
})

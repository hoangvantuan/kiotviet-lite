import { and, eq, sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  createCustomerOpeningDebtSchema,
  createDebtAdjustmentSchema,
  createOpeningDebtSchema,
  customers,
  debts,
} from '@kiotviet-lite/shared'

import { createCustomersRoutes } from '../routes/customers.routes.js'
import {
  addCustomerDebt,
  settleCustomerDebtsFifo,
} from '../services/customer-debt-ledger.service.js'
import { createDebtAdjustment } from '../services/debt-adjustments.service.js'
import { getDebtAgingReport } from '../services/reports.service.js'
import { expectDebtLedgerConsistent } from './helpers/debt-ledger.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

describe('GL-09: thông báo tiếng Việt khi nhập số tiền nợ đầu kỳ', () => {
  const date = { incurredAt: '2025-01-15' }

  it('ô số để trống (null) báo tiếng Việt thay vì "Expected number, received null"', () => {
    for (const schema of [createCustomerOpeningDebtSchema, createOpeningDebtSchema]) {
      const result = schema.safeParse({ amount: null, ...date })
      expect(result.success).toBe(false)
      expect(result.error?.issues[0]?.message).toBe('Vui lòng nhập số tiền')
    }
  })

  it('khách nhận số âm (trả trước), nhà cung cấp vẫn chỉ nhận số dương', () => {
    expect(createCustomerOpeningDebtSchema.safeParse({ amount: -5000, ...date }).success).toBe(true)
    expect(
      createCustomerOpeningDebtSchema.safeParse({ amount: 0, ...date }).error?.issues[0]?.message,
    ).toBe('Số tiền phải khác 0')
    expect(
      createOpeningDebtSchema.safeParse({ amount: -5000, ...date }).error?.issues[0]?.message,
    ).toBe('Số tiền phải lớn hơn 0')
  })
})

describe('GL-09: khách trả trước đi qua sổ công nợ R3', () => {
  let env: TestEnv
  let customerId: string
  let app: Hono

  beforeEach(async () => {
    env = await createTestEnv()
    app = createCustomersRoutes({ db: env.db })
    const [customer] = await env.db
      .insert(customers)
      .values({ code: 'KH-TRA-TRUOC', storeId: env.storeId, name: 'Khách trả trước' })
      .returning({ id: customers.id })
    customerId = customer!.id
  })

  afterEach(async () => env.close())

  const target = () => ({ storeId: env.storeId, customerId })

  async function openPrepayment(amount = -33_500) {
    const response = await app.request(`/${customerId}/opening-debt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...env.owner.authHeader },
      body: JSON.stringify({ amount, incurredAt: '2025-01-15' }),
    })
    return {
      status: response.status,
      body: (await response.json()) as {
        data?: { id: string; amount: number; remaining: number }
        error?: { message: string }
      },
    }
  }

  async function balance() {
    const [row] = await env.db
      .select({ currentDebt: customers.currentDebt })
      .from(customers)
      .where(eq(customers.id, customerId))
    return Number(row!.currentDebt)
  }

  async function debtRow(id: string) {
    const [row] = await env.db.select().from(debts).where(eq(debts.id, id))
    return {
      amount: row!.amount,
      paid: row!.paid,
      reduced: row!.reduced,
      remaining: row!.remaining,
    }
  }

  it('nạp số dư âm thành khoản nợ đầu kỳ âm, current_debt âm, không lọt vào tuổi nợ', async () => {
    const opened = await openPrepayment()
    expect(opened.status).toBe(201)
    expect(opened.body.data).toMatchObject({ amount: -33_500, remaining: -33_500 })
    expect(await balance()).toBe(-33_500)
    expect(await debtRow(opened.body.data!.id)).toEqual({
      amount: -33_500,
      paid: 0,
      reduced: 0,
      remaining: -33_500,
    })
    await expectDebtLedgerConsistent(env.db, env.storeId)

    const aging = await getDebtAgingReport({ db: env.db, storeId: env.storeId, query: {} })
    expect(aging.rows.find((row) => row.customerId === customerId)).toBeUndefined()

    const ledger = await app.request(`/${customerId}/debts`, { headers: env.owner.authHeader })
    expect(ledger.status).toBe(200)
    const body = (await ledger.json()) as { data: { currentDebt: number } }
    expect(body.data.currentDebt).toBe(-33_500)
  })

  it('nợ phát sinh sau được cấn vào tiền trả trước theo FIFO, phần dư mới thành nợ phải thu', async () => {
    const opened = await openPrepayment()
    const prepaymentId = opened.body.data!.id

    const first = await env.db.transaction((tx) =>
      addCustomerDebt(tx as never, { ...target(), type: 'adjustment', amount: 20_000 }),
    )
    expect(await debtRow(first.id)).toEqual({
      amount: 20_000,
      paid: 0,
      reduced: 20_000,
      remaining: 0,
    })
    expect(await debtRow(prepaymentId)).toEqual({
      amount: -33_500,
      paid: 0,
      reduced: -20_000,
      remaining: -13_500,
    })
    expect(await balance()).toBe(-13_500)

    const second = await env.db.transaction((tx) =>
      addCustomerDebt(tx as never, { ...target(), type: 'adjustment', amount: 50_000 }),
    )
    expect(await debtRow(second.id)).toEqual({
      amount: 50_000,
      paid: 0,
      reduced: 13_500,
      remaining: 36_500,
    })
    expect((await debtRow(prepaymentId)).remaining).toBe(0)
    expect(await balance()).toBe(36_500)
    await expectDebtLedgerConsistent(env.db, env.storeId)

    // Phần còn lại thu được bằng phiếu thu như nợ thường
    await env.db.transaction((tx) =>
      settleCustomerDebtsFifo(tx as never, { ...target(), kind: 'payment', amount: 36_500 }),
    )
    expect(await balance()).toBe(0)
    const [total] = await env.db
      .select({ paid: sql<number>`coalesce(sum(${debts.paid}), 0)` })
      .from(debts)
      .where(eq(debts.customerId, customerId))
    // Tổng tiền thu trong hệ thống: chỉ phiếu thu 36.500 (tiền trả trước đã thu ở hệ thống cũ)
    expect(Number(total?.paid)).toBe(36_500)
    await expectDebtLedgerConsistent(env.db, env.storeId)
  })

  it('điều chỉnh tăng nợ cho khách đang trả trước đi qua sổ và cấn trừ', async () => {
    await openPrepayment()
    const input = createDebtAdjustmentSchema.parse({
      customerId,
      direction: 'increase',
      amount: 10_000,
      expectedCurrentDebt: -33_500,
      reason: 'Bán ngoài hệ thống',
    })
    await createDebtAdjustment({
      db: env.db,
      actor: { userId: env.owner.id, storeId: env.storeId, role: env.owner.role },
      input,
    })
    expect(await balance()).toBe(-23_500)
    await expectDebtLedgerConsistent(env.db, env.storeId)
  })

  it('từ chối nạp lại, xoá khách còn tiền trả trước và ghi thẳng khoản âm không phải đầu kỳ', async () => {
    expect((await openPrepayment()).status).toBe(201)
    const again = await openPrepayment(-1000)
    expect(again.status).toBe(422)

    const removed = await app.request(`/${customerId}`, {
      method: 'DELETE',
      headers: env.owner.authHeader,
    })
    expect(removed.status).toBe(422)
    expect(((await removed.json()) as { error: { message: string } }).error.message).toBe(
      'Khách hàng còn 33.500đ tiền trả trước, không thể xoá',
    )

    await expect(
      env.db.transaction((tx) =>
        addCustomerDebt(tx as never, { ...target(), type: 'sale', amount: -1000 }),
      ),
    ).rejects.toThrow('Số tiền nợ phải lớn hơn 0')
    await expect(
      env.db.insert(debts).values({
        storeId: env.storeId,
        customerId,
        type: 'adjustment',
        amount: -1000,
        remaining: -1000,
      }),
    ).rejects.toThrow()
    const rows = await env.db
      .select({ id: debts.id })
      .from(debts)
      .where(and(eq(debts.customerId, customerId), eq(debts.storeId, env.storeId)))
    expect(rows).toHaveLength(1)
  })
})

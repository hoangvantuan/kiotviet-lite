import { eq } from 'drizzle-orm'
import { drizzle as pgliteDrizzle } from 'drizzle-orm/pglite'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { type CreateOrderInput, customers, debts, orderReturns } from '@kiotviet-lite/shared'
import * as schema from '@kiotviet-lite/shared/schema'

import type { Db } from '../db/index.js'
import { addCustomerDebt } from '../services/customer-debt-ledger.service.js'
import { createOrder } from '../services/orders.service.js'
import { createReturn, getOrderPrepaymentApplied } from '../services/returns.service.js'
import { expectDebtLedgerConsistent } from './helpers/debt-ledger.js'
import { createCustomer, createProduct } from './helpers/factories.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv()
})

afterEach(async () => {
  await expectDebtLedgerConsistent(env.db, env.storeId)
  await env.close()
})

const ownerActor = () => ({ userId: env.owner.id, storeId: env.storeId, role: env.owner.role })

async function prepay(customerId: string, amount: number) {
  await env.db.transaction((tx) =>
    addCustomerDebt(tx as never, {
      storeId: env.storeId,
      customerId,
      type: 'opening',
      amount: -amount,
    }),
  )
}

/** Bán ghi nợ qua luồng thật, để sổ công nợ cấn tiền trả trước như ở quầy */
async function sellOnDebt(
  db: Db,
  customerId: string,
  product: { id: string; name: string },
  price: number,
  quantity: number,
  cash = 0,
) {
  const total = price * quantity
  return createOrder({
    db,
    actor: ownerActor(),
    input: {
      customerId,
      subtotal: total,
      discountType: null,
      discountValue: 0,
      discountAmount: 0,
      total,
      paymentMethod: 'debt',
      paymentStatus: cash > 0 ? 'partial' : 'unpaid',
      ...(cash > 0 ? { cashAmount: cash } : {}),
      debtAmount: total - cash,
      debtLimitOverridden: false,
      note: null,
      items: [
        {
          productId: product.id,
          variantId: null,
          productName: product.name,
          variantName: null,
          unit: 'cái',
          unitPrice: price,
          quantity,
          discountType: null,
          discountValue: 0,
          discountAmount: 0,
          lineTotal: total,
          note: null,
          unitConversionId: null,
          originalPrice: null,
          priceOverride: false,
          priceOverrideReason: null,
          priceOverridePinUsed: false,
        },
      ],
    } as CreateOrderInput,
  })
}

async function balance(customerId: string) {
  const [row] = await env.db
    .select({ currentDebt: customers.currentDebt })
    .from(customers)
    .where(eq(customers.id, customerId))
  return Number(row!.currentDebt)
}

async function orderDebt(orderId: string) {
  const [row] = await env.db.select().from(debts).where(eq(debts.orderId, orderId))
  return row!
}

describe('GL-09: trả hàng đơn đã cấn bằng tiền trả trước hoàn lại vào trả trước (ADR-0011)', () => {
  it('trả trước 500k, mua nợ 300k được cấn hết: trả hàng hoàn 300k vào trả trước, không hoàn tiền mặt', async () => {
    const product = await createProduct(env, { sellingPrice: 300_000, currentStock: 10 })
    const customer = await createCustomer(env)
    await prepay(customer.id, 500_000)

    const order = await sellOnDebt(env.db, customer.id, product, 300_000, 1)
    expect(await orderDebt(order.id)).toMatchObject({
      amount: 300_000,
      paid: 0,
      reduced: 300_000,
      prepaymentApplied: 300_000,
      remaining: 0,
    })
    expect(await balance(customer.id)).toBe(-200_000)
    expect(
      await getOrderPrepaymentApplied({ db: env.db, storeId: env.storeId, orderId: order.id }),
    ).toBe(300_000)

    const orderItemId = order.items[0]!.id
    const ret = await createReturn({
      db: env.db,
      actor: ownerActor(),
      orderId: order.id,
      input: { items: [{ orderItemId, quantity: 1, reason: 'defective' }], note: null },
    })
    expect(ret).toMatchObject({
      totalAmount: 300_000,
      debtReductionAmount: 0,
      prepaymentRefundAmount: 300_000,
      refundAmount: 0,
    })
    const [saved] = await env.db.select().from(orderReturns).where(eq(orderReturns.id, ret.id))
    expect(saved).toMatchObject({ refundAmount: 0, prepaymentRefundAmount: 300_000 })

    // Khách lấy lại đủ 500k trả trước; khoản nợ của đơn không hoàn được lần hai
    expect(await balance(customer.id)).toBe(-500_000)
    expect((await orderDebt(order.id)).prepaymentApplied).toBe(0)
    const [prepayment] = await env.db
      .select()
      .from(debts)
      .where(eq(debts.customerId, customer.id))
      .then((rows) => rows.filter((row) => row.type === 'opening'))
    expect(prepayment).toMatchObject({ amount: -500_000, paid: 0, reduced: 0, remaining: -500_000 })
  })

  it('đơn trả một phần tiền mặt, phần cấn trả trước, còn nợ: hoàn nợ trước, rồi trả trước, dư mới là tiền mặt', async () => {
    const product = await createProduct(env, { sellingPrice: 100_000, currentStock: 10 })
    const customer = await createCustomer(env, { debtLimit: 1_000_000 })
    await prepay(customer.id, 250_000)

    // Đơn 500k: 100k tiền mặt, 400k ghi nợ, trong đó 250k cấn trả trước, còn nợ 150k
    const order = await sellOnDebt(env.db, customer.id, product, 100_000, 5, 100_000)
    expect(await orderDebt(order.id)).toMatchObject({
      amount: 400_000,
      reduced: 250_000,
      prepaymentApplied: 250_000,
      remaining: 150_000,
    })

    const orderItemId = order.items[0]!.id
    const ret = await createReturn({
      db: env.db,
      actor: ownerActor(),
      orderId: order.id,
      input: { items: [{ orderItemId, quantity: 4, reason: 'defective' }], note: null },
    })
    expect(ret).toMatchObject({
      totalAmount: 400_000,
      debtReductionAmount: 150_000,
      prepaymentRefundAmount: 250_000,
      refundAmount: 0,
    })
    expect(await balance(customer.id)).toBe(-250_000)

    // Trả nốt 1 cái: không còn nợ, không còn trả trước để hoàn, nên hoàn tiền mặt
    const last = await createReturn({
      db: env.db,
      actor: ownerActor(),
      orderId: order.id,
      input: { items: [{ orderItemId, quantity: 1, reason: 'defective' }], note: null },
    })
    expect(last).toMatchObject({
      debtReductionAmount: 0,
      prepaymentRefundAmount: 0,
      refundAmount: 100_000,
    })
    expect(await balance(customer.id)).toBe(-250_000)
  })

  it('giữ thứ tự khóa customers, debts, products khi hoàn trả trước', async () => {
    const product = await createProduct(env, { sellingPrice: 300_000, currentStock: 10 })
    const customer = await createCustomer(env)
    await prepay(customer.id, 500_000)
    const order = await sellOnDebt(env.db, customer.id, product, 300_000, 1)

    const queries: string[] = []
    const db = pgliteDrizzle(env.pglite, {
      schema,
      casing: 'snake_case',
      logger: { logQuery: (query) => queries.push(query) },
    }) as unknown as Db
    await createReturn({
      db,
      actor: ownerActor(),
      orderId: order.id,
      input: {
        items: [{ orderItemId: order.items[0]!.id, quantity: 1, reason: 'defective' }],
        note: null,
      },
    })
    // Thứ tự khóa chung (TIEN-103): lần khóa đầu mỗi bảng đi customers, debts, products
    const LOCK_RANK = ['customers', 'debts', 'products', 'product_variants']
    const seen: string[] = []
    for (const q of queries) {
      for (const table of LOCK_RANK) {
        const locks =
          new RegExp(`from "${table}"[\\s\\S]*for update`, 'i').test(q) ||
          new RegExp(`^update "${table}"`, 'i').test(q)
        if (locks && !seen.includes(table)) seen.push(table)
      }
    }
    expect(seen.slice(0, 3)).toEqual(['customers', 'debts', 'products'])
  })
})

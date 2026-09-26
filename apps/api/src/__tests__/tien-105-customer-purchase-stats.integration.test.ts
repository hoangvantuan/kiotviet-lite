import { Hono } from 'hono'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createCustomersRoutes } from '../routes/customers.routes.js'
import { createOrdersRoutes } from '../routes/orders.routes.js'
import { expectDebtLedgerConsistent } from './helpers/debt-ledger.js'
import { createCustomer } from './helpers/factories.js'
import { expectInvariantsClean } from './helpers/invariants.js'
import { sell, stockedProduct } from './helpers/sell.js'
import { createTestEnv, type SeededUser, type TestEnv } from './helpers/test-env.js'

// TIEN-105: "Tổng mua" và "Số đơn" của khách tính từ đơn còn hiệu lực (hoàn thành, trả một phần),
// tổng mua trừ phần đã trả. Đơn hủy và đơn trả hết không tính.

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
  app.route('/customers', createCustomersRoutes({ db: env.db }))
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

async function stats(customerId: string) {
  const detail = await call('GET', `/customers/${customerId}`, env.owner)
  expect(detail.status).toBe(200)
  const list = await call('GET', '/customers', env.owner)
  const row = list.body.data.find((c: { id: string }) => c.id === customerId)
  // Danh sách và chi tiết dùng chung một cách tính
  expect({ total: row.totalPurchased, count: row.purchaseCount }).toEqual({
    total: detail.body.data.totalPurchased,
    count: detail.body.data.purchaseCount,
  })
  return { total: detail.body.data.totalPurchased, count: detail.body.data.purchaseCount }
}

describe('TIEN-105: tổng mua và số đơn của khách', () => {
  it('đúng sau bán, trả một phần, trả hết và hủy', async () => {
    const product = await stockedProduct(env)
    const customer = await createCustomer(env, { debtLimit: 10_000_000 })
    expect(await stats(customer.id)).toEqual({ total: 0, count: 0 })

    const a = await sell(env, [{ product, quantity: 3 }], {
      customerId: customer.id,
      paymentMethod: 'cash',
    })
    const b = await sell(env, [{ product, quantity: 2 }], { customerId: customer.id })
    const c = await sell(env, [{ product, quantity: 1 }], {
      customerId: customer.id,
      paymentMethod: 'cash',
    })
    expect(await stats(customer.id)).toEqual({ total: 600_000, count: 3 })

    // Trả một phần đơn A: đơn vẫn còn hiệu lực, tổng mua trừ phần trả
    const partial = await call('POST', `/orders/${a.id}/returns`, env.owner, {
      items: [{ orderItemId: a.items[0]!.id, quantity: 1, reason: 'defective' }],
    })
    expect(partial.status, JSON.stringify(partial.body)).toBe(201)
    expect(await stats(customer.id)).toEqual({ total: 500_000, count: 3 })

    // Trả hết đơn C: không còn là đơn mua
    const full = await call('POST', `/orders/${c.id}/returns`, env.owner, {
      items: [{ orderItemId: c.items[0]!.id, quantity: 1, reason: 'defective' }],
    })
    expect(full.status, JSON.stringify(full.body)).toBe(201)
    expect(await stats(customer.id)).toEqual({ total: 400_000, count: 2 })

    // Hủy đơn B: bỏ khỏi tổng mua và số đơn
    const cancel = await call('POST', `/orders/${b.id}/cancel`, env.owner, { reason: 'Nhập nhầm' })
    expect(cancel.status, JSON.stringify(cancel.body)).toBe(200)
    expect(await stats(customer.id)).toEqual({ total: 200_000, count: 1 })
  })

  it('chỉ tính đơn của đúng khách', async () => {
    const product = await stockedProduct(env)
    const mine = await createCustomer(env, { debtLimit: 10_000_000 })
    const other = await createCustomer(env, { debtLimit: 10_000_000 })
    await sell(env, [{ product, quantity: 1 }], { customerId: mine.id, paymentMethod: 'cash' })
    await sell(env, [{ product, quantity: 4 }], { customerId: other.id, paymentMethod: 'cash' })
    await sell(env, [{ product, quantity: 2 }])

    expect(await stats(mine.id)).toEqual({ total: 100_000, count: 1 })
    expect(await stats(other.id)).toEqual({ total: 400_000, count: 1 })
  })
})

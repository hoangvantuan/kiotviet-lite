import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { orderItems, orders, products, suppliers } from '@kiotviet-lite/shared'

import { createOrdersRoutes } from '../routes/orders.routes.js'
import { createPurchaseOrdersRoutes } from '../routes/purchase-orders.routes.js'
import { createSuppliersRoutes } from '../routes/suppliers.routes.js'
import { expectDebtLedgerConsistent } from './helpers/debt-ledger.js'
import { createProduct } from './helpers/factories.js'
import { expectInvariantsClean } from './helpers/invariants.js'
import { sell, stockedProduct } from './helpers/sell.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

// Mục 8: trả hàng trên chứng từ có cả chiết khấu dòng và chiết khấu cấp chứng từ.
// Đơn bán: tiền hoàn theo giá trị ròng của dòng (ADR-0010). Phiếu nhập: giá trị trả theo số tiền
// thực trả của dòng, chiết khấu phiếu phân bổ theo tỷ lệ thành tiền dòng (quyết định 8, VAS 02).

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
  app.route('/purchase-orders', createPurchaseOrdersRoutes({ db: env.db }))
  app.route('/suppliers', createSuppliersRoutes({ db: env.db }))
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

async function call(method: string, path: string, body?: unknown): Promise<Resp> {
  const res = await app.request(path, {
    method,
    headers: { ...env.owner.authHeader, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  const parsed = { status: res.status, body: text ? JSON.parse(text) : undefined }
  expect(parsed.status, `${method} ${path}: ${text}`).toBeLessThan(300)
  return parsed
}

describe('Mục 8: trả hàng một phần đơn có chiết khấu dòng và chiết khấu đơn', () => {
  it('hoàn theo giá trị ròng từng dòng, trả hết cộng lại đúng tổng đơn', async () => {
    const milk = await stockedProduct(env, 100, 'Sữa Ensure')
    const cake = await stockedProduct(env, 100, 'Bánh Cosy')
    // Sữa 2 × 100.000 chiết khấu dòng 20.000 = 180.000; bánh 1 × 100.000.
    // Chiết khấu đơn 28.000 phân bổ 180:100 → sữa 18.000, bánh 10.000. Tổng đơn 252.000.
    const order = await sell(
      env,
      [
        { product: milk, quantity: 2, discountAmount: 20_000 },
        { product: cake, quantity: 1 },
      ],
      { orderDiscount: 28_000, paymentMethod: 'cash' },
    )
    expect(order.total).toBe(252_000)
    const items = await env.db.select().from(orderItems).where(eq(orderItems.orderId, order.id))
    const milkItem = items.find((i) => i.productId === milk.id)!
    const cakeItem = items.find((i) => i.productId === cake.id)!
    expect(Number(milkItem.orderDiscountAllocated)).toBe(18_000)
    expect(Number(cakeItem.orderDiscountAllocated)).toBe(10_000)

    // Trả 1 sữa: (180.000 - 18.000) / 2 = 81.000
    const first = await call('POST', `/orders/${order.id}/returns`, {
      items: [{ orderItemId: milkItem.id, quantity: 1, reason: 'defective' }],
    })
    expect(first.body.data.totalAmount).toBe(81_000)
    expect(first.body.data.refundAmount).toBe(81_000)
    const [partial] = await env.db.select().from(orders).where(eq(orders.id, order.id))
    expect(partial!.status).toBe('partial_return')

    // Trả nốt: sữa 81.000 + bánh 90.000, tổng các phiếu bằng đúng tổng đơn
    const rest = await call('POST', `/orders/${order.id}/returns`, {
      items: [
        { orderItemId: milkItem.id, quantity: 1, reason: 'defective' },
        { orderItemId: cakeItem.id, quantity: 1, reason: 'defective' },
      ],
    })
    expect(rest.body.data.totalAmount).toBe(171_000)
    expect(first.body.data.totalAmount + rest.body.data.totalAmount).toBe(order.total)
    const [done] = await env.db.select().from(orders).where(eq(orders.id, order.id))
    expect(done!.status).toBe('full_return')
  })
})

describe('Mục 8: trả hàng nhập của phiếu có chiết khấu dòng và chiết khấu phiếu', () => {
  it('giá trị trả theo số tiền thực trả của dòng, giảm công nợ nhà cung cấp đúng số đó', async () => {
    const a = await createProduct(env, { name: 'Sữa Ensure', currentStock: 0, costPrice: null })
    const b = await createProduct(env, { name: 'Bánh Cosy', currentStock: 0, costPrice: null })
    const supplier = (await call('POST', '/suppliers', { name: 'Vinamilk' })).body.data as {
      id: string
    }
    // A: 10 × 20.000 chiết khấu dòng 20.000 = 180.000; B: 5 × 40.000 = 200.000.
    // Chiết khấu phiếu 38.000 phân bổ 180:200 → A 18.000, B 20.000.
    // Thực trả A 162.000 (16.200 một cái), B 180.000 (36.000 một cái). Tổng phiếu 342.000.
    const po = (
      await call('POST', '/purchase-orders', {
        supplierId: supplier.id,
        items: [
          {
            productId: a.id,
            quantity: 10,
            unitPrice: 20_000,
            discountType: 'amount',
            discountValue: 20_000,
          },
          { productId: b.id, quantity: 5, unitPrice: 40_000 },
        ],
        discountTotalType: 'amount',
        discountTotalValue: 38_000,
      })
    ).body.data as {
      id: string
      totalAmount: number
      items: Array<{ id: string; productId: string; orderDiscountAllocated: number }>
    }
    expect(po.totalAmount).toBe(342_000)
    const itemA = po.items.find((i) => i.productId === a.id)!
    const itemB = po.items.find((i) => i.productId === b.id)!
    expect([itemA.orderDiscountAllocated, itemB.orderDiscountAllocated]).toEqual([18_000, 20_000])

    const supplierDebt = async () =>
      (
        await env.db
          .select({ debt: suppliers.currentDebt })
          .from(suppliers)
          .where(eq(suppliers.id, supplier.id))
      )[0]!.debt
    const costOf = async (id: string) =>
      (await env.db.select().from(products).where(eq(products.id, id)))[0]!.costPrice
    expect(await supplierDebt()).toBe(342_000)
    expect(await costOf(a.id)).toBe(16_200)

    // Trả 3 cái A: 3 × 16.200 = 48.600, không phải 3 × 20.000
    const first = await call('POST', `/purchase-orders/${po.id}/returns`, {
      items: [{ purchaseOrderItemId: itemA.id, quantity: 3 }],
    })
    expect(first.body.data.totalAmount).toBe(48_600)
    expect(first.body.data.debtReductionAmount).toBe(48_600)
    expect(await supplierDebt()).toBe(293_400)
    // Trả đúng giá vốn lô nhập nên giá vốn phần còn lại không đổi
    expect(await costOf(a.id)).toBe(16_200)

    // Trả hết B và phần còn lại của A: tổng các phiếu trả bằng đúng tổng phiếu nhập
    const rest = await call('POST', `/purchase-orders/${po.id}/returns`, {
      items: [
        { purchaseOrderItemId: itemA.id, quantity: 7 },
        { purchaseOrderItemId: itemB.id, quantity: 5 },
      ],
    })
    expect(rest.body.data.totalAmount).toBe(113_400 + 180_000)
    expect(first.body.data.totalAmount + rest.body.data.totalAmount).toBe(po.totalAmount)
    expect(await supplierDebt()).toBe(0)
  })
})

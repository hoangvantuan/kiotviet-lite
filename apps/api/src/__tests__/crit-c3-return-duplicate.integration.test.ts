import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { orderItems, orders, products } from '@kiotviet-lite/shared'

import { createOrdersRoutes } from '../routes/orders.routes.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.ACCESS_TOKEN_TTL_SECONDS = '900'
  process.env.REFRESH_TOKEN_TTL_SECONDS = '604800'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

describe('CRIT C3: chặn trùng orderItemId trong cùng phiếu trả', () => {
  let base: TestEnv
  let app: ReturnType<typeof createOrdersRoutes>
  let orderId: string
  let orderItemId: string

  beforeEach(async () => {
    base = await createTestEnv()
    app = createOrdersRoutes({ db: base.db })

    const [product] = await base.db
      .insert(products)
      .values({
        storeId: base.storeId,
        name: 'SP A',
        sku: 'SKU-A',
        currentStock: 100,
        minStock: 5,
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
        orderNumber: 'HD-260618-0001',
        userId: base.owner.id,
        subtotal: 500000,
        discountAmount: 0,
        total: 500000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 500000,
        change: 0,
        status: 'completed',
      })
      .returning()

    const [oi] = await base.db
      .insert(orderItems)
      .values({
        orderId: order!.id,
        productId: product!.id,
        productName: 'SP A',
        unit: 'cái',
        unitPrice: 100000,
        quantity: 5,
        discountAmount: 0,
        lineTotal: 500000,
      })
      .returning()

    orderId = order!.id
    orderItemId = oi!.id
  })

  async function createReturn(body: unknown) {
    return app.request(`/${orderId}/returns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...base.owner.authHeader },
      body: JSON.stringify(body),
    })
  }

  it('trả 1 dòng hợp lệ → 201', async () => {
    const res = await createReturn({
      items: [{ orderItemId, quantity: 2, reason: 'defective' }],
    })
    expect(res.status).toBe(201)
  })

  it('2 dòng trùng orderItemId → 400 (chống hoàn tiền/cộng kho gấp đôi)', async () => {
    const res = await createReturn({
      items: [
        { orderItemId, quantity: 5, reason: 'defective' },
        { orderItemId, quantity: 5, reason: 'defective' },
      ],
    })
    expect(res.status).toBe(400)
  })
})

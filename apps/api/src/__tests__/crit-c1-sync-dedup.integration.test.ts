import { and, eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { orders, products } from '@kiotviet-lite/shared'

import { createSyncRoutes } from '../routes/sync.routes.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.ACCESS_TOKEN_TTL_SECONDS = '900'
  process.env.REFRESH_TOKEN_TTL_SECONDS = '604800'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

describe('CRIT C1: chống tạo đơn offline đôi (dedup theo clientId)', () => {
  let base: TestEnv
  let app: ReturnType<typeof createSyncRoutes>
  let productId: string

  const clientId = '123e4567-e89b-12d3-a456-426614174999'

  beforeEach(async () => {
    base = await createTestEnv()
    app = createSyncRoutes({ db: base.db })

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
    productId = product!.id
  })

  function pushBody(cid: string) {
    return {
      orders: [
        {
          clientId: cid,
          createdAt: '2026-06-18T10:00:00.000Z',
          orderData: {
            subtotal: 200000,
            discountAmount: 0,
            total: 200000,
            paymentMethod: 'cash',
            paymentStatus: 'paid',
            cashAmount: 200000,
            items: [
              {
                productId,
                productName: 'SP A',
                unit: 'cái',
                unitPrice: 100000,
                quantity: 2,
                discountAmount: 0,
                lineTotal: 200000,
              },
            ],
          },
        },
      ],
    }
  }

  async function push(cid: string) {
    return app.request('/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...base.owner.authHeader },
      body: JSON.stringify(pushBody(cid)),
    })
  }

  async function stockOf(id: string) {
    const [row] = await base.db
      .select({ stock: products.currentStock })
      .from(products)
      .where(eq(products.id, id))
    return row!.stock
  }

  it('push lần đầu → synced, trừ kho đúng 1 lần', async () => {
    const res = await push(clientId)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { results: Array<{ status: string }> } }
    expect(body.data.results[0]!.status).toBe('synced')
    expect(await stockOf(productId)).toBe(98)
  })

  it('push lại cùng clientId → duplicate, KHÔNG trừ kho lần 2, chỉ 1 đơn', async () => {
    await push(clientId)
    const res2 = await push(clientId)
    expect(res2.status).toBe(200)
    const body2 = (await res2.json()) as { data: { results: Array<{ status: string }> } }
    expect(body2.data.results[0]!.status).toBe('duplicate')

    const rows = await base.db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.storeId, base.storeId), eq(orders.clientId, clientId)))
    expect(rows.length).toBe(1)
    expect(await stockOf(productId)).toBe(98)
  })
})

import type { NotificationEvent, SendResult } from '@kiotviet-lite/notifications'
import { eq } from 'drizzle-orm'
import type { Hono } from 'hono'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { inventoryTransactions, products } from '@kiotviet-lite/shared'

import { createPosRoutes } from '../routes/pos.routes.js'
import { createStoreRoutes } from '../routes/store.routes.js'
import { createProduct, createStore, createUser } from './helpers/factories.js'
import { createTestEnv, type SeededUser, type TestEnv } from './helpers/test-env.js'

const notifyMock = vi.hoisted(() =>
  vi.fn<(db: unknown, event: NotificationEvent) => Promise<SendResult[]>>(async () => []),
)

vi.mock('@kiotviet-lite/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kiotviet-lite/notifications')>()),
  notify: notifyMock,
}))

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.ACCESS_TOKEN_TTL_SECONDS = '900'
  process.env.REFRESH_TOKEN_TTL_SECONDS = '604800'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

describe('Thông báo tồn kho âm khi bán hàng', () => {
  let env: TestEnv
  let pos: Hono
  let store: Hono

  beforeEach(async () => {
    notifyMock.mockClear()
    env = await createTestEnv()
    pos = createPosRoutes({ db: env.db })
    store = createStoreRoutes({ db: env.db })
  })

  afterEach(async () => {
    await env.close()
  })

  async function setAlert(enabled: boolean, actor = env.owner) {
    const res = await store.request('/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...actor.authHeader },
      body: JSON.stringify({ negativeStockAlertsEnabled: enabled }),
    })
    expect(res.status).toBe(200)
  }

  async function sell(product: typeof products.$inferSelect, actor: SeededUser) {
    const res = await pos.request('/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...actor.authHeader },
      body: JSON.stringify({
        subtotal: 100_000,
        discountAmount: 0,
        total: 100_000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 100_000,
        items: [
          {
            productId: product.id,
            productName: product.name,
            unitPrice: 100_000,
            quantity: 1,
            discountAmount: 0,
            lineTotal: 100_000,
          },
        ],
      }),
    })
    expect(res.status).toBe(201)
  }

  it('tắt chỉ bỏ qua thông báo; sổ giao dịch và tồn kho âm vẫn ghi; bật lại phát cảnh báo', async () => {
    const product = await createProduct(env, { currentStock: 0, costPrice: null })
    await setAlert(false)
    await sell(product, env.staff)
    expect(notifyMock).not.toHaveBeenCalled()
    const [first] = await env.db.select().from(products).where(eq(products.id, product.id))
    const firstLedger = await env.db
      .select()
      .from(inventoryTransactions)
      .where(eq(inventoryTransactions.productId, product.id))
    expect(first?.currentStock).toBe(-1)
    expect(
      firstLedger.map(({ type, quantity, stockAfter }) => ({ type, quantity, stockAfter })),
    ).toEqual([{ type: 'sale', quantity: -1, stockAfter: -1 }])

    await setAlert(true)
    await sell(product, env.staff)
    const [second] = await env.db.select().from(products).where(eq(products.id, product.id))
    const ledger = await env.db
      .select()
      .from(inventoryTransactions)
      .where(eq(inventoryTransactions.productId, product.id))
    expect(second?.currentStock).toBe(-2)
    expect(
      ledger.map(({ type, quantity, stockAfter }) => ({ type, quantity, stockAfter })),
    ).toEqual([
      { type: 'sale', quantity: -1, stockAfter: -1 },
      { type: 'sale', quantity: -1, stockAfter: -2 },
    ])
    expect(
      notifyMock.mock.calls.map(([, event]) => ({
        storeId: event.storeId,
        type: event.type,
        severity: event.severity,
      })),
    ).toEqual([{ storeId: env.storeId, type: 'stock.negative', severity: 'error' }])
  })

  it('cửa hàng B tiếp tục nhận cảnh báo mặc dù cửa hàng A đã tắt', async () => {
    const secondStore = await createStore(env)
    const sellerB = await createUser(env, { storeId: secondStore.id, role: 'staff' })
    const productB = await createProduct(env, {
      storeId: secondStore.id,
      currentStock: 0,
      costPrice: null,
    })
    await setAlert(false)
    await sell(productB, sellerB)
    expect(notifyMock.mock.calls.map(([, event]) => event.storeId)).toEqual([secondStore.id])
  })
})

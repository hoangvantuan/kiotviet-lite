import type { NotificationEvent, SendResult } from '@kiotviet-lite/notifications'
import { eq } from 'drizzle-orm'
import type { Hono } from 'hono'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { inventoryTransactions, orders, products, productVariants } from '@kiotviet-lite/shared'

import { createPosRoutes } from '../routes/pos.routes.js'
import { createStoreRoutes } from '../routes/store.routes.js'
import { createSyncRoutes } from '../routes/sync.routes.js'
import { createProduct, createVariant } from './helpers/factories.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

// POS-13: một cài đặt cửa hàng "cho bán vượt tồn kho", mặc định cho. Tắt thì đơn POS vượt tồn bị
// chặn với lỗi nêu rõ hàng và số còn; bật thì đơn vẫn tạo, tồn kho âm. Đơn ngoại tuyến vượt tồn khi
// tắt vẫn nhận (hàng đã giao) nhưng chờ chủ duyệt với vi phạm negative_stock_policy.

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

let env: TestEnv
let pos: Hono
let store: Hono
let sync: Hono

beforeEach(async () => {
  env = await createTestEnv()
  pos = createPosRoutes({ db: env.db })
  store = createStoreRoutes({ db: env.db })
  sync = createSyncRoutes({ db: env.db })
})

afterEach(async () => {
  await env.close()
})

async function setAllow(allow: boolean) {
  const res = await store.request('/', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...env.owner.authHeader },
    body: JSON.stringify({ allowNegativeStock: allow }),
  })
  expect(res.status).toBe(200)
  const body = (await res.json()) as { data: { allowNegativeStock: boolean } }
  expect(body.data.allowNegativeStock).toBe(allow)
}

interface Line {
  productId: string
  variantId?: string
  variantName?: string
  quantity: number
}

async function sell(lines: Line[]) {
  const unitPrice = 100_000
  const total = lines.reduce((s, l) => s + l.quantity * unitPrice, 0)
  const res = await pos.request('/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...env.staff.authHeader },
    body: JSON.stringify({
      subtotal: total,
      discountAmount: 0,
      total,
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      cashAmount: total,
      items: lines.map((l) => ({
        productId: l.productId,
        variantId: l.variantId ?? null,
        productName: 'Nước suối',
        variantName: l.variantName ?? null,
        unitPrice,
        quantity: l.quantity,
        discountAmount: 0,
        lineTotal: l.quantity * unitPrice,
      })),
    }),
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, body: (await res.json()) as any }
}

async function stockOf(productId: string) {
  const [row] = await env.db.select().from(products).where(eq(products.id, productId))
  return row?.currentStock
}

describe('POS-13: cài đặt bán vượt tồn kho', () => {
  it('mặc định cho bán âm: tồn 1 bán 3 vẫn tạo đơn, tồn còn -2', async () => {
    const product = await createProduct(env, {
      currentStock: 1,
      sellingPrice: 100_000,
      costPrice: 50_000,
    })
    const res = await sell([{ productId: product.id, quantity: 3 }])
    expect(res.status).toBe(201)
    expect(await stockOf(product.id)).toBe(-2)
  })

  it('tắt bán âm: tồn 1 bán 3 bị chặn, nêu rõ số còn, không ghi sổ kho', async () => {
    await setAllow(false)
    const product = await createProduct(env, {
      currentStock: 1,
      sellingPrice: 100_000,
      costPrice: 50_000,
    })
    const res = await sell([{ productId: product.id, quantity: 3 }])
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('BUSINESS_RULE_VIOLATION')
    expect(res.body.error.message).toBe(`Không đủ tồn kho: Nước suối chỉ còn 1 ${product.unit}`)
    expect(res.body.error.details).toMatchObject({
      reason: 'insufficient_stock',
      itemIndex: 0,
      productId: product.id,
      available: 1,
    })
    expect(await stockOf(product.id)).toBe(1)
    const ledger = await env.db
      .select()
      .from(inventoryTransactions)
      .where(eq(inventoryTransactions.productId, product.id))
    expect(ledger).toHaveLength(0)

    const ok = await sell([{ productId: product.id, quantity: 1 }])
    expect(ok.status).toBe(201)
    expect(await stockOf(product.id)).toBe(0)
  })

  it('tắt bán âm: cộng mọi dòng cùng hàng trong đơn', async () => {
    await setAllow(false)
    const product = await createProduct(env, {
      currentStock: 1,
      sellingPrice: 100_000,
      costPrice: 50_000,
    })
    const res = await sell([
      { productId: product.id, quantity: 1 },
      { productId: product.id, quantity: 1 },
    ])
    expect(res.status).toBe(422)
    expect(res.body.error.details).toMatchObject({ itemIndex: 1, available: 0 })
    expect(await stockOf(product.id)).toBe(1)
  })

  it('tắt bán âm: kiểm theo tồn của biến thể', async () => {
    await setAllow(false)
    const product = await createProduct(env, {
      withVariants: true,
      sellingPrice: 100_000,
      costPrice: 50_000,
    })
    const variant = await createVariant(env, product.id, {
      attribute1Value: 'Đỏ',
      stockQuantity: 1,
      sellingPrice: 100_000,
      costPrice: 50_000,
    })
    const res = await sell([
      { productId: product.id, variantId: variant.id, variantName: 'Đỏ', quantity: 3 },
    ])
    expect(res.status).toBe(422)
    expect(res.body.error.message).toContain('Nước suối (Đỏ) chỉ còn 1')
    const [row] = await env.db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, variant.id))
    expect(row?.stockQuantity).toBe(1)
  })
})

describe('POS-13: đơn ngoại tuyến vượt tồn', () => {
  async function pushOffline(productId: string, quantity: number) {
    const unitPrice = 100_000
    const total = quantity * unitPrice
    const res = await sync.request('/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...env.staff.authHeader },
      body: JSON.stringify({
        orders: [
          {
            clientId: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            orderData: {
              subtotal: total,
              discountAmount: 0,
              total,
              paymentMethod: 'cash',
              paymentStatus: 'paid',
              cashAmount: total,
              items: [
                {
                  productId,
                  productName: 'Nước suối',
                  unitPrice,
                  quantity,
                  discountAmount: 0,
                  lineTotal: total,
                },
              ],
            },
          },
        ],
      }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: { results: Array<{ status: string; serverId?: string; reviewStatus?: string }> }
    }
    return body.data.results[0]!
  }

  it('tắt bán âm: vẫn nhận đơn, tồn âm, chờ duyệt với vi phạm negative_stock_policy', async () => {
    await setAllow(false)
    const product = await createProduct(env, {
      currentStock: 1,
      unit: 'chai',
      sellingPrice: 100_000,
      costPrice: 50_000,
    })
    const result = await pushOffline(product.id, 3)
    expect(result.status).toBe('synced')
    expect(result.reviewStatus).toBe('pending_review')
    expect(await stockOf(product.id)).toBe(-2)
    const [row] = await env.db.select().from(orders).where(eq(orders.id, result.serverId!))
    expect(row!.reviewStatus).toBe('pending_review')
    expect(row!.policyViolations).toEqual([
      {
        code: 'negative_stock_policy',
        message: 'Bán vượt tồn kho khi cửa hàng không cho bán âm: Nước suối còn 1 chai, bán 3 chai',
        requiredPermissions: [],
      },
    ])
  })

  it('cho bán âm (mặc định): đơn ngoại tuyến vượt tồn không cần duyệt', async () => {
    const product = await createProduct(env, {
      currentStock: 1,
      sellingPrice: 100_000,
      costPrice: 50_000,
    })
    const result = await pushOffline(product.id, 3)
    expect(result.status).toBe('synced')
    expect(result.reviewStatus).toBeUndefined()
  })
})

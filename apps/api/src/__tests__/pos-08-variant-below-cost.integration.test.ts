import type { NotificationEvent, SendResult } from '@kiotviet-lite/notifications'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { customerPrices, orders } from '@kiotviet-lite/shared'

import { createPosRoutes } from '../routes/pos.routes.js'
import { createSyncRoutes } from '../routes/sync.routes.js'
import { resetApprovalGuard } from '../services/approval-guard.js'
import { createCustomer, createProduct, createVariant } from './helpers/factories.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

// POS-08, R1: giá đặc biệt theo biến thể vẫn qua kiểm dưới giá vốn, theo giá vốn của biến thể.
// Giá riêng khách của biến thể Đỏ 85.000, giá vốn biến thể 90.000 (giá vốn sản phẩm chỉ 50.000).
// Biến thể Xanh (giá vốn 60.000) lấy giá riêng theo sản phẩm 80.000.

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

function buildApp(env: TestEnv) {
  const app = new Hono()
  app.route('/api/v1/pos', createPosRoutes({ db: env.db }))
  app.route('/api/v1/sync', createSyncRoutes({ db: env.db }))
  return app
}

let env: TestEnv
let app: ReturnType<typeof buildApp>
let productId: string
let variantId: string
let otherVariantId: string
let customerId: string

async function post(path: string, header: { Authorization: string }, body: unknown) {
  const res = await app.request(path, {
    method: 'POST',
    headers: { ...header, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, body: (text ? JSON.parse(text) : undefined) as any }
}

function orderFor(opts: {
  variantId: string
  unitPrice: number
  approval?: Record<string, unknown>
}) {
  return {
    customerId,
    subtotal: opts.unitPrice,
    discountType: null,
    discountValue: 0,
    discountAmount: 0,
    total: opts.unitPrice,
    paymentMethod: 'cash',
    paymentStatus: 'paid',
    cashAmount: opts.unitPrice,
    debtLimitOverridden: false,
    note: null,
    items: [
      {
        productId,
        variantId: opts.variantId,
        productName: 'Áo thun',
        variantName: 'Đỏ',
        unit: 'cái',
        unitPrice: opts.unitPrice,
        quantity: 1,
        discountType: null,
        discountValue: 0,
        discountAmount: 0,
        lineTotal: opts.unitPrice,
        note: null,
        unitConversionId: null,
        originalPrice: null,
        priceOverride: false,
        priceOverrideReason: null,
        priceOverridePinUsed: false,
      },
    ],
    ...opts.approval,
  }
}

beforeAll(async () => {
  env = await createTestEnv()
  app = buildApp(env)
  const product = await createProduct(env, {
    name: 'Áo thun',
    sellingPrice: 100_000,
    costPrice: 50_000,
    withVariants: true,
  })
  productId = product.id
  const red = await createVariant(env, product.id, { sellingPrice: 120_000, costPrice: 90_000 })
  const blue = await createVariant(env, product.id, { sellingPrice: 120_000, costPrice: 60_000 })
  variantId = red.id
  otherVariantId = blue.id
  const customer = await createCustomer(env)
  customerId = customer.id
  await env.db.insert(customerPrices).values([
    { storeId: env.storeId, customerId, productId, variantId: null, price: 80_000 },
    { storeId: env.storeId, customerId, productId, variantId: red.id, price: 85_000 },
  ])
})

afterAll(async () => {
  await env.close()
})

beforeEach(() => {
  notifyMock.mockClear()
  resetApprovalGuard()
})

describe('POS-08, R1: giá đặc biệt dưới giá vốn biến thể', () => {
  it('nhân viên bán giá riêng dưới giá vốn biến thể: bị chặn, chỉ được báo cần duyệt, không lộ giá vốn', async () => {
    const res = await post(
      '/api/v1/pos/orders',
      env.staff.authHeader,
      orderFor({ variantId, unitPrice: 85_000 }),
    )
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.details.requiredPermissions).toEqual(['pos.editPrice'])
    expect(JSON.stringify(res.body)).not.toContain('90')
  })

  it('quản lý xem được giá vốn: được báo cần quyền bán dưới giá vốn', async () => {
    const res = await post(
      '/api/v1/pos/orders',
      env.manager.authHeader,
      orderFor({ variantId, unitPrice: 85_000 }),
    )
    expect(res.status).toBe(400)
    expect(res.body.error.details.requiredPermissions).toEqual(['pos.editPriceBelowCost'])
  })

  it('PIN quản lý không đủ quyền, PIN chủ cửa hàng thì bán được', async () => {
    const byManager = await post(
      '/api/v1/pos/orders',
      env.staff.authHeader,
      orderFor({
        variantId,
        unitPrice: 85_000,
        approval: { priceApproverId: env.manager.id, priceOverridePin: env.manager.pin },
      }),
    )
    expect(byManager.status).toBe(403)

    const byOwner = await post(
      '/api/v1/pos/orders',
      env.staff.authHeader,
      orderFor({
        variantId,
        unitPrice: 85_000,
        approval: { priceApproverId: env.owner.id, priceOverridePin: env.owner.pin },
      }),
    )
    expect(byOwner.status).toBe(201)
  })

  it('biến thể có giá vốn thấp hơn giá riêng: không cần duyệt', async () => {
    const res = await post(
      '/api/v1/pos/orders',
      env.staff.authHeader,
      orderFor({ variantId: otherVariantId, unitPrice: 80_000 }),
    )
    expect(res.status).toBe(201)
  })

  it('đơn ngoại tuyến bán giá riêng dưới giá vốn biến thể: vẫn nhận, chờ chủ duyệt', async () => {
    const res = await post('/api/v1/sync/push', env.staff.authHeader, {
      clientId: 'aaaaaaaa-2222-4444-8888-000000000001',
      orders: [
        {
          clientId: 'bbbbbbbb-2222-4444-8888-000000000001',
          createdAt: new Date().toISOString(),
          orderData: orderFor({ variantId, unitPrice: 85_000 }),
        },
      ],
    })
    expect(res.status).toBe(200)
    const result = res.body.data.results[0]
    expect(result.status).toBe('synced')
    expect(result.reviewStatus).toBe('pending_review')
    const [row] = await env.db.select().from(orders).where(eq(orders.id, result.serverId))
    expect(row!.policyViolations?.map((v) => v.code)).toEqual(['below_cost_unapproved'])
  })
})

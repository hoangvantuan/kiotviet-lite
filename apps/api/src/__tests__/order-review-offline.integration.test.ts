import type { NotificationEvent, SendResult } from '@kiotviet-lite/notifications'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { auditLogs, customers, orders, products, users } from '@kiotviet-lite/shared'

import { createCustomersRoutes } from '../routes/customers.routes.js'
import { createOrdersRoutes } from '../routes/orders.routes.js'
import { createPosRoutes } from '../routes/pos.routes.js'
import { createSyncRoutes } from '../routes/sync.routes.js'
import { createUsersRoutes } from '../routes/users.routes.js'
import { resetApprovalGuard } from '../services/approval-guard.js'
import { createCustomer, createProduct, createStore, createUser } from './helpers/factories.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

// ADR-0009 (vòng sửa PR #49): đơn ngoại tuyến vi phạm chính sách vẫn được nhận nhưng chờ chủ duyệt,
// cùng các lớp chặn dò PIN người duyệt. Mỗi ca gọi thẳng API như máy khách tự viết.

// emitEvent chạy kiểu fire-and-forget: mock notify để kiểm được sự kiện và không treo PGlite
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
  app.route('/api/v1/orders', createOrdersRoutes({ db: env.db }))
  app.route('/api/v1/customers', createCustomersRoutes({ db: env.db }))
  app.route('/api/v1/users', createUsersRoutes({ db: env.db }))
  return app
}

type App = ReturnType<typeof buildApp>

interface Resp {
  status: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
}

async function call(
  app: App,
  method: string,
  path: string,
  authHeader: { Authorization: string },
  body?: unknown,
): Promise<Resp> {
  const res = await app.request(path, {
    method,
    headers: { ...authHeader, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : undefined }
}

const ENSURE_PRICE = 450_000
const ENSURE_COST = 380_000

interface LineOpts {
  unitPrice: number
  originalPrice?: number | null
  priceOverride?: boolean
  discountType?: 'percent' | 'amount' | null
  discountValue?: number
  discountAmount?: number
}

let env: TestEnv
let app: App
let ensureId: string

function line(o: LineOpts) {
  const discountAmount = o.discountAmount ?? 0
  return {
    productId: ensureId,
    variantId: null,
    productName: 'Sữa Ensure',
    variantName: null,
    unit: 'hộp',
    unitPrice: o.unitPrice,
    quantity: 1,
    discountType: o.discountType ?? null,
    discountValue: o.discountValue ?? 0,
    discountAmount,
    lineTotal: o.unitPrice - discountAmount,
    note: null,
    unitConversionId: null,
    originalPrice: o.originalPrice ?? null,
    priceOverride: o.priceOverride ?? false,
    priceOverrideReason: o.priceOverride ? 'Khách quen' : null,
    priceOverridePinUsed: false,
  }
}

interface OrderOpts {
  item: ReturnType<typeof line>
  paymentMethod?: 'cash' | 'debt'
  customerId?: string | null
  debtAmount?: number
  discountAmount?: number
  extra?: Record<string, unknown>
}

function order(o: OrderOpts) {
  const subtotal = o.item.lineTotal
  const discountAmount = o.discountAmount ?? 0
  const total = subtotal - discountAmount
  const paymentMethod = o.paymentMethod ?? 'cash'
  const debt = o.debtAmount ?? 0
  return {
    customerId: o.customerId ?? null,
    subtotal,
    discountType: null,
    discountValue: 0,
    discountAmount,
    total,
    paymentMethod,
    paymentStatus: debt === 0 ? 'paid' : 'unpaid',
    cashAmount: paymentMethod === 'cash' ? total : 0,
    ...(o.debtAmount !== undefined ? { debtAmount: o.debtAmount } : {}),
    debtLimitOverridden: false,
    note: null,
    items: [o.item],
    ...o.extra,
  }
}

let seq = 0
function uuidFor(prefix: string) {
  seq++
  return `${prefix}-2222-4444-8888-${String(seq).padStart(12, '0')}`
}

async function push(authHeader: { Authorization: string }, orderData: Record<string, unknown>) {
  const res = await call(app, 'POST', '/api/v1/sync/push', authHeader, {
    clientId: uuidFor('aaaaaaaa'),
    orders: [{ clientId: uuidFor('bbbbbbbb'), createdAt: new Date().toISOString(), orderData }],
  })
  expect(res.status).toBe(200)
  return res.body.data.results[0] as {
    status: string
    serverId?: string
    reviewStatus?: string
    error?: { code: string; message: string }
  }
}

async function auditFor(targetId: string, action: string) {
  return env.db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.targetId, targetId), eq(auditLogs.action, action)))
}

async function orderRow(id: string) {
  const [row] = await env.db.select().from(orders).where(eq(orders.id, id))
  return row!
}

function violationEvents() {
  return notifyMock.mock.calls
    .map(([, event]) => event)
    .filter((e) => e.type === 'order.policy_violation_offline')
}

/** Kiểm chung cho mọi đơn vi phạm: chờ duyệt, có audit gom vi phạm và thông báo mức error */
async function expectPendingReview(
  result: Awaited<ReturnType<typeof push>>,
  codes: string[],
  seller: { id: string; role: string },
) {
  expect(result.status).toBe('synced')
  expect(result.reviewStatus).toBe('pending_review')
  const row = await orderRow(result.serverId!)
  expect(row.reviewStatus).toBe('pending_review')
  expect(row.policyViolations?.map((v) => v.code)).toEqual(codes)

  const [log] = await auditFor(result.serverId!, 'order.policy_violation_offline')
  const changes = log?.changes as Record<string, unknown>
  expect(changes.sellerId).toBe(seller.id)
  expect(changes.sellerRole).toBe(seller.role)
  expect(changes.device).toBeDefined()
  expect((changes.violations as Array<{ code: string }>).map((v) => v.code)).toEqual(codes)

  const events = violationEvents()
  expect(events).toHaveLength(1)
  expect(events[0]).toMatchObject({ storeId: env.storeId, severity: 'error' })
}

beforeAll(async () => {
  env = await createTestEnv()
  app = buildApp(env)
  const ensure = await createProduct(env, {
    name: 'Sữa Ensure',
    sellingPrice: ENSURE_PRICE,
    costPrice: ENSURE_COST,
    currentStock: 1_000,
  })
  ensureId = ensure.id
})

afterAll(async () => {
  await env.close()
})

beforeEach(() => {
  notifyMock.mockClear()
  resetApprovalGuard()
})

describe('Blocker 1: /sync/push đơn vi phạm chính sách vào trạng thái chờ chủ duyệt', () => {
  it('giảm 100% một dòng không ai duyệt → chờ duyệt, vẫn trừ kho', async () => {
    const [before] = await env.db.select().from(products).where(eq(products.id, ensureId))
    const result = await push(
      env.staff.authHeader,
      order({
        item: line({
          unitPrice: ENSURE_PRICE,
          discountType: 'percent',
          discountValue: 100,
          discountAmount: ENSURE_PRICE,
        }),
      }),
    )
    // Thành tiền 0 < giá vốn nên đây là bán dưới giá vốn
    await expectPendingReview(result, ['below_cost_unapproved'], env.staff)
    const [after] = await env.db.select().from(products).where(eq(products.id, ensureId))
    expect(after!.currentStock).toBe(before!.currentStock - 1)
  })

  it('sửa giá dưới giá vốn: chờ duyệt; nhân viên chỉ thấy vi phạm giá, chủ thấy dưới giá vốn', async () => {
    const result = await push(
      env.staff.authHeader,
      order({ item: line({ unitPrice: 1_000, originalPrice: ENSURE_PRICE, priceOverride: true }) }),
    )
    await expectPendingReview(result, ['below_cost_unapproved'], env.staff)

    const staffView = await call(
      app,
      'GET',
      `/api/v1/orders/${result.serverId}`,
      env.staff.authHeader,
    )
    expect(staffView.body.data.reviewStatus).toBe('pending_review')
    expect(staffView.body.data.policyViolations.map((v: { code: string }) => v.code)).toEqual([
      'price_unapproved',
    ])
    expect(JSON.stringify(staffView.body.data.policyViolations)).not.toContain('Cost')

    const ownerView = await call(
      app,
      'GET',
      `/api/v1/orders/${result.serverId}`,
      env.owner.authHeader,
    )
    expect(ownerView.body.data.policyViolations[0].code).toBe('below_cost_unapproved')
  })

  it('vượt hạn mức nợ → chờ duyệt, vẫn ghi nợ', async () => {
    const customer = await createCustomer(env, { debtLimit: 100_000, currentDebt: 0 })
    const result = await push(
      env.staff.authHeader,
      order({
        item: line({ unitPrice: ENSURE_PRICE }),
        paymentMethod: 'debt',
        customerId: customer.id,
        debtAmount: ENSURE_PRICE,
      }),
    )
    await expectPendingReview(result, ['debt_limit_exceeded'], env.staff)
    const [row] = await env.db.select().from(customers).where(eq(customers.id, customer.id))
    expect(Number(row?.currentDebt)).toBe(ENSURE_PRICE)
  })

  it('khách tạo nhanh ghi nợ ngoại tuyến → chờ duyệt với vi phạm no_credit', async () => {
    const created = await call(
      app,
      'POST',
      '/api/v1/customers/quick-create',
      env.staff.authHeader,
      { name: 'Khách vãng lai', phone: '0977000999' },
    )
    expect(created.status).toBe(201)
    const result = await push(
      env.staff.authHeader,
      order({
        item: line({ unitPrice: ENSURE_PRICE }),
        paymentMethod: 'debt',
        customerId: created.body.data.id,
        debtAmount: ENSURE_PRICE,
      }),
    )
    await expectPendingReview(result, ['no_credit'], env.staff)
  })

  it('PIN người duyệt sai → chờ duyệt, không tăng số lần sai PIN của người duyệt', async () => {
    const result = await push(
      env.staff.authHeader,
      order({
        item: line({ unitPrice: 420_000, originalPrice: ENSURE_PRICE, priceOverride: true }),
        extra: { priceApproverId: env.manager.id, priceOverridePin: '999999' },
      }),
    )
    await expectPendingReview(result, ['price_unapproved'], env.staff)
    const [manager] = await env.db.select().from(users).where(eq(users.id, env.manager.id))
    expect(manager!.failedPinAttempts).toBe(0)
  })

  it('đơn đúng chính sách không vào hàng chờ duyệt', async () => {
    const result = await push(
      env.staff.authHeader,
      order({ item: line({ unitPrice: ENSURE_PRICE }) }),
    )
    expect(result.status).toBe('synced')
    expect(result.reviewStatus).toBeUndefined()
    expect((await orderRow(result.serverId!)).reviewStatus).toBe('none')
    expect(violationEvents()).toHaveLength(0)
  })

  it('số tiền chiết khấu sai phép tính → lỗi rõ ràng, không tạo đơn (đơn nằm lại hàng đồng bộ)', async () => {
    const result = await push(
      env.staff.authHeader,
      order({ item: line({ unitPrice: ENSURE_PRICE }), discountAmount: 100_000 }),
    )
    expect(result.status).toBe('error')
    expect(result.error?.code).toBe('VALIDATION_ERROR')
    expect(result.error?.message).toContain('Chiết khấu đơn không khớp')
  })
})

describe('Duyệt đơn chờ duyệt: chủ duyệt được, nhân viên không', () => {
  async function pendingPriceOrder() {
    const result = await push(
      env.staff.authHeader,
      order({
        item: line({ unitPrice: 420_000, originalPrice: ENSURE_PRICE, priceOverride: true }),
      }),
    )
    expect(result.reviewStatus).toBe('pending_review')
    return result.serverId!
  }

  it('nhân viên không xem được số đơn chờ duyệt và không duyệt được → 403', async () => {
    const orderId = await pendingPriceOrder()
    const count = await call(
      app,
      'GET',
      '/api/v1/orders/pending-review/count',
      env.staff.authHeader,
    )
    expect(count.status).toBe(403)
    const res = await call(app, 'POST', `/api/v1/orders/${orderId}/review`, env.staff.authHeader, {
      decision: 'approved',
      note: null,
    })
    expect(res.status).toBe(403)
    expect((await orderRow(orderId)).reviewStatus).toBe('pending_review')
  })

  it('chủ duyệt: đơn chuyển approved, có audit; duyệt lần hai → 409', async () => {
    const orderId = await pendingPriceOrder()
    const count = await call(
      app,
      'GET',
      '/api/v1/orders/pending-review/count',
      env.owner.authHeader,
    )
    expect(count.status).toBe(200)
    expect(count.body.data.count).toBeGreaterThan(0)

    const listed = await call(
      app,
      'GET',
      '/api/v1/orders?reviewStatus=pending_review&limit=100',
      env.owner.authHeader,
    )
    expect(listed.status).toBe(200)
    const ids = (listed.body.data as Array<{ id: string; reviewStatus: string }>).map((o) => o.id)
    expect(ids).toContain(orderId)
    expect(
      (listed.body.data as Array<{ reviewStatus: string }>).every(
        (o) => o.reviewStatus === 'pending_review',
      ),
    ).toBe(true)

    const res = await call(app, 'POST', `/api/v1/orders/${orderId}/review`, env.owner.authHeader, {
      decision: 'approved',
      note: 'Khách quen, đồng ý',
    })
    expect(res.status).toBe(200)
    expect(res.body.data.reviewStatus).toBe('approved')
    const row = await orderRow(orderId)
    expect(row.reviewStatus).toBe('approved')
    expect(row.reviewedBy).toBe(env.owner.id)
    const [log] = await auditFor(orderId, 'order.review_approved')
    expect((log?.changes as Record<string, unknown>).sellerId).toBe(env.staff.id)

    const again = await call(
      app,
      'POST',
      `/api/v1/orders/${orderId}/review`,
      env.owner.authHeader,
      {
        decision: 'approved',
        note: null,
      },
    )
    expect(again.status).toBe(409)
  })

  it('từ chối phải có lý do; từ chối chỉ ghi nhận và gợi ý bước tiếp, không huỷ đơn', async () => {
    const orderId = await pendingPriceOrder()
    const noNote = await call(
      app,
      'POST',
      `/api/v1/orders/${orderId}/review`,
      env.manager.authHeader,
      {
        decision: 'rejected',
        note: null,
      },
    )
    expect(noNote.status).toBe(400)

    const res = await call(
      app,
      'POST',
      `/api/v1/orders/${orderId}/review`,
      env.manager.authHeader,
      {
        decision: 'rejected',
        note: 'Nhân viên tự giảm giá',
      },
    )
    expect(res.status).toBe(200)
    expect(res.body.data.nextSteps.length).toBeGreaterThan(0)
    const row = await orderRow(orderId)
    expect(row.reviewStatus).toBe('rejected')
    expect(row.status).toBe('completed')
    expect(await auditFor(orderId, 'order.review_rejected')).toHaveLength(1)
  })

  it('đơn dưới giá vốn: quản lý không đủ quyền duyệt → 403, chủ duyệt được', async () => {
    const result = await push(
      env.staff.authHeader,
      order({ item: line({ unitPrice: 1_000, originalPrice: ENSURE_PRICE, priceOverride: true }) }),
    )
    const byManager = await call(
      app,
      'POST',
      `/api/v1/orders/${result.serverId}/review`,
      env.manager.authHeader,
      { decision: 'approved', note: null },
    )
    expect(byManager.status).toBe(403)
    expect(byManager.body.error.details.missingPermissions).toEqual(['pos.editPriceBelowCost'])

    const byOwner = await call(
      app,
      'POST',
      `/api/v1/orders/${result.serverId}/review`,
      env.owner.authHeader,
      { decision: 'approved', note: null },
    )
    expect(byOwner.status).toBe(200)
  })

  it('chủ cửa hàng khác không thấy đơn → 404', async () => {
    const orderId = await pendingPriceOrder()
    const otherStore = await createStore(env)
    const otherOwner = await createUser(env, { storeId: otherStore.id, role: 'owner' })
    const res = await call(app, 'POST', `/api/v1/orders/${orderId}/review`, otherOwner.authHeader, {
      decision: 'approved',
      note: null,
    })
    expect(res.status).toBe(404)
  })
})

describe('Kiểm PIN người duyệt', () => {
  it('verify-pin với userId người khác mà không nêu quyền → 400', async () => {
    const res = await call(app, 'POST', '/api/v1/users/verify-pin', env.staff.authHeader, {
      pin: env.manager.pin,
      userId: env.manager.id,
    })
    expect(res.status).toBe(400)
  })

  it('người duyệt thuộc cửa hàng khác → 404, không kiểm PIN', async () => {
    const otherStore = await createStore(env)
    const otherOwner = await createUser(env, {
      storeId: otherStore.id,
      role: 'owner',
      pin: '444444',
    })
    const res = await call(app, 'POST', '/api/v1/users/verify-pin', env.staff.authHeader, {
      pin: '444444',
      userId: otherOwner.id,
      permissions: ['pos.editPrice'],
    })
    expect(res.status).toBe(404)

    const order2 = await call(
      app,
      'POST',
      '/api/v1/pos/orders',
      env.staff.authHeader,
      order({
        item: line({ unitPrice: 420_000, originalPrice: ENSURE_PRICE, priceOverride: true }),
        extra: { priceApproverId: otherOwner.id, priceOverridePin: '444444' },
      }),
    )
    expect(order2.status).toBe(404)
  })

  it('người duyệt đã bị vô hiệu hoá → 403, kể cả PIN đúng', async () => {
    const inactive = await createUser(env, { role: 'manager', pin: '555555', isActive: false })
    const res = await call(app, 'POST', '/api/v1/users/verify-pin', env.staff.authHeader, {
      pin: '555555',
      userId: inactive.id,
      permissions: ['pos.editPrice'],
    })
    expect(res.status).toBe(403)

    const created = await call(
      app,
      'POST',
      '/api/v1/pos/orders',
      env.staff.authHeader,
      order({
        item: line({ unitPrice: 420_000, originalPrice: ENSURE_PRICE, priceOverride: true }),
        extra: { priceApproverId: inactive.id, priceOverridePin: '555555' },
      }),
    )
    expect(created.status).toBe(403)
  })

  it('nhân viên không kiểm được PIN người không có quyền cần duyệt → 403', async () => {
    const otherStaff = await createUser(env, { role: 'staff', pin: '666666' })
    const res = await call(app, 'POST', '/api/v1/users/verify-pin', env.staff.authHeader, {
      pin: '666666',
      userId: otherStaff.id,
      permissions: ['pos.editPrice'],
    })
    expect(res.status).toBe(403)
  })

  it('nhân viên sửa giá dưới giá vốn không kèm PIN: lỗi chỉ đòi pos.editPrice, không lộ dưới giá vốn', async () => {
    const res = await call(
      app,
      'POST',
      '/api/v1/pos/orders',
      env.staff.authHeader,
      order({ item: line({ unitPrice: 1_000, originalPrice: ENSURE_PRICE, priceOverride: true }) }),
    )
    expect(res.status).toBe(400)
    expect(res.body.error.details.requiredPermissions).toEqual(['pos.editPrice'])
    expect(JSON.stringify(res.body.error)).not.toContain('BelowCost')
  })

  it('dò PIN quản lý: 3 lần sai thì bị chặn, lần 4 dù đúng PIN cũng 429', async () => {
    const guarded = await createUser(env, { role: 'manager', pin: '777777' })
    for (let i = 0; i < 3; i++) {
      const wrong = await call(app, 'POST', '/api/v1/users/verify-pin', env.staff.authHeader, {
        pin: `00000${i}`,
        userId: guarded.id,
        permissions: ['pos.editPrice'],
      })
      expect(wrong.status).toBe(401)
    }
    const blocked = await call(app, 'POST', '/api/v1/users/verify-pin', env.staff.authHeader, {
      pin: '777777',
      userId: guarded.id,
      permissions: ['pos.editPrice'],
    })
    expect(blocked.status).toBe(429)
    expect(blocked.body.error.details.retryAfter).toBeTruthy()

    // Bộ chặn áp cả cho PIN duyệt gửi kèm đơn tại quầy
    const viaOrder = await call(
      app,
      'POST',
      '/api/v1/pos/orders',
      env.staff.authHeader,
      order({
        item: line({ unitPrice: 420_000, originalPrice: ENSURE_PRICE, priceOverride: true }),
        extra: { priceApproverId: guarded.id, priceOverridePin: '777777' },
      }),
    )
    expect(viaOrder.status).toBe(429)
  })

  it('dò PIN qua tạo đơn tại quầy cũng bị đếm và chặn', async () => {
    const guarded = await createUser(env, { role: 'manager', pin: '888888' })
    const body = (pin: string) =>
      order({
        item: line({ unitPrice: 420_000, originalPrice: ENSURE_PRICE, priceOverride: true }),
        extra: { priceApproverId: guarded.id, priceOverridePin: pin },
      })
    for (let i = 0; i < 3; i++) {
      const wrong = await call(
        app,
        'POST',
        '/api/v1/pos/orders',
        env.staff.authHeader,
        body(`10000${i}`),
      )
      expect(wrong.status).toBe(401)
    }
    const blocked = await call(
      app,
      'POST',
      '/api/v1/pos/orders',
      env.staff.authHeader,
      body('888888'),
    )
    expect(blocked.status).toBe(429)
  })
})

describe('ADR-0009: chủ cửa hàng rà được khách đang không giới hạn nợ', () => {
  it('GET /customers?debtUnlimited=yes chỉ trả khách có cờ không giới hạn', async () => {
    const flagged = await createCustomer(env, { debtUnlimited: true, name: 'Khách không giới hạn' })
    const normal = await createCustomer(env, { debtLimit: 100_000 })
    const res = await call(
      app,
      'GET',
      '/api/v1/customers?debtUnlimited=yes&limit=100',
      env.owner.authHeader,
    )
    expect(res.status).toBe(200)
    const ids = (res.body.data as Array<{ id: string }>).map((c) => c.id)
    expect(ids).toContain(flagged.id)
    expect(ids).not.toContain(normal.id)
  })
})

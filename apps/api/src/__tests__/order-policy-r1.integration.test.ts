import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { auditLogs, customers, orders } from '@kiotviet-lite/shared'

import { createCustomersRoutes } from '../routes/customers.routes.js'
import { createOrdersRoutes } from '../routes/orders.routes.js'
import { createPosRoutes } from '../routes/pos.routes.js'
import { createSyncRoutes } from '../routes/sync.routes.js'
import { createUsersRoutes } from '../routes/users.routes.js'
import { createCustomer, createProduct } from './helpers/factories.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

// Hồi quy nhóm R1 (máy chủ tin số liệu và quyền do máy khách gửi): POS-01, POS-04, POS-12,
// TIEN-106, POS-15, BC-13, OFF-12. Mỗi ca dựng lại đúng bước tái hiện trong báo cáo kiểm toán.

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

interface LineOpts {
  productId: string
  unitPrice: number
  quantity?: number
  originalPrice?: number | null
  priceOverride?: boolean
  discountType?: 'percent' | 'amount' | null
  discountValue?: number
  discountAmount?: number
}

function line(o: LineOpts) {
  const quantity = o.quantity ?? 1
  const discountAmount = o.discountAmount ?? 0
  return {
    productId: o.productId,
    variantId: null,
    productName: 'Sữa Ensure',
    variantName: null,
    unit: 'hộp',
    unitPrice: o.unitPrice,
    quantity,
    discountType: o.discountType ?? null,
    discountValue: o.discountValue ?? 0,
    discountAmount,
    lineTotal: o.unitPrice * quantity - discountAmount,
    note: null,
    unitConversionId: null,
    originalPrice: o.originalPrice ?? null,
    priceOverride: o.priceOverride ?? false,
    priceOverrideReason: o.priceOverride ? 'Khách quen' : null,
    priceOverridePinUsed: false,
  }
}

interface OrderOpts {
  items: ReturnType<typeof line>[]
  discountType?: 'percent' | 'amount' | null
  discountValue?: number
  discountAmount?: number
  paymentMethod?: 'cash' | 'transfer' | 'combined' | 'debt'
  customerId?: string | null
  cashAmount?: number
  debtAmount?: number
  extra?: Record<string, unknown>
}

function order(o: OrderOpts) {
  const subtotal = o.items.reduce((sum, i) => sum + i.lineTotal, 0)
  const discountAmount = o.discountAmount ?? 0
  const total = subtotal - discountAmount
  const paymentMethod = o.paymentMethod ?? 'cash'
  const debt = o.debtAmount ?? 0
  return {
    customerId: o.customerId ?? null,
    subtotal,
    discountType: o.discountType ?? null,
    discountValue: o.discountValue ?? 0,
    discountAmount,
    total,
    paymentMethod,
    paymentStatus: debt === 0 ? 'paid' : debt === total ? 'unpaid' : 'partial',
    cashAmount: o.cashAmount ?? (paymentMethod === 'cash' ? total : 0),
    ...(o.debtAmount !== undefined ? { debtAmount: o.debtAmount } : {}),
    debtLimitOverridden: false,
    note: null,
    items: o.items,
    ...o.extra,
  }
}

const ENSURE_PRICE = 450_000
const ENSURE_COST = 380_000

let env: TestEnv
let app: App
let ensureId: string

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

async function auditFor(targetId: string, action: string) {
  return env.db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.targetId, targetId), eq(auditLogs.action, action)))
}

describe('POS-01: sửa giá, chiết khấu, bán dưới giá vốn cần quyền và PIN người duyệt', () => {
  it('nhân viên bán Ensure 450.000 với giá 1.000 bằng PIN của chính mình → bị từ chối', async () => {
    const res = await call(
      app,
      'POST',
      '/api/v1/pos/orders',
      env.staff.authHeader,
      order({
        items: [
          line({
            productId: ensureId,
            unitPrice: 1_000,
            originalPrice: ENSURE_PRICE,
            priceOverride: true,
          }),
        ],
        extra: { priceOverridePin: env.staff.pin },
      }),
    )
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('nhân viên sửa giá không kèm PIN → bị từ chối', async () => {
    const res = await call(
      app,
      'POST',
      '/api/v1/pos/orders',
      env.staff.authHeader,
      order({
        items: [
          line({
            productId: ensureId,
            unitPrice: 1_000,
            originalPrice: ENSURE_PRICE,
            priceOverride: true,
          }),
        ],
      }),
    )
    expect(res.status).toBe(400)
    expect(res.body.error.message).toBe('Sửa giá yêu cầu mã PIN')
  })

  it('nhân viên giảm 100% một dòng không cần ai duyệt → bị từ chối', async () => {
    const res = await call(
      app,
      'POST',
      '/api/v1/pos/orders',
      env.staff.authHeader,
      order({
        items: [
          line({
            productId: ensureId,
            unitPrice: ENSURE_PRICE,
            discountType: 'percent',
            discountValue: 100,
            discountAmount: ENSURE_PRICE,
          }),
        ],
        paymentMethod: 'cash',
        cashAmount: 0,
      }),
    )
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('nhân viên chiết khấu đơn 450.000 → bị từ chối', async () => {
    const res = await call(
      app,
      'POST',
      '/api/v1/pos/orders',
      env.staff.authHeader,
      order({
        items: [line({ productId: ensureId, unitPrice: ENSURE_PRICE })],
        discountType: 'amount',
        discountValue: ENSURE_PRICE,
        discountAmount: ENSURE_PRICE,
        cashAmount: 0,
      }),
    )
    expect(res.status).toBe(400)
  })

  it('discountAmount không khớp loại và giá trị chiết khấu → bị từ chối (máy chủ tự tính lại)', async () => {
    const res = await call(
      app,
      'POST',
      '/api/v1/pos/orders',
      env.owner.authHeader,
      order({
        items: [line({ productId: ensureId, unitPrice: ENSURE_PRICE })],
        discountType: null,
        discountValue: 0,
        discountAmount: 100_000,
      }),
    )
    expect(res.status).toBe(400)
    expect(res.body.error.message).toContain('Chiết khấu đơn không khớp')
  })

  it('nhân viên giảm giá trên giá vốn, quản lý duyệt bằng PIN → thành công, audit ghi cả người bán và người duyệt', async () => {
    const res = await call(
      app,
      'POST',
      '/api/v1/pos/orders',
      env.staff.authHeader,
      order({
        items: [
          line({
            productId: ensureId,
            unitPrice: 420_000,
            originalPrice: ENSURE_PRICE,
            priceOverride: true,
          }),
        ],
        extra: { priceApproverId: env.manager.id, priceOverridePin: env.manager.pin },
      }),
    )
    expect(res.status).toBe(201)
    const orderId = res.body.data.id as string
    const [log] = await auditFor(orderId, 'order_item.price_overridden')
    const changes = log?.changes as Record<string, unknown>
    expect(changes.sellerId).toBe(env.staff.id)
    expect(changes.approvedBy).toBe(env.manager.id)
    expect(changes.approvedByRole).toBe('manager')
    expect(changes.pinUsed).toBe(true)
  })

  it('bán dưới giá vốn: quản lý duyệt → 403 (thiếu pos.editPriceBelowCost); chủ duyệt → thành công', async () => {
    const body = (approverId: string, pin: string) =>
      order({
        items: [
          line({
            productId: ensureId,
            unitPrice: 1_000,
            originalPrice: ENSURE_PRICE,
            priceOverride: true,
          }),
        ],
        extra: { priceApproverId: approverId, priceOverridePin: pin },
      })

    const byManager = await call(
      app,
      'POST',
      '/api/v1/pos/orders',
      env.staff.authHeader,
      body(env.manager.id, env.manager.pin),
    )
    expect(byManager.status).toBe(403)
    expect(byManager.body.error.details.missingPermissions).toEqual(['pos.editPriceBelowCost'])

    const byOwner = await call(
      app,
      'POST',
      '/api/v1/pos/orders',
      env.staff.authHeader,
      body(env.owner.id, env.owner.pin),
    )
    expect(byOwner.status).toBe(201)
    expect(byOwner.body.data.items[0].belowCost).toBe(true)
  })

  it('chiết khấu đơn kéo tổng xuống dưới giá vốn, quản lý tự bán → 400 (cần PIN chủ)', async () => {
    const res = await call(
      app,
      'POST',
      '/api/v1/pos/orders',
      env.manager.authHeader,
      order({
        items: [line({ productId: ensureId, unitPrice: ENSURE_PRICE })],
        discountType: 'percent',
        discountValue: 50,
        discountAmount: ENSURE_PRICE / 2,
      }),
    )
    expect(res.status).toBe(400)
    expect(res.body.error.details.requiredPermissions).toEqual([
      'pos.editPrice',
      'pos.editPriceBelowCost',
    ])
  })

  it('quản lý tự chiết khấu trên giá vốn → không cần PIN, audit order.discount_applied', async () => {
    const res = await call(
      app,
      'POST',
      '/api/v1/pos/orders',
      env.manager.authHeader,
      order({
        items: [line({ productId: ensureId, unitPrice: ENSURE_PRICE })],
        discountType: 'amount',
        discountValue: 20_000,
        discountAmount: 20_000,
      }),
    )
    expect(res.status).toBe(201)
    const [log] = await auditFor(res.body.data.id, 'order.discount_applied')
    const changes = log?.changes as Record<string, unknown>
    expect(changes.sellerId).toBe(env.manager.id)
    expect(changes.approved).toBe(true)
  })
})

describe('POS-04: duyệt vượt hạn mức nợ bằng PIN người có quyền pos.overrideDebtLimit', () => {
  it('nhân viên tự nhập PIN của mình để vượt hạn mức → 403; quản lý duyệt → thành công', async () => {
    const customer = await createCustomer(env, { debtLimit: 100_000, currentDebt: 0 })
    const body = (extra: Record<string, unknown>) =>
      order({
        items: [line({ productId: ensureId, unitPrice: ENSURE_PRICE })],
        paymentMethod: 'debt',
        customerId: customer.id,
        cashAmount: 0,
        debtAmount: ENSURE_PRICE,
        extra: { debtLimitOverridden: true, ...extra },
      })

    const own = await call(
      app,
      'POST',
      '/api/v1/pos/orders',
      env.staff.authHeader,
      body({ debtLimitOverridePin: env.staff.pin }),
    )
    expect(own.status).toBe(403)

    const approved = await call(
      app,
      'POST',
      '/api/v1/pos/orders',
      env.staff.authHeader,
      body({ debtLimitApproverId: env.manager.id, debtLimitOverridePin: env.manager.pin }),
    )
    expect(approved.status).toBe(201)
    const [log] = await auditFor(customer.id, 'debt.limit_overridden')
    const changes = log?.changes as Record<string, unknown>
    expect(changes.orderId).toBe(approved.body.data.id)
    expect(changes.overrideBy).toBe(env.manager.id)
    expect(changes.sellerId).toBe(env.staff.id)
  })

  it('GET /pos/approvers?permission=pos.overrideDebtLimit chỉ trả chủ và quản lý', async () => {
    const res = await call(
      app,
      'GET',
      '/api/v1/pos/approvers?permission=pos.overrideDebtLimit',
      env.staff.authHeader,
    )
    expect(res.status).toBe(200)
    const ids = (res.body.data as Array<{ id: string }>).map((u) => u.id).sort()
    expect(ids).toEqual([env.owner.id, env.manager.id].sort())
  })

  it('POST /users/verify-pin với người duyệt: đúng PIN và đủ quyền → ok; thiếu quyền → 403', async () => {
    const ok = await call(app, 'POST', '/api/v1/users/verify-pin', env.staff.authHeader, {
      pin: env.manager.pin,
      userId: env.manager.id,
      permissions: ['pos.overrideDebtLimit'],
    })
    expect(ok.status).toBe(200)
    expect(ok.body.data.approver.userId).toBe(env.manager.id)

    const denied = await call(app, 'POST', '/api/v1/users/verify-pin', env.staff.authHeader, {
      pin: env.manager.pin,
      userId: env.manager.id,
      permissions: ['pos.editPriceBelowCost'],
    })
    expect(denied.status).toBe(403)
  })
})

describe('POS-12 và TIEN-106: không đặt hạn mức là không cho nợ', () => {
  it('nhân viên tạo nhanh khách rồi ghi nợ → 422', async () => {
    const created = await call(
      app,
      'POST',
      '/api/v1/customers/quick-create',
      env.staff.authHeader,
      { name: 'Khách vãng lai', phone: '0977000111' },
    )
    expect(created.status).toBe(201)
    expect(created.body.data.debtUnlimited).toBe(false)

    const res = await call(
      app,
      'POST',
      '/api/v1/pos/orders',
      env.staff.authHeader,
      order({
        items: [line({ productId: ensureId, unitPrice: ENSURE_PRICE })],
        paymentMethod: 'debt',
        customerId: created.body.data.id,
        cashAmount: 0,
        debtAmount: ENSURE_PRICE,
      }),
    )
    expect(res.status).toBe(422)
  })

  it('hạn mức 0 chặn ghi nợ, kể cả chủ cửa hàng không duyệt', async () => {
    const customer = await createCustomer(env, { debtLimit: 0 })
    const res = await call(
      app,
      'POST',
      '/api/v1/pos/orders',
      env.owner.authHeader,
      order({
        items: [line({ productId: ensureId, unitPrice: ENSURE_PRICE })],
        paymentMethod: 'debt',
        customerId: customer.id,
        cashAmount: 0,
        debtAmount: ENSURE_PRICE,
      }),
    )
    expect(res.status).toBe(422)
    expect(res.body.error.message).toContain('chưa được cấp hạn mức nợ')
  })

  it('chỉ chủ cửa hàng bật được "không giới hạn nợ"; bật rồi thì ghi nợ được', async () => {
    const customer = await createCustomer(env)
    const byManager = await call(
      app,
      'PATCH',
      `/api/v1/customers/${customer.id}`,
      env.manager.authHeader,
      { debtUnlimited: true },
    )
    expect(byManager.status).toBe(403)

    const byOwner = await call(
      app,
      'PATCH',
      `/api/v1/customers/${customer.id}`,
      env.owner.authHeader,
      { debtUnlimited: true },
    )
    expect(byOwner.status).toBe(200)
    expect(byOwner.body.data.effectiveDebtLimit).toBeNull()

    const res = await call(
      app,
      'POST',
      '/api/v1/pos/orders',
      env.staff.authHeader,
      order({
        items: [line({ productId: ensureId, unitPrice: ENSURE_PRICE })],
        paymentMethod: 'debt',
        customerId: customer.id,
        cashAmount: 0,
        debtAmount: ENSURE_PRICE,
      }),
    )
    expect(res.status).toBe(201)
  })
})

describe('POS-15: máy chủ tự tính trạng thái thanh toán', () => {
  it('tiền mặt 25.000 + nợ 20.000 cho đơn 25.000 → 422, không tạo đơn', async () => {
    const customer = await createCustomer(env, { debtLimit: 1_000_000 })
    const before = await env.db.select().from(orders).where(eq(orders.customerId, customer.id))
    const res = await call(app, 'POST', '/api/v1/pos/orders', env.owner.authHeader, {
      ...order({
        items: [
          line({
            productId: ensureId,
            unitPrice: 25_000,
            originalPrice: ENSURE_PRICE,
            priceOverride: true,
          }),
        ],
        paymentMethod: 'cash',
        customerId: customer.id,
        cashAmount: 25_000,
        debtAmount: 20_000,
        extra: { priceOverridePin: env.owner.pin, paymentStatus: 'partial' },
      }),
    })
    expect(res.status).toBe(422)
    const after = await env.db.select().from(orders).where(eq(orders.customerId, customer.id))
    expect(after.length).toBe(before.length)
  })

  it('đơn ghi nợ mà tiền thu cộng nợ lệch tổng đơn → 422', async () => {
    const customer = await createCustomer(env, { debtLimit: 1_000_000 })
    const res = await call(
      app,
      'POST',
      '/api/v1/pos/orders',
      env.owner.authHeader,
      order({
        items: [line({ productId: ensureId, unitPrice: ENSURE_PRICE })],
        paymentMethod: 'debt',
        customerId: customer.id,
        cashAmount: 100_000,
        debtAmount: ENSURE_PRICE,
      }),
    )
    expect(res.status).toBe(422)
  })

  it('trả trước một phần: máy chủ tính trạng thái partial, không có tiền thừa', async () => {
    const customer = await createCustomer(env, { debtLimit: 1_000_000 })
    const res = await call(
      app,
      'POST',
      '/api/v1/pos/orders',
      env.owner.authHeader,
      order({
        items: [line({ productId: ensureId, unitPrice: ENSURE_PRICE })],
        paymentMethod: 'debt',
        customerId: customer.id,
        cashAmount: 50_000,
        debtAmount: ENSURE_PRICE - 50_000,
      }),
    )
    expect(res.status).toBe(201)
    expect(res.body.data.paymentStatus).toBe('partial')
    expect(res.body.data.debtAmount).toBe(ENSURE_PRICE - 50_000)
  })
})

describe('BC-13: nhân viên không nhận giá vốn trên mọi đường liệt kê', () => {
  it('tìm hàng POS: nhân viên không có costPrice, chủ có', async () => {
    const staff = await call(
      app,
      'GET',
      '/api/v1/pos/products/search?q=Ensure',
      env.staff.authHeader,
    )
    expect(staff.status).toBe(200)
    expect(staff.body.data.length).toBeGreaterThan(0)
    for (const p of staff.body.data) expect(p).not.toHaveProperty('costPrice')

    const owner = await call(
      app,
      'GET',
      '/api/v1/pos/products/search?q=Ensure',
      env.owner.authHeader,
    )
    expect(owner.body.data[0].costPrice).toBe(ENSURE_COST)
  })

  it('/sync/pull: nhân viên không có costPrice ở sản phẩm và biến thể', async () => {
    for (const entity of ['products', 'variants']) {
      const staff = await call(
        app,
        'GET',
        `/api/v1/sync/pull?entity=${entity}`,
        env.staff.authHeader,
      )
      expect(staff.status).toBe(200)
      for (const row of staff.body.data.rows) expect(row).not.toHaveProperty('costPrice')
    }
    const staffProducts = await call(
      app,
      'GET',
      '/api/v1/sync/pull?entity=products',
      env.staff.authHeader,
    )
    expect(staffProducts.body.data.rows.length).toBeGreaterThan(0)

    const ownerProducts = await call(
      app,
      'GET',
      '/api/v1/sync/pull?entity=products',
      env.owner.authHeader,
    )
    expect(ownerProducts.body.data.rows[0]).toHaveProperty('costPrice')
  })

  it('phản hồi tạo đơn và chi tiết đơn: nhân viên chỉ thấy cờ belowCost, không thấy giá vốn', async () => {
    const created = await call(
      app,
      'POST',
      '/api/v1/pos/orders',
      env.staff.authHeader,
      order({ items: [line({ productId: ensureId, unitPrice: ENSURE_PRICE })] }),
    )
    expect(created.status).toBe(201)
    expect(created.body.data.items[0]).not.toHaveProperty('costPrice')
    expect(created.body.data.items[0].belowCost).toBe(false)

    const detail = await call(
      app,
      'GET',
      `/api/v1/orders/${created.body.data.id}`,
      env.staff.authHeader,
    )
    expect(detail.status).toBe(200)
    expect(detail.body.data.items[0]).not.toHaveProperty('costPrice')

    const ownerDetail = await call(
      app,
      'GET',
      `/api/v1/orders/${created.body.data.id}`,
      env.owner.authHeader,
    )
    expect(ownerDetail.body.data.items[0].costPrice).toBe(ENSURE_COST)
  })
})

describe('OFF-12 và ADR-0002: đơn ngoại tuyến đã bán xong vẫn được nhận, gắn cờ thiếu duyệt', () => {
  it('chiết khấu không ai duyệt, PIN sai lúc đồng bộ: đơn vẫn synced và có audit order.approval_missing', async () => {
    const res = await call(app, 'POST', '/api/v1/sync/push', env.staff.authHeader, {
      clientId: 'aaaaaaaa-1111-4444-8888-000000000012',
      orders: [
        {
          clientId: 'bbbbbbbb-2222-4444-8888-000000000012',
          createdAt: new Date().toISOString(),
          orderData: order({
            items: [
              line({
                productId: ensureId,
                unitPrice: 1_000,
                originalPrice: ENSURE_PRICE,
                priceOverride: true,
              }),
            ],
            extra: { priceApproverId: env.owner.id, priceOverridePin: '000000' },
          }),
        },
      ],
    })
    expect(res.status).toBe(200)
    const result = res.body.data.results[0]
    expect(result.status).toBe('synced')
    const logs = await auditFor(result.serverId, 'order.approval_missing')
    expect(logs).toHaveLength(1)
  })

  it('nhân viên ngoại tuyến ghi nợ khách chưa có hạn mức: đơn vẫn nhận và gắn cờ vượt hạn mức (ADR-0001)', async () => {
    const customer = await createCustomer(env)
    const res = await call(app, 'POST', '/api/v1/sync/push', env.staff.authHeader, {
      clientId: 'aaaaaaaa-1111-4444-8888-000000000013',
      orders: [
        {
          clientId: 'bbbbbbbb-2222-4444-8888-000000000013',
          createdAt: new Date().toISOString(),
          orderData: order({
            items: [line({ productId: ensureId, unitPrice: ENSURE_PRICE })],
            paymentMethod: 'debt',
            customerId: customer.id,
            cashAmount: 0,
            debtAmount: ENSURE_PRICE,
          }),
        },
      ],
    })
    expect(res.status).toBe(200)
    const result = res.body.data.results[0]
    expect(result.status).toBe('synced')
    const logs = await auditFor(result.serverId, 'order.debt_limit_exceeded')
    expect(logs.length).toBeGreaterThan(0)
    const [row] = await env.db.select().from(customers).where(eq(customers.id, customer.id))
    expect(Number(row?.currentDebt)).toBe(ENSURE_PRICE)
  })
})

import { and, eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { auditLogs, customerGroups, customers, debts, products } from '@kiotviet-lite/shared'

import { createPosRoutes } from '../routes/pos.routes.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.ACCESS_TOKEN_TTL_SECONDS = '900'
  process.env.REFRESH_TOKEN_TTL_SECONDS = '604800'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

interface Env {
  base: TestEnv
  app: ReturnType<typeof createPosRoutes>
  customerWithLimitId: string
  customerNoLimitId: string
  customerNearLimitId: string
  customerGroupLimitId: string
  customerZeroLimitId: string
  productId: string
  groupId: string
}

async function setup(): Promise<Env> {
  const base = await createTestEnv()
  const app = createPosRoutes({ db: base.db })

  // Tạo customer group có debt limit = 500.000
  const [group] = await base.db
    .insert(customerGroups)
    .values({ storeId: base.storeId, name: 'Nhóm VIP', debtLimit: 500_000 })
    .returning({ id: customerGroups.id })
  if (!group) throw new Error('seed group failed')

  // Customers
  const insertedCustomers = await base.db
    .insert(customers)
    .values([
      {
        storeId: base.storeId,
        name: 'KH Có Hạn Mức',
        phone: '0911111111',
        debtLimit: 1_000_000,
        currentDebt: 800_000,
      },
      {
        storeId: base.storeId,
        name: 'KH Không Giới Hạn',
        phone: '0922222222',
        debtLimit: null,
        currentDebt: 0,
      },
      {
        storeId: base.storeId,
        name: 'KH Sát Hạn Mức',
        phone: '0933333333',
        debtLimit: 1_000_000,
        currentDebt: 900_000,
      },
      {
        storeId: base.storeId,
        name: 'KH Theo Group',
        phone: '0944444444',
        debtLimit: null,
        groupId: group.id,
        currentDebt: 200_000,
      },
      {
        storeId: base.storeId,
        name: 'KH Limit 0',
        phone: '0955555555',
        debtLimit: 0,
        currentDebt: 0,
      },
    ])
    .returning({ id: customers.id, name: customers.name })

  const findCust = (name: string) => {
    const c = insertedCustomers.find((x) => x.name === name)
    if (!c) throw new Error(`customer ${name} not found`)
    return c.id
  }

  // Sản phẩm test
  const [product] = await base.db
    .insert(products)
    .values({
      storeId: base.storeId,
      name: 'Sản phẩm test',
      sku: 'TEST001',
      sellingPrice: 100_000,
      currentStock: 100,
      trackInventory: true,
      unit: 'cái',
      hasVariants: false,
    })
    .returning({ id: products.id })
  if (!product) throw new Error('seed product failed')

  return {
    base,
    app,
    customerWithLimitId: findCust('KH Có Hạn Mức'),
    customerNoLimitId: findCust('KH Không Giới Hạn'),
    customerNearLimitId: findCust('KH Sát Hạn Mức'),
    customerGroupLimitId: findCust('KH Theo Group'),
    customerZeroLimitId: findCust('KH Limit 0'),
    productId: product.id,
    groupId: group.id,
  }
}

interface DebtInfoResp {
  data: {
    customerId: string
    customerName: string
    groupId: string | null
    groupName: string | null
    currentDebt: number
    customerDebtLimit: number | null
    groupDebtLimit: number | null
    effectiveDebtLimit: number | null
  }
}

interface OrderResp {
  data: {
    id: string
    orderNumber: string
    customerId: string | null
    total: number
    paymentMethod: string
    paymentStatus: string
    debtAmount: number
  }
}

interface ErrResp {
  error: { code: string; message: string; details?: unknown }
}

async function jsonReq<T>(
  env: Env,
  method: string,
  path: string,
  body: unknown,
  authHeader: { Authorization: string },
): Promise<{ status: number; body: T }> {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeader },
  }
  if (body !== undefined) init.body = JSON.stringify(body)
  const res = await env.app.request(path, init)
  const text = await res.text()
  return { status: res.status, body: text ? (JSON.parse(text) as T) : (undefined as T) }
}

function makeOrderPayload(env: Env, overrides: Record<string, unknown> = {}) {
  const base = {
    customerId: env.customerWithLimitId,
    subtotal: 100_000,
    discountType: null,
    discountValue: 0,
    discountAmount: 0,
    total: 100_000,
    paymentMethod: 'debt',
    paymentStatus: 'unpaid',
    debtAmount: 100_000,
    debtLimitOverridden: false,
    note: null,
    items: [
      {
        productId: env.productId,
        variantId: null,
        productName: 'Sản phẩm test',
        variantName: null,
        unit: 'cái',
        unitPrice: 100_000,
        quantity: 1,
        discountType: null,
        discountValue: 0,
        discountAmount: 0,
        lineTotal: 100_000,
        note: null,
        unitConversionId: null,
        originalPrice: null,
        priceOverride: false,
        priceOverrideReason: null,
        priceOverridePinUsed: false,
      },
    ],
  }
  return { ...base, ...overrides }
}

describe('GET /customer-debt/:customerId', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('KH có debtLimit riêng → effectiveDebtLimit = customer.debtLimit', async () => {
    const r = await jsonReq<DebtInfoResp>(
      env,
      'GET',
      `/customer-debt/${env.customerWithLimitId}`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.currentDebt).toBe(800_000)
    expect(r.body.data.customerDebtLimit).toBe(1_000_000)
    expect(r.body.data.effectiveDebtLimit).toBe(1_000_000)
  })

  it('KH không có debtLimit, có group → effectiveDebtLimit = group.debtLimit', async () => {
    const r = await jsonReq<DebtInfoResp>(
      env,
      'GET',
      `/customer-debt/${env.customerGroupLimitId}`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.customerDebtLimit).toBeNull()
    expect(r.body.data.groupDebtLimit).toBe(500_000)
    expect(r.body.data.effectiveDebtLimit).toBe(500_000)
  })

  it('KH không giới hạn (cả customer và group đều null) → effectiveDebtLimit null', async () => {
    const r = await jsonReq<DebtInfoResp>(
      env,
      'GET',
      `/customer-debt/${env.customerNoLimitId}`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.effectiveDebtLimit).toBeNull()
  })

  it('Multi-tenant: KH store khác → 404', async () => {
    const otherEnv = await createTestEnv()
    const [otherCustomer] = await otherEnv.db
      .insert(customers)
      .values({
        storeId: otherEnv.storeId,
        name: 'KH Khác Store',
        phone: '0999999999',
        currentDebt: 0,
      })
      .returning({ id: customers.id })
    const r = await jsonReq<ErrResp>(
      env,
      'GET',
      `/customer-debt/${otherCustomer!.id}`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(404)
    await otherEnv.close()
  })
})

describe('POST /orders với debt', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Ghi nợ trong hạn mức → 201, tạo debt + tăng currentDebt', async () => {
    const r = await jsonReq<OrderResp>(
      env,
      'POST',
      '/orders',
      makeOrderPayload(env), // KH currentDebt 800k + 100k = 900k <= 1tr
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
    expect(r.body.data.debtAmount).toBe(100_000)
    expect(r.body.data.paymentMethod).toBe('debt')

    // Verify debt record
    const debtRows = await env.base.db.select().from(debts).where(eq(debts.orderId, r.body.data.id))
    expect(debtRows).toHaveLength(1)
    expect(debtRows[0]!.amount).toBe(100_000)
    expect(debtRows[0]!.paid).toBe(0)
    expect(debtRows[0]!.remaining).toBe(100_000)

    // Verify currentDebt cập nhật
    const cust = await env.base.db.query.customers.findFirst({
      where: eq(customers.id, env.customerWithLimitId),
    })
    expect(cust?.currentDebt).toBe(900_000)
  })

  it('Vượt hạn mức không có override → 422 BUSINESS_RULE_VIOLATION', async () => {
    const r = await jsonReq<ErrResp>(
      env,
      'POST',
      '/orders',
      makeOrderPayload(env, {
        customerId: env.customerNearLimitId, // currentDebt 900k
        subtotal: 200_000,
        total: 200_000,
        debtAmount: 200_000, // 900k + 200k = 1.1tr > 1tr
        items: [
          {
            productId: env.productId,
            variantId: null,
            productName: 'Sản phẩm test',
            variantName: null,
            unit: 'cái',
            unitPrice: 100_000,
            quantity: 2,
            discountType: null,
            discountValue: 0,
            discountAmount: 0,
            lineTotal: 200_000,
            note: null,
            unitConversionId: null,
            originalPrice: null,
            priceOverride: false,
            priceOverrideReason: null,
            priceOverridePinUsed: false,
          },
        ],
      }),
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('BUSINESS_RULE_VIOLATION')
    expect(r.body.error.message).toContain('Vượt hạn mức công nợ')
  })

  it('Vượt hạn mức CÓ override → 201 + audit debt.limit_overridden', async () => {
    const r = await jsonReq<OrderResp>(
      env,
      'POST',
      '/orders',
      makeOrderPayload(env, {
        customerId: env.customerNearLimitId,
        subtotal: 200_000,
        total: 200_000,
        debtAmount: 200_000,
        debtLimitOverridden: true,
        debtLimitOverridePin: '111111',
        items: [
          {
            productId: env.productId,
            variantId: null,
            productName: 'Sản phẩm test',
            variantName: null,
            unit: 'cái',
            unitPrice: 100_000,
            quantity: 2,
            discountType: null,
            discountValue: 0,
            discountAmount: 0,
            lineTotal: 200_000,
            note: null,
            unitConversionId: null,
            originalPrice: null,
            priceOverride: false,
            priceOverrideReason: null,
            priceOverridePinUsed: false,
          },
        ],
      }),
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)

    // Audit có cả 2 actions
    const logs = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.storeId, env.base.storeId))
    const overriddenLog = logs.find((l) => l.action === 'debt.limit_overridden')
    const createdLog = logs.find((l) => l.action === 'debt.created')
    expect(overriddenLog).toBeDefined()
    expect(createdLog).toBeDefined()
  })

  it('KH không giới hạn nợ → cho phép ghi nợ lớn', async () => {
    const r = await jsonReq<OrderResp>(
      env,
      'POST',
      '/orders',
      makeOrderPayload(env, {
        customerId: env.customerNoLimitId,
        debtAmount: 100_000,
      }),
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
    expect(r.body.data.debtAmount).toBe(100_000)
  })

  it('debtLimit = 0 → coi là không giới hạn (không chặn)', async () => {
    const r = await jsonReq<OrderResp>(
      env,
      'POST',
      '/orders',
      makeOrderPayload(env, {
        customerId: env.customerZeroLimitId,
        debtAmount: 100_000,
      }),
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
  })

  it('Ghi nợ qua group debtLimit → check theo group khi customer.debtLimit null', async () => {
    // KH theo group: limit 500k, currentDebt 200k → +200k = 400k OK
    const r = await jsonReq<OrderResp>(
      env,
      'POST',
      '/orders',
      makeOrderPayload(env, {
        customerId: env.customerGroupLimitId,
        debtAmount: 100_000,
        subtotal: 100_000,
        total: 100_000,
        items: [
          {
            productId: env.productId,
            variantId: null,
            productName: 'Sản phẩm test',
            variantName: null,
            unit: 'cái',
            unitPrice: 100_000,
            quantity: 1,
            discountType: null,
            discountValue: 0,
            discountAmount: 0,
            lineTotal: 100_000,
            note: null,
            unitConversionId: null,
            originalPrice: null,
            priceOverride: false,
            priceOverrideReason: null,
            priceOverridePinUsed: false,
          },
        ],
      }),
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
  })

  it('Ghi nợ qua group debtLimit vượt hạn → 422', async () => {
    // group limit 500k, currentDebt 200k, +400k = 600k VƯỢT
    const r = await jsonReq<ErrResp>(
      env,
      'POST',
      '/orders',
      makeOrderPayload(env, {
        customerId: env.customerGroupLimitId,
        subtotal: 400_000,
        total: 400_000,
        debtAmount: 400_000,
        items: [
          {
            productId: env.productId,
            variantId: null,
            productName: 'Sản phẩm test',
            variantName: null,
            unit: 'cái',
            unitPrice: 100_000,
            quantity: 4,
            discountType: null,
            discountValue: 0,
            discountAmount: 0,
            lineTotal: 400_000,
            note: null,
            unitConversionId: null,
            originalPrice: null,
            priceOverride: false,
            priceOverrideReason: null,
            priceOverridePinUsed: false,
          },
        ],
      }),
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(422)
  })

  it('Thanh toán hỗn hợp: tiền mặt + ghi nợ', async () => {
    // Tổng 100k: 40k cash + 60k debt
    const r = await jsonReq<OrderResp>(
      env,
      'POST',
      '/orders',
      makeOrderPayload(env, {
        cashAmount: 40_000,
        debtAmount: 60_000,
        paymentStatus: 'partial',
      }),
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
    expect(r.body.data.debtAmount).toBe(60_000)
    expect(r.body.data.paymentStatus).toBe('partial')

    // currentDebt + 60k
    const cust = await env.base.db.query.customers.findFirst({
      where: eq(customers.id, env.customerWithLimitId),
    })
    expect(cust?.currentDebt).toBe(860_000)
  })

  it('debtAmount = 0 → không tạo debt record, không cập nhật currentDebt', async () => {
    const r = await jsonReq<OrderResp>(
      env,
      'POST',
      '/orders',
      makeOrderPayload(env, {
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 100_000,
        debtAmount: 0,
      }),
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)

    const debtRows = await env.base.db
      .select()
      .from(debts)
      .where(and(eq(debts.storeId, env.base.storeId), eq(debts.orderId, r.body.data.id)))
    expect(debtRows).toHaveLength(0)

    const cust = await env.base.db.query.customers.findFirst({
      where: eq(customers.id, env.customerWithLimitId),
    })
    expect(cust?.currentDebt).toBe(800_000) // không đổi
  })

  it('debtAmount > 0 không có customerId → 400 VALIDATION_ERROR', async () => {
    const r = await jsonReq<ErrResp>(
      env,
      'POST',
      '/orders',
      makeOrderPayload(env, {
        customerId: null,
        debtAmount: 100_000,
      }),
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
  })

  it('debtAmount > total → 400 VALIDATION_ERROR (Zod refine)', async () => {
    const r = await jsonReq<ErrResp>(
      env,
      'POST',
      '/orders',
      makeOrderPayload(env, {
        debtAmount: 200_000, // total = 100k
      }),
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
  })

  it('Audit log có 2 records: order.created + debt.created', async () => {
    await jsonReq(env, 'POST', '/orders', makeOrderPayload(env), env.base.owner.authHeader)

    const logs = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.storeId, env.base.storeId))
    const orderLog = logs.find((l) => l.action === 'order.created')
    const debtLog = logs.find((l) => l.action === 'debt.created')
    expect(orderLog).toBeDefined()
    expect(debtLog).toBeDefined()
  })

  // SF-5: Race condition test - SELECT FOR UPDATE serialize 2 createOrder đồng thời
  it('concurrent debt creation serialized by FOR UPDATE', async () => {
    // KH Không Giới Hạn currentDebt = 0, không hạn mức → cả 2 đơn đều phải tạo debt thành công
    const customerId = env.customerNoLimitId

    const payload1 = makeOrderPayload(env, {
      customerId,
      subtotal: 400_000,
      total: 400_000,
      debtAmount: 400_000,
      paymentStatus: 'unpaid',
      items: [
        {
          productId: env.productId,
          variantId: null,
          productName: 'Sản phẩm test',
          variantName: null,
          unit: 'cái',
          unitPrice: 100_000,
          quantity: 4,
          discountType: null,
          discountValue: 0,
          discountAmount: 0,
          lineTotal: 400_000,
          note: null,
          unitConversionId: null,
          originalPrice: null,
          priceOverride: false,
          priceOverrideReason: null,
          priceOverridePinUsed: false,
        },
      ],
    })
    const payload2 = makeOrderPayload(env, {
      customerId,
      subtotal: 400_000,
      total: 400_000,
      debtAmount: 400_000,
      paymentStatus: 'unpaid',
      items: [
        {
          productId: env.productId,
          variantId: null,
          productName: 'Sản phẩm test',
          variantName: null,
          unit: 'cái',
          unitPrice: 100_000,
          quantity: 4,
          discountType: null,
          discountValue: 0,
          discountAmount: 0,
          lineTotal: 400_000,
          note: null,
          unitConversionId: null,
          originalPrice: null,
          priceOverride: false,
          priceOverrideReason: null,
          priceOverridePinUsed: false,
        },
      ],
    })

    const [r1, r2] = await Promise.all([
      jsonReq<OrderResp>(env, 'POST', '/orders', payload1, env.base.owner.authHeader),
      jsonReq<OrderResp>(env, 'POST', '/orders', payload2, env.base.owner.authHeader),
    ])
    expect(r1.status).toBe(201)
    expect(r2.status).toBe(201)

    // Sau cùng: tổng currentDebt = 800.000 (chứng minh không bị lost update)
    const cust = await env.base.db.query.customers.findFirst({
      where: eq(customers.id, customerId),
    })
    expect(cust?.currentDebt).toBe(800_000)

    // Cả 2 debt records tồn tại
    const debtRows = await env.base.db.select().from(debts).where(eq(debts.customerId, customerId))
    expect(debtRows).toHaveLength(2)
    const totalDebt = debtRows.reduce((s, d) => s + d.remaining, 0)
    expect(totalDebt).toBe(800_000)
  })
})

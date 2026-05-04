import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  auditLogs,
  customers,
  debts,
  orders,
  receiptAllocations,
  receipts,
} from '@kiotviet-lite/shared'

import { createReceiptsRoutes } from '../routes/receipts.routes.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.ACCESS_TOKEN_TTL_SECONDS = '900'
  process.env.REFRESH_TOKEN_TTL_SECONDS = '604800'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

interface SeedDebt {
  id: string
  orderId: string
  remaining: number
}

interface Env {
  base: TestEnv
  app: ReturnType<typeof createReceiptsRoutes>
  customerWithDebtId: string
  customerNoDebtId: string
  debtA: SeedDebt
  debtB: SeedDebt
  debtC: SeedDebt
}

async function setup(): Promise<Env> {
  const base = await createTestEnv()
  const app = createReceiptsRoutes({ db: base.db })

  const inserted = await base.db
    .insert(customers)
    .values([
      {
        storeId: base.storeId,
        name: 'KH Có Nợ',
        phone: '0911111000',
        currentDebt: 450_000,
      },
      {
        storeId: base.storeId,
        name: 'KH Không Nợ',
        phone: '0911222000',
        currentDebt: 0,
      },
    ])
    .returning({ id: customers.id, name: customers.name })

  const cWithDebt = inserted.find((c) => c.name === 'KH Có Nợ')
  const cNoDebt = inserted.find((c) => c.name === 'KH Không Nợ')
  if (!cWithDebt || !cNoDebt) throw new Error('seed customers failed')

  // Tạo orders + debts FIFO ASC
  const orderRows = await base.db
    .insert(orders)
    .values([
      {
        storeId: base.storeId,
        orderNumber: 'ORD-A',
        customerId: cWithDebt.id,
        userId: base.owner.id,
        subtotal: 100_000,
        total: 100_000,
        paymentMethod: 'cash',
        paymentStatus: 'partial',
      },
      {
        storeId: base.storeId,
        orderNumber: 'ORD-B',
        customerId: cWithDebt.id,
        userId: base.owner.id,
        subtotal: 200_000,
        total: 200_000,
        paymentMethod: 'cash',
        paymentStatus: 'partial',
      },
      {
        storeId: base.storeId,
        orderNumber: 'ORD-C',
        customerId: cWithDebt.id,
        userId: base.owner.id,
        subtotal: 150_000,
        total: 150_000,
        paymentMethod: 'cash',
        paymentStatus: 'partial',
      },
    ])
    .returning({ id: orders.id, orderNumber: orders.orderNumber })

  const orderA = orderRows.find((o) => o.orderNumber === 'ORD-A')!
  const orderB = orderRows.find((o) => o.orderNumber === 'ORD-B')!
  const orderC = orderRows.find((o) => o.orderNumber === 'ORD-C')!

  // Insert sequentially to ensure deterministic createdAt (FIFO order A-B-C)
  const debtAResult = await base.db
    .insert(debts)
    .values({
      storeId: base.storeId,
      orderId: orderA.id,
      customerId: cWithDebt.id,
      amount: 100_000,
      paid: 0,
      remaining: 100_000,
    })
    .returning({ id: debts.id })

  const debtBResult = await base.db
    .insert(debts)
    .values({
      storeId: base.storeId,
      orderId: orderB.id,
      customerId: cWithDebt.id,
      amount: 200_000,
      paid: 0,
      remaining: 200_000,
    })
    .returning({ id: debts.id })

  const debtCResult = await base.db
    .insert(debts)
    .values({
      storeId: base.storeId,
      orderId: orderC.id,
      customerId: cWithDebt.id,
      amount: 150_000,
      paid: 0,
      remaining: 150_000,
    })
    .returning({ id: debts.id })

  return {
    base,
    app,
    customerWithDebtId: cWithDebt.id,
    customerNoDebtId: cNoDebt.id,
    debtA: { id: debtAResult[0]!.id, orderId: orderA.id, remaining: 100_000 },
    debtB: { id: debtBResult[0]!.id, orderId: orderB.id, remaining: 200_000 },
    debtC: { id: debtCResult[0]!.id, orderId: orderC.id, remaining: 150_000 },
  }
}

interface ReceiptResp {
  id: string
  customerId: string
  customerName: string | null
  customerPhone: string | null
  amount: number
  note: string | null
  allocationCount: number
  createdBy: string
  createdByName: string | null
  createdAt: string
  debtAfter: number | null
  allocations: Array<{
    id: string
    debtId: string
    orderId: string
    orderCode: string
    amount: number
    debtRemainingAfter: number | null
  }>
}

interface ListResp {
  data: ReceiptResp[]
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

interface OpenDebtsResp {
  data: {
    customerId: string
    customerName: string
    customerPhone: string
    totalRemaining: number
    items: Array<{
      id: string
      orderId: string
      orderCode: string
      amount: number
      paid: number
      remaining: number
      createdAt: string
    }>
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

describe('POST /receipts (createReceipt)', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Owner tạo phiếu thu FIFO 250k → 201, debt KH giảm đúng, debts cập nhật đúng', async () => {
    const r = await jsonReq<{ data: ReceiptResp }>(
      env,
      'POST',
      '/',
      {
        customerId: env.customerWithDebtId,
        amount: 250_000,
        note: 'Thu nợ tháng 4',
        allocationMode: 'fifo',
        allocations: [
          { debtId: env.debtA.id, amount: 100_000 },
          { debtId: env.debtB.id, amount: 150_000 },
        ],
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
    expect(r.body.data.amount).toBe(250_000)
    expect(r.body.data.customerName).toBe('KH Có Nợ')
    expect(r.body.data.debtAfter).toBe(200_000)
    expect(r.body.data.allocationCount).toBe(2)
    expect(r.body.data.allocations.length).toBe(2)

    const customerRow = await env.base.db.query.customers.findFirst({
      where: eq(customers.id, env.customerWithDebtId),
    })
    expect(customerRow?.currentDebt).toBe(200_000)

    const debtA = await env.base.db.query.debts.findFirst({ where: eq(debts.id, env.debtA.id) })
    expect(debtA?.paid).toBe(100_000)
    expect(debtA?.remaining).toBe(0)
    const debtB = await env.base.db.query.debts.findFirst({ where: eq(debts.id, env.debtB.id) })
    expect(debtB?.paid).toBe(150_000)
    expect(debtB?.remaining).toBe(50_000)
  })

  it('Manager tạo phiếu thu → 201 (Manager có quyền customers.manage)', async () => {
    const r = await jsonReq<{ data: ReceiptResp }>(
      env,
      'POST',
      '/',
      {
        customerId: env.customerWithDebtId,
        amount: 100_000,
        allocationMode: 'fifo',
        allocations: [{ debtId: env.debtA.id, amount: 100_000 }],
      },
      env.base.manager.authHeader,
    )
    expect(r.status).toBe(201)
  })

  it('Staff tạo → 403 (middleware permission)', async () => {
    const r = await jsonReq<ErrResp>(
      env,
      'POST',
      '/',
      {
        customerId: env.customerWithDebtId,
        amount: 100_000,
        allocationMode: 'fifo',
        allocations: [{ debtId: env.debtA.id, amount: 100_000 }],
      },
      env.base.staff.authHeader,
    )
    expect(r.status).toBe(403)
  })

  it('amount > customer.currentDebt → 422 BUSINESS_RULE_VIOLATION', async () => {
    // Giả lập inconsistency: hạ currentDebt xuống 50k trong khi debts còn 450k
    // Phiếu thu 100k vẫn = SUM allocations nhưng vượt currentDebt
    await env.base.db
      .update(customers)
      .set({ currentDebt: 50_000 })
      .where(eq(customers.id, env.customerWithDebtId))

    const r = await jsonReq<ErrResp>(
      env,
      'POST',
      '/',
      {
        customerId: env.customerWithDebtId,
        amount: 100_000,
        allocationMode: 'fifo',
        allocations: [{ debtId: env.debtA.id, amount: 100_000 }],
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('BUSINESS_RULE_VIOLATION')
    expect(r.body.error.message).toContain('vượt quá tổng nợ')
  })

  it('customer.currentDebt = 0 → 422 với message "không còn nợ"', async () => {
    const r = await jsonReq<ErrResp>(
      env,
      'POST',
      '/',
      {
        customerId: env.customerNoDebtId,
        amount: 100_000,
        allocationMode: 'fifo',
        allocations: [{ debtId: env.debtA.id, amount: 100_000 }],
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(422)
    expect(r.body.error.message).toContain('không còn nợ')
  })

  it('SUM(allocations) !== amount → 400 VALIDATION_ERROR (Zod refine)', async () => {
    const r = await jsonReq<ErrResp>(
      env,
      'POST',
      '/',
      {
        customerId: env.customerWithDebtId,
        amount: 200_000,
        allocationMode: 'fifo',
        allocations: [
          { debtId: env.debtA.id, amount: 100_000 },
          { debtId: env.debtB.id, amount: 50_000 },
        ],
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
  })

  it('Allocations chứa debt KH khác → 422 (cross-customer attack)', async () => {
    // Tạo customer khác + debt khác
    const otherCustomer = await env.base.db
      .insert(customers)
      .values({
        storeId: env.base.storeId,
        name: 'KH Khác',
        phone: '0919999999',
        currentDebt: 100_000,
      })
      .returning({ id: customers.id })

    const otherOrder = await env.base.db
      .insert(orders)
      .values({
        storeId: env.base.storeId,
        orderNumber: 'ORD-Z',
        customerId: otherCustomer[0]!.id,
        userId: env.base.owner.id,
        subtotal: 100_000,
        total: 100_000,
        paymentMethod: 'cash',
        paymentStatus: 'partial',
      })
      .returning({ id: orders.id })

    const otherDebt = await env.base.db
      .insert(debts)
      .values({
        storeId: env.base.storeId,
        orderId: otherOrder[0]!.id,
        customerId: otherCustomer[0]!.id,
        amount: 100_000,
        paid: 0,
        remaining: 100_000,
      })
      .returning({ id: debts.id })

    const r = await jsonReq<ErrResp>(
      env,
      'POST',
      '/',
      {
        customerId: env.customerWithDebtId,
        amount: 100_000,
        allocationMode: 'manual',
        allocations: [{ debtId: otherDebt[0]!.id, amount: 100_000 }],
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(422)
  })

  it('Customer khác store → 404', async () => {
    const otherEnv = await createTestEnv()
    const [otherCustomer] = await otherEnv.db
      .insert(customers)
      .values({
        storeId: otherEnv.storeId,
        name: 'KH Store Khác',
        phone: '0918888888',
        currentDebt: 500_000,
      })
      .returning({ id: customers.id })

    const r = await jsonReq<ErrResp>(
      env,
      'POST',
      '/',
      {
        customerId: otherCustomer!.id,
        amount: 100_000,
        allocationMode: 'fifo',
        allocations: [{ debtId: env.debtA.id, amount: 100_000 }],
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(404)
    await otherEnv.close()
  })

  it('Customer đã soft delete → 404', async () => {
    await env.base.db
      .update(customers)
      .set({ deletedAt: new Date() })
      .where(eq(customers.id, env.customerWithDebtId))

    const r = await jsonReq<ErrResp>(
      env,
      'POST',
      '/',
      {
        customerId: env.customerWithDebtId,
        amount: 100_000,
        allocationMode: 'fifo',
        allocations: [{ debtId: env.debtA.id, amount: 100_000 }],
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(404)
  })

  it('allocation.amount > debt.remaining → 422', async () => {
    const r = await jsonReq<ErrResp>(
      env,
      'POST',
      '/',
      {
        customerId: env.customerWithDebtId,
        amount: 200_000,
        allocationMode: 'manual',
        allocations: [{ debtId: env.debtA.id, amount: 200_000 }],
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(422)
    expect(r.body.error.message).toContain('vượt quá nợ còn lại')
  })

  it('Body thiếu customerId → 400', async () => {
    const r = await jsonReq<ErrResp>(
      env,
      'POST',
      '/',
      {
        amount: 100_000,
        allocationMode: 'fifo',
        allocations: [{ debtId: env.debtA.id, amount: 100_000 }],
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
  })

  it('Audit log có row mới với action=receipt.created và changes đầy đủ', async () => {
    await jsonReq(
      env,
      'POST',
      '/',
      {
        customerId: env.customerWithDebtId,
        amount: 100_000,
        note: 'audit test',
        allocationMode: 'fifo',
        allocations: [{ debtId: env.debtA.id, amount: 100_000 }],
      },
      env.base.owner.authHeader,
    )
    const logs = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'receipt.created'))
    expect(logs.length).toBe(1)
    const changes = logs[0]?.changes as Record<string, unknown>
    expect(changes.amount).toBe(100_000)
    expect(changes.debtBefore).toBe(450_000)
    expect(changes.debtAfter).toBe(350_000)
    expect(changes.customerName).toBe('KH Có Nợ')
    expect(changes.allocationMode).toBe('fifo')
    expect(changes.allocationCount).toBe(1)
    expect(Array.isArray(changes.allocations)).toBe(true)
  })

  it('Sequential receipts: phiếu 1 OK, phiếu 2 vượt nợ → 422', async () => {
    // phiếu 1: 400_000 (giảm debt còn 50_000)
    const r1 = await jsonReq<{ data: ReceiptResp }>(
      env,
      'POST',
      '/',
      {
        customerId: env.customerWithDebtId,
        amount: 400_000,
        allocationMode: 'fifo',
        allocations: [
          { debtId: env.debtA.id, amount: 100_000 },
          { debtId: env.debtB.id, amount: 200_000 },
          { debtId: env.debtC.id, amount: 100_000 },
        ],
      },
      env.base.owner.authHeader,
    )
    expect(r1.status).toBe(201)

    // phiếu 2: 100_000 vượt nợ còn 50_000
    const r2 = await jsonReq<ErrResp>(
      env,
      'POST',
      '/',
      {
        customerId: env.customerWithDebtId,
        amount: 100_000,
        allocationMode: 'fifo',
        allocations: [{ debtId: env.debtC.id, amount: 100_000 }],
      },
      env.base.owner.authHeader,
    )
    expect(r2.status).toBe(422)

    const customerRow = await env.base.db.query.customers.findFirst({
      where: eq(customers.id, env.customerWithDebtId),
    })
    expect(customerRow?.currentDebt).toBe(50_000)

    const allocs = await env.base.db.select().from(receiptAllocations)
    expect(allocs.length).toBe(3)
  })

  it('debt.remaining = 0 sau khi tất toán: row vẫn tồn tại', async () => {
    await jsonReq(
      env,
      'POST',
      '/',
      {
        customerId: env.customerWithDebtId,
        amount: 100_000,
        allocationMode: 'fifo',
        allocations: [{ debtId: env.debtA.id, amount: 100_000 }],
      },
      env.base.owner.authHeader,
    )
    const debtA = await env.base.db.query.debts.findFirst({ where: eq(debts.id, env.debtA.id) })
    expect(debtA).toBeTruthy()
    expect(debtA?.remaining).toBe(0)
  })
})

describe('GET /receipts (listReceipts)', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
    await jsonReq(
      env,
      'POST',
      '/',
      {
        customerId: env.customerWithDebtId,
        amount: 100_000,
        note: 'phiếu 1',
        allocationMode: 'fifo',
        allocations: [{ debtId: env.debtA.id, amount: 100_000 }],
      },
      env.base.owner.authHeader,
    )
    await jsonReq(
      env,
      'POST',
      '/',
      {
        customerId: env.customerWithDebtId,
        amount: 50_000,
        note: 'phiếu 2',
        allocationMode: 'manual',
        allocations: [{ debtId: env.debtB.id, amount: 50_000 }],
      },
      env.base.owner.authHeader,
    )
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Owner list → 200 trả 2 phiếu', async () => {
    const r = await jsonReq<ListResp>(env, 'GET', '/', undefined, env.base.owner.authHeader)
    expect(r.status).toBe(200)
    expect(r.body.data.length).toBe(2)
    expect(r.body.meta.total).toBe(2)
  })

  it('Manager cũng list được', async () => {
    const r = await jsonReq<ListResp>(env, 'GET', '/', undefined, env.base.manager.authHeader)
    expect(r.status).toBe(200)
  })

  it('Staff list → 403', async () => {
    const r = await jsonReq<ErrResp>(env, 'GET', '/', undefined, env.base.staff.authHeader)
    expect(r.status).toBe(403)
  })

  it('filter customerId → chỉ phiếu của KH đó', async () => {
    const r = await jsonReq<ListResp>(
      env,
      'GET',
      `/?customerId=${env.customerWithDebtId}`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.body.data.length).toBe(2)
    expect(r.body.data.every((p) => p.customerId === env.customerWithDebtId)).toBe(true)
  })

  it('search theo ghi chú', async () => {
    const r = await jsonReq<ListResp>(
      env,
      'GET',
      '/?search=' + encodeURIComponent('phiếu 1'),
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.body.data.length).toBe(1)
    expect(r.body.data[0]?.note).toBe('phiếu 1')
  })

  it('multi-tenant: store khác không thấy phiếu store này', async () => {
    const otherEnv = await createTestEnv()
    const otherApp = createReceiptsRoutes({ db: otherEnv.db })
    const res = await otherApp.request('/', { headers: otherEnv.owner.authHeader })
    const body = (await res.json()) as ListResp
    expect(body.data.length).toBe(0)
    await otherEnv.close()
  })

  it('allocationCount đúng trong list response', async () => {
    const r = await jsonReq<ListResp>(env, 'GET', '/', undefined, env.base.owner.authHeader)
    for (const item of r.body.data) {
      expect(item.allocationCount).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('GET /receipts/:id (getReceipt)', () => {
  let env: Env
  let createdId: string
  beforeEach(async () => {
    env = await setup()
    const r = await jsonReq<{ data: ReceiptResp }>(
      env,
      'POST',
      '/',
      {
        customerId: env.customerWithDebtId,
        amount: 250_000,
        allocationMode: 'fifo',
        allocations: [
          { debtId: env.debtA.id, amount: 100_000 },
          { debtId: env.debtB.id, amount: 150_000 },
        ],
      },
      env.base.owner.authHeader,
    )
    createdId = r.body.data.id
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Owner xem detail → 200, debtAfter=null, allocations đầy đủ', async () => {
    const r = await jsonReq<{ data: ReceiptResp }>(
      env,
      'GET',
      `/${createdId}`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.amount).toBe(250_000)
    expect(r.body.data.debtAfter).toBeNull()
    expect(r.body.data.allocations.length).toBe(2)
    expect(r.body.data.allocations[0]?.orderCode).toBeTruthy()
  })

  it('ID không phải uuid → 400', async () => {
    const r = await jsonReq<ErrResp>(env, 'GET', '/not-uuid', undefined, env.base.owner.authHeader)
    expect(r.status).toBe(400)
  })

  it('ID không tồn tại → 404', async () => {
    const r = await jsonReq<ErrResp>(
      env,
      'GET',
      '/01928a8e-1234-7c01-9999-aaaaaaaaaaaa',
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(404)
  })

  it('Khác store → 404', async () => {
    const otherEnv = await createTestEnv()
    const otherApp = createReceiptsRoutes({ db: otherEnv.db })
    const res = await otherApp.request(`/${createdId}`, { headers: otherEnv.owner.authHeader })
    expect(res.status).toBe(404)
    await otherEnv.close()
  })
})

describe('GET /receipts/customer-debts/:customerId (listCustomerOpenDebts)', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    env.base.close()
  })

  it('Trả đúng FIFO với 3 debts, totalRemaining đúng', async () => {
    const r = await jsonReq<OpenDebtsResp>(
      env,
      'GET',
      `/customer-debts/${env.customerWithDebtId}`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.totalRemaining).toBe(450_000)
    expect(r.body.data.items.length).toBe(3)
    expect(r.body.data.items[0]?.orderCode).toBe('ORD-A')
    expect(r.body.data.items[1]?.orderCode).toBe('ORD-B')
    expect(r.body.data.items[2]?.orderCode).toBe('ORD-C')
    expect(r.body.data.customerName).toBe('KH Có Nợ')
  })

  it('Customer không có nợ → totalRemaining=0, items=[]', async () => {
    const r = await jsonReq<OpenDebtsResp>(
      env,
      'GET',
      `/customer-debts/${env.customerNoDebtId}`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.totalRemaining).toBe(0)
    expect(r.body.data.items.length).toBe(0)
  })

  it('Customer khác store → 404', async () => {
    const otherEnv = await createTestEnv()
    const [otherCustomer] = await otherEnv.db
      .insert(customers)
      .values({
        storeId: otherEnv.storeId,
        name: 'KH Store Khác',
        phone: '0917777777',
        currentDebt: 100_000,
      })
      .returning({ id: customers.id })

    const r = await jsonReq<ErrResp>(
      env,
      'GET',
      `/customer-debts/${otherCustomer!.id}`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(404)
    await otherEnv.close()
  })

  it('Customer soft delete → 404', async () => {
    await env.base.db
      .update(customers)
      .set({ deletedAt: new Date() })
      .where(eq(customers.id, env.customerWithDebtId))

    const r = await jsonReq<ErrResp>(
      env,
      'GET',
      `/customer-debts/${env.customerWithDebtId}`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(404)
  })

  it('Sau khi tất toán 1 debt: list chỉ còn 2 items', async () => {
    await jsonReq(
      env,
      'POST',
      '/',
      {
        customerId: env.customerWithDebtId,
        amount: 100_000,
        allocationMode: 'fifo',
        allocations: [{ debtId: env.debtA.id, amount: 100_000 }],
      },
      env.base.owner.authHeader,
    )

    const r = await jsonReq<OpenDebtsResp>(
      env,
      'GET',
      `/customer-debts/${env.customerWithDebtId}`,
      undefined,
      env.base.owner.authHeader,
    )
    expect(r.body.data.items.length).toBe(2)
    expect(r.body.data.totalRemaining).toBe(350_000)
  })
})

describe('Method not allowed (immutable)', () => {
  let env: Env
  let createdId: string
  beforeEach(async () => {
    env = await setup()
    const r = await jsonReq<{ data: ReceiptResp }>(
      env,
      'POST',
      '/',
      {
        customerId: env.customerWithDebtId,
        amount: 100_000,
        allocationMode: 'fifo',
        allocations: [{ debtId: env.debtA.id, amount: 100_000 }],
      },
      env.base.owner.authHeader,
    )
    createdId = r.body.data.id
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('PATCH /:id → 404 hoặc 405', async () => {
    const res = await env.app.request(`/${createdId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...env.base.owner.authHeader },
      body: JSON.stringify({ note: 'sửa' }),
    })
    expect([404, 405]).toContain(res.status)
  })

  it('DELETE /:id → 404 hoặc 405', async () => {
    const res = await env.app.request(`/${createdId}`, {
      method: 'DELETE',
      headers: env.base.owner.authHeader,
    })
    expect([404, 405]).toContain(res.status)
  })

  it('Receipts table có row, allocations cũng có', async () => {
    const r = await env.base.db.select().from(receipts)
    expect(r.length).toBe(1)
    const allocs = await env.base.db.select().from(receiptAllocations)
    expect(allocs.length).toBe(1)
  })
})

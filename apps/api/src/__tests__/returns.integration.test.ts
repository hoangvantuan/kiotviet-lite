import { eq, sql } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  customers,
  debts,
  inventoryTransactions,
  orderItems,
  orderReturnItems,
  orderReturns,
  orders,
  products,
  stores,
  users,
} from '@kiotviet-lite/shared'

import { createOrdersRoutes } from '../routes/orders.routes.js'
import { hashPassword } from '../lib/password.js'
import { signAccessToken } from '../lib/jwt.js'
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
  app: ReturnType<typeof createOrdersRoutes>
  productAId: string
  productBId: string
  paidOrderId: string
  debtOrderId: string
  // Store B for multi-tenant
  storeBId: string
  storeBOwnerAuth: { Authorization: string }
}

async function setup(): Promise<Env> {
  const base = await createTestEnv()
  const app = createOrdersRoutes({ db: base.db })

  // Products
  const [productA] = await base.db
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

  const [productB] = await base.db
    .insert(products)
    .values({
      storeId: base.storeId,
      name: 'SP B',
      sku: 'SKU-B',
      currentStock: 50,
      minStock: 3,
      trackInventory: true,
      unit: 'hộp',
      costPrice: 30000,
      sellingPrice: 60000,
      hasVariants: false,
    })
    .returning()

  // Customer with debt
  const [customer] = await base.db
    .insert(customers)
    .values({
      storeId: base.storeId,
      name: 'KH Test',
      phone: '0911111000',
      currentDebt: 0,
    })
    .returning()

  // Order 1: fully paid
  const [paidOrder] = await base.db
    .insert(orders)
    .values({
      storeId: base.storeId,
      orderNumber: 'HD-260504-0001',
      customerId: customer!.id,
      userId: base.owner.id,
      subtotal: 280000,
      discountAmount: 0,
      total: 280000,
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      cashAmount: 280000,
      change: 0,
      status: 'completed',
    })
    .returning()

  await base.db.insert(orderItems).values([
    {
      orderId: paidOrder!.id,
      productId: productA!.id,
      productName: 'SP A',
      unit: 'cái',
      unitPrice: 100000,
      quantity: 2,
      discountAmount: 0,
      lineTotal: 200000,
    },
    {
      orderId: paidOrder!.id,
      productId: productB!.id,
      productName: 'SP B',
      unit: 'hộp',
      unitPrice: 60000,
      quantity: 1,
      discountAmount: 0,
      discountValue: 0,
      lineTotal: 60000,
    },
  ])

  // Order 2: with debt
  const [debtOrder] = await base.db
    .insert(orders)
    .values({
      storeId: base.storeId,
      orderNumber: 'HD-260504-0002',
      customerId: customer!.id,
      userId: base.owner.id,
      subtotal: 100000,
      discountAmount: 0,
      total: 100000,
      paymentMethod: 'debt',
      paymentStatus: 'unpaid',
      cashAmount: 0,
      change: 0,
      status: 'completed',
    })
    .returning()

  await base.db.insert(orderItems).values({
    orderId: debtOrder!.id,
    productId: productA!.id,
    productName: 'SP A',
    unit: 'cái',
    unitPrice: 100000,
    quantity: 1,
    discountAmount: 0,
    lineTotal: 100000,
  })

  await base.db.insert(debts).values({
    storeId: base.storeId,
    orderId: debtOrder!.id,
    customerId: customer!.id,
    amount: 100000,
    paid: 0,
    remaining: 100000,
  })

  await base.db
    .update(customers)
    .set({ currentDebt: 100000 })
    .where(eq(customers.id, customer!.id))

  // Store B for multi-tenant test
  const [storeB] = await base.db.insert(stores).values({ name: 'Store B' }).returning()
  const storeBPwd = await hashPassword('matkhau123')
  const [storeBOwner] = await base.db
    .insert(users)
    .values({
      storeId: storeB!.id,
      name: 'Owner B',
      phone: '0909999999',
      passwordHash: storeBPwd,
      role: 'owner',
    })
    .returning()

  const storeBOwnerToken = signAccessToken({
    userId: storeBOwner!.id,
    storeId: storeB!.id,
    role: 'owner',
  })

  return {
    base,
    app,
    productAId: productA!.id,
    productBId: productB!.id,
    paidOrderId: paidOrder!.id,
    debtOrderId: debtOrder!.id,
    storeBId: storeB!.id,
    storeBOwnerAuth: { Authorization: `Bearer ${storeBOwnerToken}` },
  }
}

describe('Returns API', () => {
  let env: Env

  beforeEach(async () => {
    env = await setup()
  })

  // Helper to get order items for building return request
  async function getReturnableItems(orderId: string, auth: { Authorization: string }) {
    const res = await env.app.request(`/${orderId}/returnable-items`, {
      method: 'GET',
      headers: auth,
    })
    return res
  }

  async function createReturn(
    orderId: string,
    body: unknown,
    auth: { Authorization: string } = env.base.owner.authHeader,
  ) {
    return env.app.request(`/${orderId}/returns`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  // ------- Test: trả hàng 1 SP, verify tồn kho tăng -------
  it('trả hàng 1 SP → tồn kho tăng, refundAmount > 0', async () => {
    const itemsRes = await getReturnableItems(env.paidOrderId, env.base.owner.authHeader)
    expect(itemsRes.status).toBe(200)
    const { data: items } = (await itemsRes.json()) as { data: Array<{ orderItemId: string; remainingQuantity: number; unitPrice: number; productName: string }> }
    const itemA = items.find((i) => i.productName === 'SP A')!

    const stockBefore = await env.base.db
      .select({ stock: products.currentStock })
      .from(products)
      .where(eq(products.id, env.productAId))
    const prevStock = stockBefore[0]!.stock

    const res = await createReturn(env.paidOrderId, {
      items: [{ orderItemId: itemA.orderItemId, quantity: 1, reason: 'defective' }],
    })
    expect(res.status).toBe(201)
    const { data } = (await res.json()) as { data: { refundAmount: number; debtReductionAmount: number; returnNumber: string } }
    expect(data.refundAmount).toBe(100000)
    expect(data.debtReductionAmount).toBe(0)
    expect(data.returnNumber).toMatch(/^TH-\d{6}-\d{4}$/)

    const stockAfter = await env.base.db
      .select({ stock: products.currentStock })
      .from(products)
      .where(eq(products.id, env.productAId))
    expect(stockAfter[0]!.stock).toBe(prevStock + 1)
  })

  // ------- Test: trả hàng nhiều SP, verify tổng tiền -------
  it('trả nhiều SP cùng lúc → totalAmount = Σ lineTotal', async () => {
    const itemsRes = await getReturnableItems(env.paidOrderId, env.base.owner.authHeader)
    const { data: items } = (await itemsRes.json()) as { data: Array<{ orderItemId: string; productName: string }> }

    const res = await createReturn(env.paidOrderId, {
      items: [
        { orderItemId: items.find((i) => i.productName === 'SP A')!.orderItemId, quantity: 1, reason: 'wrong_product' },
        { orderItemId: items.find((i) => i.productName === 'SP B')!.orderItemId, quantity: 1, reason: 'customer_changed_mind' },
      ],
    })
    expect(res.status).toBe(201)
    const { data } = (await res.json()) as { data: { refundAmount: number; totalAmount: number } }
    expect(data.totalAmount).toBe(160000)
  })

  // ------- Test: trả hàng partial, trả lần 2 verify SL max -------
  it('partial return → lần 2 SL max giảm', async () => {
    const itemsRes = await getReturnableItems(env.paidOrderId, env.base.owner.authHeader)
    const { data: items } = (await itemsRes.json()) as { data: Array<{ orderItemId: string; productName: string; remainingQuantity: number }> }
    const itemA = items.find((i) => i.productName === 'SP A')!
    expect(itemA.remainingQuantity).toBe(2)

    // Return 1
    await createReturn(env.paidOrderId, {
      items: [{ orderItemId: itemA.orderItemId, quantity: 1, reason: 'defective' }],
    })

    // Check remaining after return 1
    const itemsRes2 = await getReturnableItems(env.paidOrderId, env.base.owner.authHeader)
    const { data: items2 } = (await itemsRes2.json()) as { data: Array<{ orderItemId: string; productName: string; remainingQuantity: number; returnedQuantity: number }> }
    const itemA2 = items2.find((i) => i.productName === 'SP A')!
    expect(itemA2.remainingQuantity).toBe(1)
    expect(itemA2.returnedQuantity).toBe(1)
  })

  // ------- Test: trả hàng HĐ có nợ → giảm debt -------
  it('trả hàng HĐ có nợ → giảm debts.remaining + customers.currentDebt', async () => {
    const itemsRes = await getReturnableItems(env.debtOrderId, env.base.owner.authHeader)
    const { data: items } = (await itemsRes.json()) as { data: Array<{ orderItemId: string }> }

    const res = await createReturn(env.debtOrderId, {
      items: [{ orderItemId: items[0]!.orderItemId, quantity: 1, reason: 'defective' }],
    })
    expect(res.status).toBe(201)
    const { data } = (await res.json()) as { data: { debtReductionAmount: number; refundAmount: number } }
    expect(data.debtReductionAmount).toBe(100000)
    expect(data.refundAmount).toBe(0)

    // Verify debt cleared
    const debtRows = await env.base.db
      .select({ remaining: debts.remaining })
      .from(debts)
      .where(eq(debts.orderId, env.debtOrderId))
    expect(Number(debtRows[0]!.remaining)).toBe(0)

    // Verify customer debt reduced
    const custRows = await env.base.db
      .select({ currentDebt: customers.currentDebt })
      .from(customers)
      .where(sql`${customers.phone} = '0911111000'`)
    expect(Number(custRows[0]!.currentDebt)).toBe(0)
  })

  // ------- Test: trả hàng HĐ đã trả đủ → refund amount -------
  it('trả hàng HĐ paid → refundAmount = totalAmount', async () => {
    const itemsRes = await getReturnableItems(env.paidOrderId, env.base.owner.authHeader)
    const { data: items } = (await itemsRes.json()) as { data: Array<{ orderItemId: string; productName: string }> }

    const res = await createReturn(env.paidOrderId, {
      items: [{ orderItemId: items.find((i) => i.productName === 'SP A')!.orderItemId, quantity: 1, reason: 'defective' }],
    })
    const { data } = (await res.json()) as { data: { refundAmount: number; totalAmount: number } }
    expect(data.refundAmount).toBe(data.totalAmount)
  })

  // ------- Test: SL trả > SL còn lại → 400 -------
  it('SL trả vượt SL còn lại → 400', async () => {
    const itemsRes = await getReturnableItems(env.paidOrderId, env.base.owner.authHeader)
    const { data: items } = (await itemsRes.json()) as { data: Array<{ orderItemId: string; productName: string }> }
    const itemA = items.find((i) => i.productName === 'SP A')!

    const res = await createReturn(env.paidOrderId, {
      items: [{ orderItemId: itemA.orderItemId, quantity: 999, reason: 'defective' }],
    })
    expect(res.status).toBe(400)
  })

  // ------- Test: staff gọi API → 403 -------
  it('staff không có quyền tạo return → 403', async () => {
    const res = await createReturn(
      env.paidOrderId,
      { items: [{ orderItemId: 'dummy-id', quantity: 1, reason: 'defective' }] },
      env.base.staff.authHeader,
    )
    expect(res.status).toBe(403)
  })

  // ------- Test: staff xem returnable-items → 403 -------
  it('staff không có quyền xem returnable-items → 403', async () => {
    const res = await getReturnableItems(env.paidOrderId, env.base.staff.authHeader)
    expect(res.status).toBe(403)
  })

  // ------- Test: multi-tenant isolation -------
  it('store B owner không truy cập order store A → 404', async () => {
    const itemsRes = await getReturnableItems(env.paidOrderId, env.base.owner.authHeader)
    const { data: items } = (await itemsRes.json()) as { data: Array<{ orderItemId: string }> }

    const res = await createReturn(
      env.paidOrderId,
      { items: [{ orderItemId: items[0]!.orderItemId, quantity: 1, reason: 'defective' }] },
      env.storeBOwnerAuth,
    )
    expect(res.status).toBe(404)
  })

  // ------- Test: trả hết toàn bộ → status = full_return -------
  it('trả hết tất cả SP → order status = full_return', async () => {
    const itemsRes = await getReturnableItems(env.paidOrderId, env.base.owner.authHeader)
    const { data: items } = (await itemsRes.json()) as { data: Array<{ orderItemId: string; remainingQuantity: number }> }

    const res = await createReturn(env.paidOrderId, {
      items: items.map((i) => ({ orderItemId: i.orderItemId, quantity: i.remainingQuantity, reason: 'other' })),
    })
    expect(res.status).toBe(201)

    const orderRows = await env.base.db
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, env.paidOrderId))
    expect(orderRows[0]!.status).toBe('full_return')
  })

  // ------- Test: GET returns history -------
  it('GET /:id/returns → trả về lịch sử trả hàng', async () => {
    const itemsRes = await getReturnableItems(env.paidOrderId, env.base.owner.authHeader)
    const { data: items } = (await itemsRes.json()) as { data: Array<{ orderItemId: string }> }

    await createReturn(env.paidOrderId, {
      items: [{ orderItemId: items[0]!.orderItemId, quantity: 1, reason: 'defective' }],
    })

    const historyRes = await env.app.request(`/${env.paidOrderId}/returns`, {
      method: 'GET',
      headers: env.base.owner.authHeader,
    })
    expect(historyRes.status).toBe(200)
    const { data: returnList } = (await historyRes.json()) as { data: Array<{ returnNumber: string; items: Array<unknown> }> }
    expect(returnList).toHaveLength(1)
    expect(returnList[0]!.items).toHaveLength(1)
  })

  // ------- Test: manager có thể tạo return -------
  it('manager có quyền tạo return', async () => {
    const itemsRes = await getReturnableItems(env.paidOrderId, env.base.manager.authHeader)
    expect(itemsRes.status).toBe(200)
    const { data: items } = (await itemsRes.json()) as { data: Array<{ orderItemId: string }> }

    const res = await createReturn(
      env.paidOrderId,
      { items: [{ orderItemId: items[0]!.orderItemId, quantity: 1, reason: 'defective' }] },
      env.base.manager.authHeader,
    )
    expect(res.status).toBe(201)
  })
})

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  orderItems,
  orderReturns,
  orders,
  products,
  purchaseOrders,
  stores,
  supplierPayments,
  suppliers,
  users,
} from '@kiotviet-lite/shared'
import * as schema from '@kiotviet-lite/shared/schema'

import type { Db } from '../db/index.js'
import { signAccessToken } from '../lib/jwt.js'
import { createOrdersRoutes } from '../routes/orders.routes.js'
import { createPosRoutes } from '../routes/pos.routes.js'
import { createPurchaseOrdersRoutes } from '../routes/purchase-orders.routes.js'
import { createSupplierPaymentsRoutes } from '../routes/supplier-payments.routes.js'
import { createSyncRoutes } from '../routes/sync.routes.js'

/**
 * OFF-08 và POS-02 (R4) cần nhiều kết nối thật chạy song song: PGlite chỉ có một kết nối nên
 * không tái hiện được hai transaction cùng đọc MAX mã hay cùng giành một Idempotency-Key.
 * Test chạy khi có `TEST_PG_URL` (Postgres dùng riêng cho test, cần quyền CREATE DATABASE).
 */
const adminUrl = process.env.TEST_PG_URL
const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(__dirname, '../db/migrations')

const PARALLEL = 5

describe.skipIf(!adminUrl)('R4 OFF-08, POS-02: chứng từ tạo song song trên Postgres thật', () => {
  const dbName = `kvl_r4_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
  let admin: postgres.Sql
  let client: postgres.Sql
  let db: Db
  let seq = 0

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
    process.env.ACCESS_TOKEN_TTL_SECONDS = '900'
    admin = postgres(adminUrl!, { max: 1, onnotice: () => {} })
    await admin.unsafe(`CREATE DATABASE ${dbName}`)
    const url = new URL(adminUrl!)
    url.pathname = `/${dbName}`
    client = postgres(url.toString(), { max: 20, onnotice: () => {} })
    db = drizzle(client, { schema, casing: 'snake_case' }) as unknown as Db
    await migrate(db, { migrationsFolder })
  })

  afterAll(async () => {
    await client?.end()
    await admin?.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`)
    await admin?.end()
  })

  /** Cửa hàng riêng cho mỗi test: chủ cửa hàng, một sản phẩm tồn 100, một nhà cung cấp đang nợ. */
  async function seedStore() {
    const n = ++seq
    const [store] = await db
      .insert(stores)
      .values({ name: `Cửa hàng R4 ${n}` })
      .returning()
    const [owner] = await db
      .insert(users)
      .values({
        storeId: store!.id,
        name: 'Chủ',
        phone: `09040${n}0001`,
        passwordHash: 'x',
        role: 'owner',
      })
      .returning()
    const [product] = await db
      .insert(products)
      .values({
        storeId: store!.id,
        name: 'Mì R4',
        sku: `R4-${n}`,
        unit: 'gói',
        sellingPrice: 10_000,
        costPrice: 6_000,
        currentStock: 100,
        trackInventory: true,
      })
      .returning()
    const [supplier] = await db
      .insert(suppliers)
      .values({ storeId: store!.id, code: `NCC-R4-${n}`, name: 'NCC R4', currentDebt: 1_000_000 })
      .returning()
    const token = signAccessToken({ userId: owner!.id, storeId: store!.id, role: 'owner' })
    return { store: store!, owner: owner!, product: product!, supplier: supplier!, token }
  }

  type Seed = Awaited<ReturnType<typeof seedStore>>

  function post(
    s: Seed,
    app: { request: (path: string, init?: RequestInit) => Response | Promise<Response> },
    path: string,
    body: unknown,
    key?: string,
  ) {
    return Promise.resolve(
      app.request(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${s.token}`,
          ...(key ? { 'Idempotency-Key': key } : {}),
        },
        body: JSON.stringify(body),
      }),
    )
  }

  function orderPayload(s: Seed, extra: Record<string, unknown> = {}) {
    return {
      subtotal: 10_000,
      discountAmount: 0,
      total: 10_000,
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      cashAmount: 10_000,
      items: [
        {
          productId: s.product.id,
          productName: 'Mì R4',
          unit: 'gói',
          unitPrice: 10_000,
          quantity: 1,
          discountAmount: 0,
          lineTotal: 10_000,
        },
      ],
      ...extra,
    }
  }

  async function stockOf(s: Seed) {
    const [row] = await db.select().from(products).where(eq(products.id, s.product.id))
    return Number(row!.currentStock)
  }

  async function statuses(responses: Response[]) {
    return Promise.all(
      responses.map(async (r) => (r.status === 201 ? 201 : `${r.status} ${await r.text()}`)),
    )
  }

  it(`${PARALLEL} đơn bán cùng lúc đều thành công, mã đơn không trùng`, async () => {
    const s = await seedStore()
    const app = createPosRoutes({ db })

    const responses = await Promise.all(
      Array.from({ length: PARALLEL }, () => post(s, app, '/orders', orderPayload(s))),
    )

    expect(await statuses(responses)).toEqual(Array(PARALLEL).fill(201))
    const rows = await db.select().from(orders).where(eq(orders.storeId, s.store.id))
    const numbers = rows.map((r) => r.orderNumber).sort()
    expect(new Set(numbers).size).toBe(PARALLEL)
    expect(numbers.map((n) => n.slice(-4))).toEqual(['0001', '0002', '0003', '0004', '0005'])
    expect(await stockOf(s)).toBe(100 - PARALLEL)
  })

  it(`${PARALLEL} đơn ngoại tuyến đẩy lên cùng lúc (mỗi máy một request) đều được nhận`, async () => {
    const s = await seedStore()
    const app = createSyncRoutes({ db })

    const responses = await Promise.all(
      Array.from({ length: PARALLEL }, () =>
        post(s, app, '/push', {
          orders: [
            {
              clientId: randomUUID(),
              createdAt: new Date().toISOString(),
              orderData: orderPayload(s),
            },
          ],
        }),
      ),
    )

    const results = await Promise.all(
      responses.map(async (r) => {
        const body = (await r.json()) as { data: { results: Array<{ status: string }> } }
        return body.data.results[0]!.status
      }),
    )
    expect(results).toEqual(Array(PARALLEL).fill('synced'))
    const rows = await db.select().from(orders).where(eq(orders.storeId, s.store.id))
    expect(new Set(rows.map((r) => r.orderNumber)).size).toBe(PARALLEL)
  })

  it(`${PARALLEL} phiếu nhập và ${PARALLEL} phiếu trả cùng lúc: mã không trùng`, async () => {
    const s = await seedStore()
    const [order] = await db
      .insert(orders)
      .values({
        storeId: s.store.id,
        orderNumber: 'HD-CU-0001',
        userId: s.owner.id,
        subtotal: 100_000,
        discountAmount: 0,
        total: 100_000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 100_000,
        change: 0,
        status: 'completed',
      })
      .returning()
    const [item] = await db
      .insert(orderItems)
      .values({
        orderId: order!.id,
        productId: s.product.id,
        productName: 'Mì R4',
        unit: 'gói',
        unitPrice: 10_000,
        quantity: 10,
        discountAmount: 0,
        lineTotal: 100_000,
      })
      .returning()
    const purchaseApp = createPurchaseOrdersRoutes({ db })
    const ordersApp = createOrdersRoutes({ db })

    const responses = await Promise.all([
      ...Array.from({ length: PARALLEL }, () =>
        post(s, purchaseApp, '/', {
          supplierId: s.supplier.id,
          items: [{ productId: s.product.id, quantity: 2, unitPrice: 6_000 }],
          paidAmount: 12_000,
        }),
      ),
      ...Array.from({ length: PARALLEL }, () =>
        post(s, ordersApp, `/${order!.id}/returns`, {
          items: [{ orderItemId: item!.id, quantity: 1, reason: 'defective' }],
        }),
      ),
    ])

    expect(await statuses(responses)).toEqual(Array(PARALLEL * 2).fill(201))
    const purchaseRows = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.storeId, s.store.id))
    expect(new Set(purchaseRows.map((r) => r.code)).size).toBe(PARALLEL)
    const returnRows = await db
      .select()
      .from(orderReturns)
      .where(eq(orderReturns.storeId, s.store.id))
    expect(new Set(returnRows.map((r) => r.returnNumber)).size).toBe(PARALLEL)
    // +5 × 2 nhập, +5 × 1 trả
    expect(await stockOf(s)).toBe(100 + PARALLEL * 2 + PARALLEL)
  })

  it('hai request cùng Idempotency-Key tới cùng lúc: một chứng từ, kho trừ một lần', async () => {
    const s = await seedStore()
    const app = createPosRoutes({ db })
    const key = randomUUID()

    const responses = await Promise.all([
      post(s, app, '/orders', orderPayload(s), key),
      post(s, app, '/orders', orderPayload(s), key),
    ])

    expect(await statuses(responses)).toEqual([201, 201])
    const bodies = (await Promise.all(responses.map((r) => r.json()))) as Array<{
      data: { id: string }
    }>
    expect(bodies[0]!.data.id).toBe(bodies[1]!.data.id)
    const rows = await db.select().from(orders).where(eq(orders.storeId, s.store.id))
    expect(rows).toHaveLength(1)
    expect(await stockOf(s)).toBe(99)
  })

  it('hai phiếu chi cùng khóa tới cùng lúc: nợ nhà cung cấp giảm một lần', async () => {
    const s = await seedStore()
    const app = createSupplierPaymentsRoutes({ db })
    const key = randomUUID()
    const body = { supplierId: s.supplier.id, amount: 100_000 }

    const responses = await Promise.all([
      post(s, app, '/', body, key),
      post(s, app, '/', body, key),
    ])

    expect(await statuses(responses)).toEqual([201, 201])
    const rows = await db
      .select()
      .from(supplierPayments)
      .where(eq(supplierPayments.storeId, s.store.id))
    expect(rows).toHaveLength(1)
    const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, s.supplier.id))
    expect(Number(supplier!.currentDebt)).toBe(900_000)
  })
})

/**
 * BM-02 (P0): cửa hàng B gắn khách của cửa hàng A vào đơn tiền mặt rồi đọc thông tin A.
 *
 * Theo đúng bước tái hiện gốc (w6-baomat, w6b-baomat, w9-verify):
 * (1) có cửa hàng B riêng, (2) B có sản phẩm riêng giá 1.000, (3) token B tạo đơn tiền mặt
 * với `customerId` của A qua `/pos/orders` và `/sync/push`, (4) token B đọc `/orders`,
 * `/orders/:id` và báo cáo doanh thu theo khách. Thêm: UUID không tồn tại từng lộ 500.
 */
import { and, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { customers, orders } from '@kiotviet-lite/shared'

import { errorHandler } from '../middleware/error-handler.js'
import { createOrdersRoutes } from '../routes/orders.routes.js'
import { createPosRoutes } from '../routes/pos.routes.js'
import { createReportsRoutes } from '../routes/reports.routes.js'
import { createSyncRoutes } from '../routes/sync.routes.js'
import { createCustomer, createProduct, createStore, createUser } from './helpers/factories.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

const A_CUSTOMER_NAME = 'Phạm Thị Dung'
const A_CUSTOMER_PHONE = '0911000001'

let env: TestEnv
let app: Hono
let storeB: string
let authB: { Authorization: string }
let productB: string
let customerA: string

function cashOrder(customerId: string | null) {
  return {
    customerId,
    subtotal: 1000,
    discountAmount: 0,
    total: 1000,
    paymentMethod: 'cash',
    cashAmount: 1000,
    items: [
      {
        productId: productB,
        productName: 'B-TEST-001',
        unitPrice: 1000,
        quantity: 1,
        lineTotal: 1000,
      },
    ],
  }
}

function post(path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authB },
    body: JSON.stringify(body),
  })
}

beforeAll(async () => {
  env = await createTestEnv()
  const customer = await createCustomer(env, { name: A_CUSTOMER_NAME, phone: A_CUSTOMER_PHONE })
  customerA = customer.id

  const store = await createStore(env, { name: 'Cửa hàng B' })
  storeB = store.id
  const ownerB = await createUser(env, { storeId: storeB, role: 'owner' })
  authB = ownerB.authHeader
  const product = await createProduct(env, {
    storeId: storeB,
    name: 'B-TEST-001',
    sku: 'B-TEST-001',
    sellingPrice: 1000,
    costPrice: 500,
  })
  productB = product.id

  app = new Hono()
  app.onError(errorHandler)
  app.route('/pos', createPosRoutes({ db: env.db }))
  app.route('/sync', createSyncRoutes({ db: env.db }))
  app.route('/orders', createOrdersRoutes({ db: env.db }))
  app.route('/reports', createReportsRoutes({ db: env.db }))
})

afterAll(async () => {
  await env.close()
})

describe('BM-02: đơn không được tham chiếu khách của cửa hàng khác', () => {
  it('đối chứng: đơn tiền mặt không có khách của B vẫn tạo được', async () => {
    const res = await post('/pos/orders', cashOrder(null))
    expect(res.status).toBe(201)
  })

  it('POST /pos/orders tiền mặt với customerId của A trả 404, không tạo đơn', async () => {
    const res = await post('/pos/orders', cashOrder(customerA))
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('NOT_FOUND')
    expect(body.error.message).toBe('Không tìm thấy khách hàng')

    const leaked = await env.db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.storeId, storeB), eq(orders.customerId, customerA)))
    expect(leaked).toHaveLength(0)
  })

  it('POST /pos/orders với customerId không tồn tại trả 404 như ID của cửa hàng khác, không 500', async () => {
    const res = await post('/pos/orders', cashOrder('00000000-0000-4000-8000-000000000001'))
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: { message: string } }
    expect(body.error.message).toBe('Không tìm thấy khách hàng')
  })

  it('POST /sync/push đơn tiền mặt với customerId của A trả kết quả error NOT_FOUND', async () => {
    const res = await post('/sync/push', {
      orders: [
        {
          clientId: '00000000-0000-4000-8000-0000000000b2',
          createdAt: new Date().toISOString(),
          orderData: cashOrder(customerA),
        },
      ],
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: { results: Array<{ status: string; error?: { code: string } }> }
    }
    expect(body.data.results[0]?.status).toBe('error')
    expect(body.data.results[0]?.error?.code).toBe('NOT_FOUND')

    const leaked = await env.db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.storeId, storeB), eq(orders.customerId, customerA)))
    expect(leaked).toHaveLength(0)
  })

  it('GET /orders, /orders/:id và báo cáo doanh thu theo khách của B không chứa dữ liệu khách A', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const list = await app.request('/orders', { headers: authB })
    expect(list.status).toBe(200)
    const listText = await list.text()
    const firstId = (JSON.parse(listText) as { data: Array<{ id: string }> }).data[0]?.id
    expect(firstId).toBeDefined()
    const detail = await app.request(`/orders/${firstId}`, { headers: authB })
    const report = await app.request(`/reports/revenue?tab=customer&from=${today}&to=${today}`, {
      headers: authB,
    })
    for (const text of [listText, await detail.text(), await report.text()]) {
      expect(text).not.toContain(A_CUSTOMER_NAME)
      expect(text).not.toContain(A_CUSTOMER_PHONE)
    }
  })

  it('DB chặn trực tiếp đơn của B tham chiếu khách của A (khóa ngoại ghép store_id, customer_id)', async () => {
    await expect(
      env.db.insert(orders).values({
        storeId: storeB,
        orderNumber: 'HD-FK-TEST',
        customerId: customerA,
        userId: env.owner.id,
        subtotal: 1000,
        total: 1000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
      }),
    ).rejects.toThrow()
  })

  it('xóa cứng khách vẫn gỡ liên kết đơn (ON DELETE SET NULL) dù có khóa ngoại ghép', async () => {
    const customerB = await createCustomer(env, { storeId: storeB })
    const res = await post('/pos/orders', cashOrder(customerB.id))
    expect(res.status).toBe(201)
    const { data } = (await res.json()) as { data: { id: string } }

    await env.db.delete(customers).where(eq(customers.id, customerB.id))
    const [row] = await env.db
      .select({ customerId: orders.customerId })
      .from(orders)
      .where(eq(orders.id, data.id))
    expect(row?.customerId).toBeNull()
  })
})

describe('BM-02: migration khóa ngoại ghép an toàn với dữ liệu sai có sẵn', () => {
  it('gỡ liên kết chéo cửa hàng rồi thêm được ràng buộc, liên kết đúng giữ nguyên', async () => {
    const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../db/migrations')
    const file = readdirSync(migrationsDir).find((f) =>
      readFileSync(resolve(migrationsDir, f), 'utf8').includes('fk_orders_store_customer'),
    )
    expect(file).toBeDefined()
    const migrationSql = readFileSync(resolve(migrationsDir, file ?? ''), 'utf8')

    const local = await createTestEnv()
    try {
      // Đưa DB về trạng thái trước migration: chưa có ràng buộc, cho phép dữ liệu BM-02 đã lọt vào
      await local.pglite.exec(`
        ALTER TABLE orders DROP CONSTRAINT fk_orders_store_customer;
        ALTER TABLE orders DROP CONSTRAINT fk_orders_store_price_list;
        DROP INDEX uniq_customers_store_id;
        DROP INDEX uniq_price_lists_store_id;
      `)
      const customerA = await createCustomer(local)
      const otherStore = await createStore(local)
      const otherOwner = await createUser(local, { storeId: otherStore.id, role: 'owner' })
      const customerOther = await createCustomer(local, { storeId: otherStore.id })
      const base = {
        userId: otherOwner.id,
        subtotal: 1000,
        total: 1000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
      }
      const [bad] = await local.db
        .insert(orders)
        .values({
          ...base,
          storeId: otherStore.id,
          orderNumber: 'HD-BAD',
          customerId: customerA.id,
        })
        .returning({ id: orders.id })
      const [good] = await local.db
        .insert(orders)
        .values({
          ...base,
          storeId: otherStore.id,
          orderNumber: 'HD-GOOD',
          customerId: customerOther.id,
        })
        .returning({ id: orders.id })

      for (const statement of migrationSql.split('--> statement-breakpoint')) {
        await local.db.execute(sql.raw(statement))
      }

      const rows = await local.db
        .select({ id: orders.id, customerId: orders.customerId })
        .from(orders)
        .where(eq(orders.storeId, otherStore.id))
      expect(rows.find((r) => r.id === bad?.id)?.customerId).toBeNull()
      expect(rows.find((r) => r.id === good?.id)?.customerId).toBe(customerOther.id)
    } finally {
      await local.close()
    }
  })
})

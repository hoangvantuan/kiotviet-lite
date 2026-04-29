import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { auditLogs, customerPrices, customers, products, stores } from '@kiotviet-lite/shared'

import { createCustomerPricesRoutes } from '../routes/customer-prices.routes.js'
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
  app: ReturnType<typeof createCustomerPricesRoutes>
  productIds: string[]
  customerIds: string[]
}

async function setup(): Promise<Env> {
  const base = await createTestEnv()
  const app = createCustomerPricesRoutes({ db: base.db })

  const insertedProducts = await base.db
    .insert(products)
    .values(
      Array.from({ length: 5 }, (_, i) => ({
        storeId: base.storeId,
        name: `Sản phẩm ${i + 1}`,
        sku: `SKU${i + 1}`,
        sellingPrice: 100000 + i * 10000,
        costPrice: 50000,
      })),
    )
    .returning({ id: products.id })

  const insertedCustomers = await base.db
    .insert(customers)
    .values([
      {
        storeId: base.storeId,
        name: 'Nguyễn Văn A',
        phone: '0911111111',
      },
      {
        storeId: base.storeId,
        name: 'Trần Thị B',
        phone: '0922222222',
      },
    ])
    .returning({ id: customers.id })

  return {
    base,
    app,
    productIds: insertedProducts.map((p) => p.id),
    customerIds: insertedCustomers.map((c) => c.id),
  }
}

async function reqJson<T>(
  env: Env,
  method: string,
  path: string,
  body: unknown | undefined,
  authHeader: { Authorization: string },
): Promise<{ status: number; body: T }> {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeader },
  }
  if (body !== undefined) init.body = JSON.stringify(body)
  const res = await env.app.request(path, init)
  return { status: res.status, body: (await res.json()) as T }
}

const get = <T>(env: Env, path: string, ah: { Authorization: string }) =>
  reqJson<T>(env, 'GET', path, undefined, ah)
const post = <T>(env: Env, path: string, body: unknown, ah: { Authorization: string }) =>
  reqJson<T>(env, 'POST', path, body, ah)
const patch = <T>(env: Env, path: string, body: unknown, ah: { Authorization: string }) =>
  reqJson<T>(env, 'PATCH', path, body, ah)
const del = <T>(env: Env, path: string, ah: { Authorization: string }) =>
  reqJson<T>(env, 'DELETE', path, undefined, ah)

describe('POST /customer-prices', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Owner tạo OK 201', async () => {
    const r = await post<{
      data: { id: string; price: number; customerName: string; productName: string }
    }>(
      env,
      '/',
      {
        customerId: env.customerIds[0],
        productId: env.productIds[0],
        price: 45000,
        note: 'Khách VIP',
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
    expect(r.body.data.price).toBe(45000)
    expect(r.body.data.customerName).toBe('Nguyễn Văn A')
    expect(r.body.data.productName).toBe('Sản phẩm 1')
  })

  it('Manager tạo OK', async () => {
    const r = await post(
      env,
      '/',
      {
        customerId: env.customerIds[0],
        productId: env.productIds[0],
        price: 45000,
      },
      env.base.manager.authHeader,
    )
    expect(r.status).toBe(201)
  })

  it('Staff tạo → 403', async () => {
    const r = await post(
      env,
      '/',
      {
        customerId: env.customerIds[0],
        productId: env.productIds[0],
        price: 45000,
      },
      env.base.staff.authHeader,
    )
    expect(r.status).toBe(403)
  })

  it('customerId không cùng store → 404', async () => {
    // Tạo store khác và customer thuộc store khác
    const [otherStore] = await env.base.db
      .insert(stores)
      .values({ name: 'Cửa hàng khác' })
      .returning()
    const [otherCustomer] = await env.base.db
      .insert(customers)
      .values({ storeId: otherStore!.id, name: 'Khách khác', phone: '0933333333' })
      .returning()
    const r = await post<{ error: { code: string } }>(
      env,
      '/',
      {
        customerId: otherCustomer!.id,
        productId: env.productIds[0],
        price: 1000,
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(404)
  })

  it('productId không cùng store → 404', async () => {
    const r = await post<{ error: { code: string } }>(
      env,
      '/',
      {
        customerId: env.customerIds[0],
        productId: '00000000-0000-7000-8000-000000000099',
        price: 1000,
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(404)
  })

  it('trùng (customerId, productId) → 409 field=productId', async () => {
    await post(
      env,
      '/',
      { customerId: env.customerIds[0], productId: env.productIds[0], price: 1000 },
      env.base.owner.authHeader,
    )
    const r = await post<{ error: { code: string; details: { field: string } } }>(
      env,
      '/',
      { customerId: env.customerIds[0], productId: env.productIds[0], price: 2000 },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('CONFLICT')
    expect(r.body.error.details.field).toBe('productId')
  })

  it('price âm → 400', async () => {
    const r = await post<{ error: { code: string } }>(
      env,
      '/',
      {
        customerId: env.customerIds[0],
        productId: env.productIds[0],
        price: -100,
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('audit ghi customer_price.created với actorRole', async () => {
    const r = await post<{ data: { id: string } }>(
      env,
      '/',
      { customerId: env.customerIds[0], productId: env.productIds[0], price: 45000 },
      env.base.owner.authHeader,
    )
    const audits = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.targetId, r.body.data.id))
    expect(audits.length).toBe(1)
    expect(audits[0]?.action).toBe('customer_price.created')
    expect(audits[0]?.actorRole).toBe('owner')
  })
})

describe('GET /customer-prices', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
    // Seed 3 customer prices
    await post(
      env,
      '/',
      { customerId: env.customerIds[0], productId: env.productIds[0], price: 45000 },
      env.base.owner.authHeader,
    )
    await post(
      env,
      '/',
      { customerId: env.customerIds[0], productId: env.productIds[1], price: 60000 },
      env.base.owner.authHeader,
    )
    await post(
      env,
      '/',
      { customerId: env.customerIds[1], productId: env.productIds[0], price: 50000 },
      env.base.owner.authHeader,
    )
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Default list trả meta + items', async () => {
    const r = await get<{
      data: Array<{ customerName: string; productName: string; price: number }>
      meta: { total: number }
    }>(env, '/', env.base.owner.authHeader)
    expect(r.status).toBe(200)
    expect(r.body.meta.total).toBe(3)
    expect(r.body.data.length).toBe(3)
  })

  it('filter customerId', async () => {
    const r = await get<{ data: Array<{ customerName: string }>; meta: { total: number } }>(
      env,
      `/?customerId=${env.customerIds[0]}`,
      env.base.owner.authHeader,
    )
    expect(r.body.meta.total).toBe(2)
    expect(r.body.data.every((d) => d.customerName === 'Nguyễn Văn A')).toBe(true)
  })

  it('filter productId', async () => {
    const r = await get<{ data: Array<{ productName: string }>; meta: { total: number } }>(
      env,
      `/?productId=${env.productIds[0]}`,
      env.base.owner.authHeader,
    )
    expect(r.body.meta.total).toBe(2)
    expect(r.body.data.every((d) => d.productName === 'Sản phẩm 1')).toBe(true)
  })

  it('search theo tên KH', async () => {
    const r = await get<{ data: Array<{ customerName: string }>; meta: { total: number } }>(
      env,
      `/?search=Trần`,
      env.base.owner.authHeader,
    )
    expect(r.body.meta.total).toBe(1)
    expect(r.body.data[0]?.customerName).toBe('Trần Thị B')
  })

  it('search theo tên SP', async () => {
    const r = await get<{ data: Array<{ productName: string }>; meta: { total: number } }>(
      env,
      `/?search=Sản phẩm 2`,
      env.base.owner.authHeader,
    )
    expect(r.body.meta.total).toBe(1)
  })

  it('search escape ký tự đặc biệt %', async () => {
    const r = await get<{ data: Array<unknown>; meta: { total: number } }>(
      env,
      `/?search=%25`,
      env.base.owner.authHeader,
    )
    expect(r.body.meta.total).toBe(0)
  })

  it('loại trừ row có customer đã soft delete', async () => {
    await env.base.db
      .update(customers)
      .set({ deletedAt: new Date() })
      .where(eq(customers.id, env.customerIds[0]!))
    const r = await get<{ meta: { total: number } }>(env, '/', env.base.owner.authHeader)
    expect(r.body.meta.total).toBe(1)
  })

  it('loại trừ row có product đã soft delete', async () => {
    await env.base.db
      .update(products)
      .set({ deletedAt: new Date() })
      .where(eq(products.id, env.productIds[0]!))
    const r = await get<{ meta: { total: number } }>(env, '/', env.base.owner.authHeader)
    expect(r.body.meta.total).toBe(1)
  })
})

describe('PATCH /customer-prices/:id', () => {
  let env: Env
  let createdId: string
  beforeEach(async () => {
    env = await setup()
    const r = await post<{ data: { id: string } }>(
      env,
      '/',
      { customerId: env.customerIds[0], productId: env.productIds[0], price: 45000 },
      env.base.owner.authHeader,
    )
    createdId = r.body.data.id
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('cập nhật price OK', async () => {
    const r = await patch<{ data: { price: number } }>(
      env,
      `/${createdId}`,
      { price: 42000 },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.price).toBe(42000)
  })

  it('cập nhật note OK', async () => {
    const r = await patch<{ data: { note: string } }>(
      env,
      `/${createdId}`,
      { note: 'Note mới' },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.note).toBe('Note mới')
  })

  it('reject empty body', async () => {
    const r = await patch<{ error: { code: string } }>(
      env,
      `/${createdId}`,
      {},
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
  })

  it('reject sửa customerId (strict)', async () => {
    const r = await patch<{ error: { code: string } }>(
      env,
      `/${createdId}`,
      { customerId: env.customerIds[1] },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
  })

  it('reject sửa productId (strict)', async () => {
    const r = await patch<{ error: { code: string } }>(
      env,
      `/${createdId}`,
      { productId: env.productIds[1] },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
  })

  it('audit ghi diff before/after', async () => {
    await patch(env, `/${createdId}`, { price: 42000 }, env.base.owner.authHeader)
    const audits = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.targetId, createdId))
    const updateAudit = audits.find((a) => a.action === 'customer_price.updated')
    expect(updateAudit).toBeDefined()
    const changes = updateAudit?.changes as { price: { before: number; after: number } }
    expect(changes.price.before).toBe(45000)
    expect(changes.price.after).toBe(42000)
  })
})

describe('DELETE /customer-prices/:id', () => {
  let env: Env
  let createdId: string
  beforeEach(async () => {
    env = await setup()
    const r = await post<{ data: { id: string } }>(
      env,
      '/',
      { customerId: env.customerIds[0], productId: env.productIds[0], price: 45000 },
      env.base.owner.authHeader,
    )
    createdId = r.body.data.id
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('hard delete OK + audit ghi snapshot', async () => {
    const r = await del<{ data: { ok: boolean } }>(env, `/${createdId}`, env.base.owner.authHeader)
    expect(r.status).toBe(200)
    const remaining = await env.base.db
      .select()
      .from(customerPrices)
      .where(eq(customerPrices.id, createdId))
    expect(remaining.length).toBe(0)

    const audits = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.targetId, createdId))
    const deleteAudit = audits.find((a) => a.action === 'customer_price.deleted')
    expect(deleteAudit).toBeDefined()
    const changes = deleteAudit?.changes as { price: number; customerId: string }
    expect(changes.price).toBe(45000)
    expect(changes.customerId).toBe(env.customerIds[0])
  })

  it('không tìm thấy → 404', async () => {
    const r = await del<{ error: { code: string } }>(
      env,
      `/00000000-0000-7000-8000-000000000099`,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(404)
  })
})

describe('Multi-tenant isolation', () => {
  let env: Env
  let createdId: string
  beforeEach(async () => {
    env = await setup()
    const r = await post<{ data: { id: string } }>(
      env,
      '/',
      { customerId: env.customerIds[0], productId: env.productIds[0], price: 45000 },
      env.base.owner.authHeader,
    )
    createdId = r.body.data.id
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Store khác KHÔNG xem được giá riêng store này', async () => {
    // Tạo store mới + user owner thuộc store đó
    const [otherStore] = await env.base.db
      .insert(stores)
      .values({ name: 'Cửa hàng khác' })
      .returning()
    const { signAccessToken } = await import('../lib/jwt.js')
    const { hashPassword } = await import('../lib/password.js')
    const { users } = await import('@kiotviet-lite/shared')
    const pwd = await hashPassword('matkhau123')
    const pin = await hashPassword('111111')
    const [otherOwner] = await env.base.db
      .insert(users)
      .values({
        storeId: otherStore!.id,
        name: 'Owner B',
        phone: '0944444444',
        passwordHash: pwd,
        pinHash: pin,
        role: 'owner',
      })
      .returning()
    const token = signAccessToken({
      userId: otherOwner!.id,
      storeId: otherStore!.id,
      role: 'owner',
    })
    const ah = { Authorization: `Bearer ${token}` }

    // Read list → 0 results
    const r1 = await get<{ meta: { total: number } }>(env, '/', ah)
    expect(r1.body.meta.total).toBe(0)

    // Get by id → 404
    const r2 = await get<{ error: { code: string } }>(env, `/${createdId}`, ah)
    expect(r2.status).toBe(404)

    // Patch by id → 404
    const r3 = await patch<{ error: { code: string } }>(env, `/${createdId}`, { price: 1 }, ah)
    expect(r3.status).toBe(404)

    // Delete by id → 404
    const r4 = await del<{ error: { code: string } }>(env, `/${createdId}`, ah)
    expect(r4.status).toBe(404)
  })
})

describe('Cascade delete behaviour', () => {
  let env: Env
  let createdId: string
  beforeEach(async () => {
    env = await setup()
    const r = await post<{ data: { id: string } }>(
      env,
      '/',
      { customerId: env.customerIds[0], productId: env.productIds[0], price: 45000 },
      env.base.owner.authHeader,
    )
    createdId = r.body.data.id
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Hard delete customer → customer_prices CASCADE bị xoá', async () => {
    await env.base.db.delete(customers).where(eq(customers.id, env.customerIds[0]!))
    const remaining = await env.base.db
      .select()
      .from(customerPrices)
      .where(eq(customerPrices.id, createdId))
    expect(remaining.length).toBe(0)
  })

  it('Hard delete product → customer_prices CASCADE bị xoá', async () => {
    await env.base.db.delete(products).where(eq(products.id, env.productIds[0]!))
    const remaining = await env.base.db
      .select()
      .from(customerPrices)
      .where(eq(customerPrices.id, createdId))
    expect(remaining.length).toBe(0)
  })
})

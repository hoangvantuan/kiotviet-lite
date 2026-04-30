import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  auditLogs,
  categories,
  categoryDiscounts,
  customerGroups,
  customers,
  products,
  stores,
  users,
} from '@kiotviet-lite/shared'

import { signAccessToken } from '../lib/jwt.js'
import { hashPassword } from '../lib/password.js'
import { createCategoryDiscountsRoutes } from '../routes/category-discounts.routes.js'
import { findApplicableCategoryDiscount } from '../services/category-discounts.service.js'
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
  app: ReturnType<typeof createCategoryDiscountsRoutes>
  categoryIds: string[]
  customerIds: string[]
  customerGroupIds: string[]
  productIds: string[]
}

async function setup(): Promise<Env> {
  const base = await createTestEnv()
  const app = createCategoryDiscountsRoutes({ db: base.db })

  const cats = await base.db
    .insert(categories)
    .values([
      { storeId: base.storeId, name: 'Nước ngọt', sortOrder: 1 },
      { storeId: base.storeId, name: 'Bánh kẹo', sortOrder: 2 },
    ])
    .returning({ id: categories.id })

  const ctrs = await base.db
    .insert(customers)
    .values([
      { storeId: base.storeId, name: 'Khách A', phone: '0911111111' },
      { storeId: base.storeId, name: 'Khách B', phone: '0922222222' },
    ])
    .returning({ id: customers.id })

  const grps = await base.db
    .insert(customerGroups)
    .values([
      { storeId: base.storeId, name: 'VIP' },
      { storeId: base.storeId, name: 'Sỉ' },
    ])
    .returning({ id: customerGroups.id })

  const prds = await base.db
    .insert(products)
    .values([
      {
        storeId: base.storeId,
        name: 'Pepsi 330ml',
        sku: 'PEPSI-330',
        sellingPrice: 10000,
        costPrice: 6000,
        categoryId: cats[0]!.id,
      },
    ])
    .returning({ id: products.id })

  return {
    base,
    app,
    categoryIds: cats.map((c) => c.id),
    customerIds: ctrs.map((c) => c.id),
    customerGroupIds: grps.map((g) => g.id),
    productIds: prds.map((p) => p.id),
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

describe('POST /category-discounts', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Owner tạo rule customer hợp lệ → 201 + audit', async () => {
    const r = await post<{ data: { id: string; categoryId: string; customerId: string } }>(
      env,
      '/',
      {
        categoryId: env.categoryIds[0],
        customerId: env.customerIds[0],
        discountType: 'percent',
        discountValue: 10,
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(201)
    expect(r.body.data.categoryId).toBe(env.categoryIds[0])
    expect(r.body.data.customerId).toBe(env.customerIds[0])

    const audits = await env.base.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.targetId, r.body.data.id))
    expect(audits[0]?.action).toBe('category_discount.created')
  })

  it('Manager tạo rule group hợp lệ → 201', async () => {
    const r = await post<{ data: { id: string; customerGroupId: string } }>(
      env,
      '/',
      {
        categoryId: env.categoryIds[1],
        customerGroupId: env.customerGroupIds[0],
        discountType: 'amount',
        discountValue: 5000,
      },
      env.base.manager.authHeader,
    )
    expect(r.status).toBe(201)
    expect(r.body.data.customerGroupId).toBe(env.customerGroupIds[0])
  })

  it('Staff bị chặn → 403', async () => {
    const r = await post(
      env,
      '/',
      {
        categoryId: env.categoryIds[0],
        customerId: env.customerIds[0],
        discountType: 'percent',
        discountValue: 5,
      },
      env.base.staff.authHeader,
    )
    expect(r.status).toBe(403)
  })

  it('Cả customerId và customerGroupId → 400', async () => {
    const r = await post<{ error: { code: string } }>(
      env,
      '/',
      {
        categoryId: env.categoryIds[0],
        customerId: env.customerIds[0],
        customerGroupId: env.customerGroupIds[0],
        discountType: 'percent',
        discountValue: 5,
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('Cả 2 đều null → 400', async () => {
    const r = await post<{ error: { code: string } }>(
      env,
      '/',
      {
        categoryId: env.categoryIds[0],
        discountType: 'percent',
        discountValue: 5,
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
  })

  it('percent > 100 → 400', async () => {
    const r = await post<{ error: { code: string } }>(
      env,
      '/',
      {
        categoryId: env.categoryIds[0],
        customerId: env.customerIds[0],
        discountType: 'percent',
        discountValue: 150,
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
  })

  it('effectiveTo < effectiveFrom → 400', async () => {
    const r = await post<{ error: { code: string } }>(
      env,
      '/',
      {
        categoryId: env.categoryIds[0],
        customerId: env.customerIds[0],
        discountType: 'percent',
        discountValue: 10,
        effectiveFrom: '2026-05-01',
        effectiveTo: '2026-04-30',
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
  })

  it('categoryId không thuộc store → 404', async () => {
    const r = await post<{ error: { code: string } }>(
      env,
      '/',
      {
        categoryId: '00000000-0000-0000-0000-000000000001',
        customerId: env.customerIds[0],
        discountType: 'percent',
        discountValue: 10,
      },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(404)
  })
})

describe('GET /category-discounts', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
    // Seed 2 rules
    await post(
      env,
      '/',
      {
        categoryId: env.categoryIds[0],
        customerId: env.customerIds[0],
        discountType: 'percent',
        discountValue: 10,
      },
      env.base.owner.authHeader,
    )
    await post(
      env,
      '/',
      {
        categoryId: env.categoryIds[1],
        customerGroupId: env.customerGroupIds[0],
        discountType: 'amount',
        discountValue: 5000,
        isActive: false,
      },
      env.base.owner.authHeader,
    )
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('List default → 2 rows + meta', async () => {
    const r = await get<{
      data: Array<{ id: string; effectiveStatus: string; isActive: boolean }>
      meta: { total: number }
    }>(env, '/', env.base.owner.authHeader)
    expect(r.status).toBe(200)
    expect(r.body.data.length).toBe(2)
    expect(r.body.meta.total).toBe(2)
  })

  it('Filter isActive=true → 1 row', async () => {
    const r = await get<{ data: Array<{ isActive: boolean }>; meta: { total: number } }>(
      env,
      '/?isActive=true',
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.length).toBe(1)
    expect(r.body.data[0]?.isActive).toBe(true)
  })

  it('Filter customerGroupId → 1 row', async () => {
    const r = await get<{ data: Array<{ customerGroupId: string | null }> }>(
      env,
      `/?customerGroupId=${env.customerGroupIds[0]}`,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.length).toBe(1)
    expect(r.body.data[0]?.customerGroupId).toBe(env.customerGroupIds[0])
  })

  it('effectiveStatus computed → đủ 4 trạng thái', async () => {
    const r = await get<{
      data: Array<{ effectiveStatus: string }>
    }>(env, '/', env.base.owner.authHeader)
    expect(r.status).toBe(200)
    const statuses = r.body.data.map((d) => d.effectiveStatus)
    expect(statuses.some((s) => s === 'active' || s === 'inactive' || s === 'pending')).toBe(true)
  })
})

describe('PATCH /category-discounts/:id', () => {
  let env: Env
  let ruleId: string
  beforeEach(async () => {
    env = await setup()
    const r = await post<{ data: { id: string } }>(
      env,
      '/',
      {
        categoryId: env.categoryIds[0],
        customerId: env.customerIds[0],
        discountType: 'percent',
        discountValue: 10,
      },
      env.base.owner.authHeader,
    )
    ruleId = r.body.data.id
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Update isActive → 200', async () => {
    const r = await patch<{ data: { isActive: boolean } }>(
      env,
      `/${ruleId}`,
      { isActive: false },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.data.isActive).toBe(false)
  })

  it('Update categoryId (immutable) → 400 strict', async () => {
    const r = await patch<{ error: { code: string } }>(
      env,
      `/${ruleId}`,
      { categoryId: env.categoryIds[1] },
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
  })

  it('Body rỗng → 400', async () => {
    const r = await patch<{ error: { code: string } }>(
      env,
      `/${ruleId}`,
      {},
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(400)
  })

  it('Staff → 403', async () => {
    const r = await patch(env, `/${ruleId}`, { isActive: false }, env.base.staff.authHeader)
    expect(r.status).toBe(403)
  })
})

describe('DELETE /category-discounts/:id', () => {
  let env: Env
  let ruleId: string
  beforeEach(async () => {
    env = await setup()
    const r = await post<{ data: { id: string } }>(
      env,
      '/',
      {
        categoryId: env.categoryIds[0],
        customerId: env.customerIds[0],
        discountType: 'percent',
        discountValue: 10,
      },
      env.base.owner.authHeader,
    )
    ruleId = r.body.data.id
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Hard delete → 200 + audit + DB row gone', async () => {
    const r = await del<{ data: { id: string } }>(env, `/${ruleId}`, env.base.owner.authHeader)
    expect(r.status).toBe(200)

    const remaining = await env.base.db
      .select()
      .from(categoryDiscounts)
      .where(eq(categoryDiscounts.id, ruleId))
    expect(remaining.length).toBe(0)

    const audits = await env.base.db.select().from(auditLogs).where(eq(auditLogs.targetId, ruleId))
    expect(audits.some((a) => a.action === 'category_discount.deleted')).toBe(true)
  })

  it('Staff → 403', async () => {
    const r = await del(env, `/${ruleId}`, env.base.staff.authHeader)
    expect(r.status).toBe(403)
  })

  it('Rule không tồn tại → 404', async () => {
    const r = await del<{ error: { code: string } }>(
      env,
      '/00000000-0000-0000-0000-000000000099',
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(404)
  })
})

describe('DB CHECK constraints', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Raw INSERT cả customerId và customerGroupId → DB CHECK throw', async () => {
    let threw = false
    try {
      await env.base.db.insert(categoryDiscounts).values({
        storeId: env.base.storeId,
        categoryId: env.categoryIds[0]!,
        customerId: env.customerIds[0]!,
        customerGroupId: env.customerGroupIds[0]!,
        discountType: 'percent',
        discountValue: 5,
        minQty: 1,
      })
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
  })

  it('Raw INSERT minQty=0 → DB CHECK throw', async () => {
    let threw = false
    try {
      await env.base.db.insert(categoryDiscounts).values({
        storeId: env.base.storeId,
        categoryId: env.categoryIds[0]!,
        customerId: env.customerIds[0]!,
        customerGroupId: null,
        discountType: 'percent',
        discountValue: 5,
        minQty: 0,
      })
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
  })

  it('Raw INSERT effectiveTo < effectiveFrom → DB CHECK throw', async () => {
    let threw = false
    try {
      await env.base.db.insert(categoryDiscounts).values({
        storeId: env.base.storeId,
        categoryId: env.categoryIds[0]!,
        customerId: env.customerIds[0]!,
        customerGroupId: null,
        discountType: 'percent',
        discountValue: 5,
        minQty: 1,
        effectiveFrom: '2026-05-01',
        effectiveTo: '2026-04-01',
      })
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
  })
})

describe('Multi-tenant isolation', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Store A tạo rule, owner store B query → 0 results + 404 cho rule', async () => {
    const created = await post<{ data: { id: string } }>(
      env,
      '/',
      {
        categoryId: env.categoryIds[0],
        customerId: env.customerIds[0],
        discountType: 'percent',
        discountValue: 10,
      },
      env.base.owner.authHeader,
    )
    expect(created.status).toBe(201)
    const ruleId = created.body.data.id

    const [storeB] = await env.base.db.insert(stores).values({ name: 'Store B' }).returning()
    expect(storeB).toBeDefined()
    const passwordHash = await hashPassword('matkhau123')
    const pinHash = await hashPassword('999999')
    const [ownerB] = await env.base.db
      .insert(users)
      .values({
        storeId: storeB!.id,
        name: 'Owner B',
        phone: '0907777777',
        passwordHash,
        pinHash,
        role: 'owner',
      })
      .returning()
    const tokenB = signAccessToken({
      userId: ownerB!.id,
      storeId: storeB!.id,
      role: 'owner',
    })
    const ahB = { Authorization: `Bearer ${tokenB}` }

    const list = await get<{ data: unknown[]; meta: { total: number } }>(env, '/', ahB)
    expect(list.status).toBe(200)
    expect(list.body.meta.total).toBe(0)
    expect(list.body.data.length).toBe(0)

    const detail = await get<{ error: { code: string } }>(env, `/${ruleId}`, ahB)
    expect(detail.status).toBe(404)

    const upd = await patch<{ error: { code: string } }>(
      env,
      `/${ruleId}`,
      { isActive: false },
      ahB,
    )
    expect(upd.status).toBe(404)

    const delR = await del<{ error: { code: string } }>(env, `/${ruleId}`, ahB)
    expect(delR.status).toBe(404)
  })
})

describe('Cascade DELETE category', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Hard delete category → category_discounts cùng category bị CASCADE xoá', async () => {
    const c1 = await post<{ data: { id: string } }>(
      env,
      '/',
      {
        categoryId: env.categoryIds[0],
        customerId: env.customerIds[0],
        discountType: 'percent',
        discountValue: 10,
      },
      env.base.owner.authHeader,
    )
    const c2 = await post<{ data: { id: string } }>(
      env,
      '/',
      {
        categoryId: env.categoryIds[1],
        customerGroupId: env.customerGroupIds[0],
        discountType: 'amount',
        discountValue: 5000,
      },
      env.base.owner.authHeader,
    )
    expect(c1.status).toBe(201)
    expect(c2.status).toBe(201)

    // Setup product seed reference categoryIds[0]; xoá trước để FK RESTRICT của products
    // không chặn DELETE category, cô lập test cho hành vi CASCADE của category_discounts
    await env.base.db.delete(products).where(eq(products.categoryId, env.categoryIds[0]!))
    await env.base.db.delete(categories).where(eq(categories.id, env.categoryIds[0]!))

    const remaining = await env.base.db
      .select({ id: categoryDiscounts.id })
      .from(categoryDiscounts)
      .where(eq(categoryDiscounts.categoryId, env.categoryIds[0]!))
    expect(remaining.length).toBe(0)

    const stillThere = await env.base.db
      .select({ id: categoryDiscounts.id })
      .from(categoryDiscounts)
      .where(eq(categoryDiscounts.id, c2.body.data.id))
    expect(stillThere.length).toBe(1)
  })
})

describe('findApplicableCategoryDiscount helper', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  async function seedRule(values: {
    categoryId: string
    customerId?: string | null
    customerGroupId?: string | null
    discountType?: 'percent' | 'amount'
    discountValue: number
    minQty?: number
    effectiveFrom?: string | null
    effectiveTo?: string | null
    isActive?: boolean
  }) {
    const [row] = await env.base.db
      .insert(categoryDiscounts)
      .values({
        storeId: env.base.storeId,
        categoryId: values.categoryId,
        customerId: values.customerId ?? null,
        customerGroupId: values.customerGroupId ?? null,
        discountType: values.discountType ?? 'percent',
        discountValue: values.discountValue,
        minQty: values.minQty ?? 1,
        effectiveFrom: values.effectiveFrom ?? null,
        effectiveTo: values.effectiveTo ?? null,
        isActive: values.isActive ?? true,
      })
      .returning({ id: categoryDiscounts.id })
    return row!.id
  }

  it('Active match customer rule → trả discount đúng', async () => {
    await seedRule({
      categoryId: env.categoryIds[0]!,
      customerId: env.customerIds[0]!,
      discountType: 'percent',
      discountValue: 10,
    })
    const r = await findApplicableCategoryDiscount({
      db: env.base.db,
      storeId: env.base.storeId,
      productId: env.productIds[0]!,
      customerId: env.customerIds[0]!,
      quantity: 1,
    })
    expect(r).not.toBeNull()
    expect(r?.discountType).toBe('percent')
    expect(r?.discountValue).toBe(10)
    expect(r?.finalPrice).toBe(9000)
  })

  it('Rule inactive → null', async () => {
    await seedRule({
      categoryId: env.categoryIds[0]!,
      customerId: env.customerIds[0]!,
      discountValue: 10,
      isActive: false,
    })
    const r = await findApplicableCategoryDiscount({
      db: env.base.db,
      storeId: env.base.storeId,
      productId: env.productIds[0]!,
      customerId: env.customerIds[0]!,
      quantity: 1,
    })
    expect(r).toBeNull()
  })

  it('effective_from > today → null', async () => {
    await seedRule({
      categoryId: env.categoryIds[0]!,
      customerId: env.customerIds[0]!,
      discountValue: 10,
      effectiveFrom: '2999-12-31',
    })
    const r = await findApplicableCategoryDiscount({
      db: env.base.db,
      storeId: env.base.storeId,
      productId: env.productIds[0]!,
      customerId: env.customerIds[0]!,
      quantity: 1,
    })
    expect(r).toBeNull()
  })

  it('effective_to < today → null', async () => {
    await seedRule({
      categoryId: env.categoryIds[0]!,
      customerId: env.customerIds[0]!,
      discountValue: 10,
      effectiveTo: '2000-01-01',
    })
    const r = await findApplicableCategoryDiscount({
      db: env.base.db,
      storeId: env.base.storeId,
      productId: env.productIds[0]!,
      customerId: env.customerIds[0]!,
      quantity: 1,
    })
    expect(r).toBeNull()
  })

  it('min_qty > quantity → null', async () => {
    await seedRule({
      categoryId: env.categoryIds[0]!,
      customerId: env.customerIds[0]!,
      discountValue: 10,
      minQty: 5,
    })
    const r = await findApplicableCategoryDiscount({
      db: env.base.db,
      storeId: env.base.storeId,
      productId: env.productIds[0]!,
      customerId: env.customerIds[0]!,
      quantity: 3,
    })
    expect(r).toBeNull()
  })

  it('Customer rule + group rule cùng KH → ưu tiên customer rule', async () => {
    await seedRule({
      categoryId: env.categoryIds[0]!,
      customerGroupId: env.customerGroupIds[0]!,
      discountType: 'percent',
      discountValue: 50,
    })
    await seedRule({
      categoryId: env.categoryIds[0]!,
      customerId: env.customerIds[0]!,
      discountType: 'percent',
      discountValue: 5,
    })
    const r = await findApplicableCategoryDiscount({
      db: env.base.db,
      storeId: env.base.storeId,
      productId: env.productIds[0]!,
      customerId: env.customerIds[0]!,
      customerGroupId: env.customerGroupIds[0]!,
      quantity: 1,
    })
    expect(r).not.toBeNull()
    expect(r?.discountValue).toBe(5)
  })

  it('Multiple matching → ưu tiên discount_value lớn', async () => {
    await seedRule({
      categoryId: env.categoryIds[0]!,
      customerGroupId: env.customerGroupIds[0]!,
      discountType: 'percent',
      discountValue: 5,
    })
    await seedRule({
      categoryId: env.categoryIds[0]!,
      customerGroupId: env.customerGroupIds[0]!,
      discountType: 'percent',
      discountValue: 20,
    })
    const r = await findApplicableCategoryDiscount({
      db: env.base.db,
      storeId: env.base.storeId,
      productId: env.productIds[0]!,
      customerGroupId: env.customerGroupIds[0]!,
      quantity: 1,
    })
    expect(r).not.toBeNull()
    expect(r?.discountValue).toBe(20)
  })
})

describe('Filter orphan customer/group (soft-deleted)', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Customer bị soft delete → discount không hiển thị trong list', async () => {
    const created = await post<{ data: { id: string } }>(
      env,
      '/',
      {
        categoryId: env.categoryIds[0],
        customerId: env.customerIds[0],
        discountType: 'percent',
        discountValue: 10,
      },
      env.base.owner.authHeader,
    )
    expect(created.status).toBe(201)

    await env.base.db
      .update(customers)
      .set({ deletedAt: new Date() })
      .where(eq(customers.id, env.customerIds[0]!))

    const list = await get<{ data: Array<{ id: string }>; meta: { total: number } }>(
      env,
      '/',
      env.base.owner.authHeader,
    )
    expect(list.status).toBe(200)
    expect(list.body.meta.total).toBe(0)
    expect(list.body.data.find((d) => d.id === created.body.data.id)).toBeUndefined()
  })

  it('Group bị soft delete → discount không hiển thị trong list', async () => {
    const created = await post<{ data: { id: string } }>(
      env,
      '/',
      {
        categoryId: env.categoryIds[1],
        customerGroupId: env.customerGroupIds[0],
        discountType: 'amount',
        discountValue: 5000,
      },
      env.base.owner.authHeader,
    )
    expect(created.status).toBe(201)

    await env.base.db
      .update(customerGroups)
      .set({ deletedAt: new Date() })
      .where(eq(customerGroups.id, env.customerGroupIds[0]!))

    const list = await get<{ data: Array<{ id: string }>; meta: { total: number } }>(
      env,
      '/',
      env.base.owner.authHeader,
    )
    expect(list.status).toBe(200)
    expect(list.body.data.find((d) => d.id === created.body.data.id)).toBeUndefined()
  })
})

describe('Search escape % và _', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Search term `%` chỉ match note chứa ký tự `%` literal, không match wildcard', async () => {
    await post(
      env,
      '/',
      {
        categoryId: env.categoryIds[0],
        customerId: env.customerIds[0],
        discountType: 'percent',
        discountValue: 10,
        note: 'Khuyến mãi 10%',
      },
      env.base.owner.authHeader,
    )
    await post(
      env,
      '/',
      {
        categoryId: env.categoryIds[1],
        customerGroupId: env.customerGroupIds[0],
        discountType: 'amount',
        discountValue: 5000,
        note: 'Giảm chung không có dấu phần trăm',
      },
      env.base.owner.authHeader,
    )

    const r = await get<{ data: Array<{ note: string | null }>; meta: { total: number } }>(
      env,
      `/?search=${encodeURIComponent('%')}`,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.meta.total).toBe(1)
    expect(r.body.data[0]?.note).toBe('Khuyến mãi 10%')
  })

  it('Search term `_` chỉ match note chứa ký tự `_` literal, không match single-char wildcard', async () => {
    await post(
      env,
      '/',
      {
        categoryId: env.categoryIds[0],
        customerId: env.customerIds[0],
        discountType: 'percent',
        discountValue: 10,
        note: 'mã_giảm_giá',
      },
      env.base.owner.authHeader,
    )
    await post(
      env,
      '/',
      {
        categoryId: env.categoryIds[1],
        customerGroupId: env.customerGroupIds[0],
        discountType: 'amount',
        discountValue: 5000,
        note: 'note thường',
      },
      env.base.owner.authHeader,
    )

    const r = await get<{ data: Array<{ note: string | null }>; meta: { total: number } }>(
      env,
      `/?search=${encodeURIComponent('_')}`,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(200)
    expect(r.body.meta.total).toBe(1)
    expect(r.body.data[0]?.note).toBe('mã_giảm_giá')
  })
})

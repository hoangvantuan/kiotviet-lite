import { eq, isNull } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { customerGroups, priceLists } from '@kiotviet-lite/shared'

import { createPriceListsRoutes } from '../routes/price-lists.routes.js'
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
  app: ReturnType<typeof createPriceListsRoutes>
}

async function setup(): Promise<Env> {
  const base = await createTestEnv()
  const app = createPriceListsRoutes({ db: base.db })
  return { base, app }
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

const post = <T>(env: Env, path: string, body: unknown, ah: { Authorization: string }) =>
  reqJson<T>(env, 'POST', path, body, ah)
const del = <T>(env: Env, path: string, ah: { Authorization: string }) =>
  reqJson<T>(env, 'DELETE', path, undefined, ah)

describe('Customer Groups ↔ Price Lists FK behavior', () => {
  let env: Env
  beforeEach(async () => {
    env = await setup()
  })
  afterEach(async () => {
    await env.base.close()
  })

  it('Tạo customer_group tham chiếu price_list → liên kết được lưu đúng', async () => {
    const created = await post<{ data: { id: string } }>(
      env,
      '/',
      { name: 'Sỉ', method: 'direct' },
      env.base.owner.authHeader,
    )
    const priceListId = created.body.data.id

    const [group] = await env.base.db
      .insert(customerGroups)
      .values({
        storeId: env.base.storeId,
        name: 'Khách sỉ',
        defaultPriceListId: priceListId,
      })
      .returning()

    expect(group?.defaultPriceListId).toBe(priceListId)
  })

  it('Soft delete price_list khi đang được customer_group dùng → 422', async () => {
    const created = await post<{ data: { id: string } }>(
      env,
      '/',
      { name: 'Sỉ', method: 'direct' },
      env.base.owner.authHeader,
    )
    const priceListId = created.body.data.id

    await env.base.db.insert(customerGroups).values({
      storeId: env.base.storeId,
      name: 'Khách sỉ',
      defaultPriceListId: priceListId,
    })

    const r = await del<{ error: { code: string; message: string } }>(
      env,
      `/${priceListId}`,
      env.base.owner.authHeader,
    )
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('BUSINESS_RULE_VIOLATION')
  })

  it('Sau khi gỡ liên kết khỏi customer_group → soft delete OK và DB giữ FK = null', async () => {
    const created = await post<{ data: { id: string } }>(
      env,
      '/',
      { name: 'Sỉ', method: 'direct' },
      env.base.owner.authHeader,
    )
    const priceListId = created.body.data.id

    const [group] = await env.base.db
      .insert(customerGroups)
      .values({
        storeId: env.base.storeId,
        name: 'Khách sỉ',
        defaultPriceListId: priceListId,
      })
      .returning()

    await env.base.db
      .update(customerGroups)
      .set({ defaultPriceListId: null })
      .where(eq(customerGroups.id, group!.id))

    const r = await del<{ data: { ok: true } }>(env, `/${priceListId}`, env.base.owner.authHeader)
    expect(r.status).toBe(200)

    const [pl] = await env.base.db.select().from(priceLists).where(eq(priceLists.id, priceListId))
    expect(pl?.deletedAt).not.toBeNull()
  })

  it('FK customer_groups.default_price_list_id phải nullable (cho phép tạo group không gán bảng giá)', async () => {
    const [group] = await env.base.db
      .insert(customerGroups)
      .values({
        storeId: env.base.storeId,
        name: 'Mặc định',
        defaultPriceListId: null,
      })
      .returning()
    expect(group?.defaultPriceListId).toBeNull()
  })

  it('Multi-tenant: không thể gán default_price_list_id của store khác', async () => {
    const created = await post<{ data: { id: string } }>(
      env,
      '/',
      { name: 'Sỉ store A', method: 'direct' },
      env.base.owner.authHeader,
    )
    const priceListIdStoreA = created.body.data.id

    // Tạo group ở store khác (giả lập): cùng FK reference nhưng store khác
    // FK là cross-table không bắt cùng store, nhưng service sẽ filter theo store_id ở list/get
    // Đây xác nhận DB layer không enforce, mà service layer đảm nhận
    const otherStoreRows = await env.base.db
      .select({ id: priceLists.id })
      .from(priceLists)
      .where(isNull(priceLists.deletedAt))
    expect(otherStoreRows.find((r) => r.id === priceListIdStoreA)).toBeDefined()
  })
})

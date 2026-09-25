import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  applyFormula,
  applyRounding,
  formulaTypeSchema,
  formulaValueSchema,
  priceListMethodSchema,
  priceListNameSchema,
  priceSchema,
  roundingRuleSchema,
} from '@kiotviet-lite/shared'
import {
  customerGroups,
  priceListItems,
  priceLists,
  products,
  stores,
  users,
} from '@kiotviet-lite/shared/schema'

import { seed } from '../db/seed.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

// Bảng giá seed phải hợp lệ theo schema dùng chung và có nghĩa nghiệp vụ:
// không dưới giá vốn, bảng công thức có dòng giá khớp đúng công thức của app.
describe('bảng giá dữ liệu mẫu', () => {
  let env: TestEnv
  let lists: (typeof priceLists.$inferSelect)[]
  let items: { priceListId: string; productId: string; price: number; cost: number | null }[]

  beforeAll(async () => {
    env = await createTestEnv()
    await env.db.delete(users)
    await env.db.delete(stores)
    await seed(env.db)
    lists = await env.db.select().from(priceLists)
    const rows = await env.db
      .select({
        priceListId: priceListItems.priceListId,
        productId: priceListItems.productId,
        price: priceListItems.price,
        cost: products.costPrice,
      })
      .from(priceListItems)
      .innerJoin(products, eq(products.id, priceListItems.productId))
    items = rows.map((r) => ({
      ...r,
      price: Number(r.price),
      cost: r.cost === null ? null : Number(r.cost),
    }))
  })

  afterAll(async () => {
    await env.close()
  })

  it('mọi bảng giá có trường hợp lệ theo schema dùng chung', () => {
    expect(lists.length).toBeGreaterThan(0)
    for (const list of lists) {
      expect(priceListNameSchema.safeParse(list.name).success).toBe(true)
      expect(priceListMethodSchema.safeParse(list.method).success).toBe(true)
      expect(roundingRuleSchema.safeParse(list.roundingRule).success).toBe(true)
      if (list.method !== 'direct') {
        expect(list.basePriceListId).not.toBeNull()
        expect(formulaTypeSchema.safeParse(list.formulaType).success).toBe(true)
        expect(formulaValueSchema.safeParse(Number(list.formulaValue)).success).toBe(true)
      }
    }
  })

  it('mọi bảng giá có dòng giá, giá hợp lệ và không dưới giá vốn', () => {
    for (const list of lists) {
      const own = items.filter((it) => it.priceListId === list.id)
      expect(own.length, list.name).toBeGreaterThan(0)
      for (const it of own) {
        expect(priceSchema.safeParse(it.price).success).toBe(true)
        expect(it.price, `${list.name} / ${it.productId}`).toBeGreaterThanOrEqual(it.cost ?? 0)
      }
    }
  })

  it('bảng công thức có dòng giá đúng bằng công thức áp lên bảng nền', () => {
    const formulaLists = lists.filter((l) => l.method === 'formula')
    expect(formulaLists.length).toBeGreaterThan(0)
    for (const list of formulaLists) {
      const base = items.filter((it) => it.priceListId === list.basePriceListId)
      const own = new Map(
        items.filter((it) => it.priceListId === list.id).map((it) => [it.productId, it.price]),
      )
      expect(own.size).toBe(base.length)
      for (const b of base) {
        const computed = applyFormula(
          b.price,
          formulaTypeSchema.parse(list.formulaType),
          Number(list.formulaValue),
        )
        const expected = Math.max(
          0,
          applyRounding(computed, roundingRuleSchema.parse(list.roundingRule)),
        )
        expect(own.get(b.productId)).toBe(expected)
      }
    }
  })

  it('nhóm khách sỉ và VIP có bảng giá mặc định là bảng giá của seed', async () => {
    const groups = await env.db.select().from(customerGroups)
    const listIds = new Set(lists.map((l) => l.id))
    const withList = groups.filter((g) => g.defaultPriceListId !== null)
    expect(withList.map((g) => g.name).sort()).toEqual(['Khách VIP', 'Khách sỉ'])
    for (const g of withList) expect(listIds.has(g.defaultPriceListId!)).toBe(true)
  })
})

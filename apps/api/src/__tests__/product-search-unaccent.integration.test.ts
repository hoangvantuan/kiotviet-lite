import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  listProductsQuerySchema,
  normalizeSearchText,
  products,
  searchTextSql,
} from '@kiotviet-lite/shared'

import { listProducts, searchProductsForPos } from '../services/products.service.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

describe('GL-16: tìm sản phẩm không phân biệt dấu tiếng Việt', () => {
  let env: TestEnv
  beforeAll(async () => {
    env = await createTestEnv()
    await env.db.insert(products).values([
      { storeId: env.storeId, sku: 'NOI-20', name: 'Nồi nhôm 20cm', sellingPrice: 1 },
      { storeId: env.storeId, sku: 'CHAU-01', name: 'Chậu nhựa Duy Tân', sellingPrice: 1 },
      { storeId: env.storeId, sku: 'DIA-SU', name: 'ĐĨA SỨ Minh Long', sellingPrice: 1 },
      // Tên dạng tổ hợp (NFD) như khi dán từ một số trình soạn thảo.
      {
        storeId: env.storeId,
        sku: 'MUOI-NFD',
        name: 'Muôi inox'.normalize('NFD'),
        sellingPrice: 1,
      },
    ])
  }, 30000)
  afterAll(async () => {
    await env?.close()
  })

  const pos = async (search: string) =>
    (await searchProductsForPos({ db: env.db, storeId: env.storeId, search, includeCost: false }))
      .map((item) => item.sku)
      .sort()
  const list = async (search: string) =>
    (
      await listProducts({
        db: env.db,
        storeId: env.storeId,
        query: listProductsQuerySchema.parse({ search }),
      })
    ).items
      .map((item) => item.sku)
      .sort()

  it('POS và danh sách tìm được bằng chữ không dấu, có dấu, hoa thường, đ/d', async () => {
    for (const search of [list, pos]) {
      expect(await search('noi')).toEqual(['NOI-20'])
      expect(await search('nhom')).toEqual(['NOI-20'])
      expect(await search('NỒI NHÔM')).toEqual(['NOI-20'])
      expect(await search('chau')).toEqual(['CHAU-01'])
      expect(await search('dia su')).toEqual(['DIA-SU'])
      expect(await search('đĩa')).toEqual(['DIA-SU'])
      expect(await search('muoi')).toEqual(['MUOI-NFD'])
      expect(await search('chau-01')).toEqual(['CHAU-01'])
      expect(await search('100%')).toEqual([])
    }
  })

  it('biểu thức SQL và hàm JS cho cùng kết quả', async () => {
    const samples = ['Nồi NHÔM', 'Đĩa', 'Muôi'.normalize('NFD'), 'Ưu đãi Ỹ', 'café', 'ABC-123']
    for (const value of samples) {
      const result = await env.db.execute<{ folded: string }>(
        sql`select ${sql.raw(searchTextSql('$$' + value + '$$'))} as folded`,
      )
      const rows = (result as unknown as { rows?: { folded: string }[] }).rows ?? result
      expect((rows as { folded: string }[])[0]!.folded).toBe(normalizeSearchText(value))
    }
    expect(normalizeSearchText('Nồi NHÔM Đĩa')).toBe('noi nhom dia')
  })
})

import { PGlite } from '@electric-sql/pglite'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { offlineProductSearchCondition } from './use-offline-search'

vi.mock('@/lib/pglite', () => ({ getPGliteDB: () => undefined }))

describe('GL-16: tìm ngoại tuyến trên PGlite không phân biệt dấu', () => {
  let pglite: PGlite
  beforeAll(async () => {
    pglite = new PGlite()
    // Bảng tối thiểu: điều kiện chỉ dùng name và sku, không cần cột sinh search_text.
    await pglite.exec(`
      create table products (id serial primary key, name text not null, sku text not null);
      insert into products (name, sku) values
        ('Nồi nhôm 20cm', 'NOI-20'), ('Chậu nhựa', 'CHAU-01'), ('ĐĨA SỨ', 'DIA-SU');
    `)
  })
  afterAll(async () => {
    await pglite.close()
  })

  async function search(term: string) {
    const db = drizzle(pglite)
    const result = await db.execute<{ sku: string }>(
      sql`select sku from products where ${offlineProductSearchCondition(term)} order by sku`,
    )
    return result.rows.map((row) => row.sku)
  }

  it('khớp cùng quy tắc với API', async () => {
    expect(await search('noi nhom')).toEqual(['NOI-20'])
    expect(await search('CHẬU')).toEqual(['CHAU-01'])
    expect(await search('dia')).toEqual(['DIA-SU'])
    expect(await search('đĩa sứ')).toEqual(['DIA-SU'])
    expect(await search('%')).toEqual([])
  })
})

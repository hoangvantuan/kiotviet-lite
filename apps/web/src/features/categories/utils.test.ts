import { describe, expect, it } from 'vitest'

import type { CategoryItem } from '@kiotviet-lite/shared'

import { buildCategoryTree } from './utils'

function makeItem(partial: Partial<CategoryItem> & { id: string; name: string }): CategoryItem {
  return {
    id: partial.id,
    storeId: partial.storeId ?? 'store-1',
    name: partial.name,
    parentId: partial.parentId ?? null,
    sortOrder: partial.sortOrder ?? 0,
    createdAt: partial.createdAt ?? '2026-04-25T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-04-25T00:00:00.000Z',
  }
}

describe('buildCategoryTree', () => {
  it('empty list trả về []', () => {
    expect(buildCategoryTree([])).toEqual([])
  })

  it('chỉ có roots, không có con', () => {
    const items = [
      makeItem({ id: 'a', name: 'Đồ uống', sortOrder: 1 }),
      makeItem({ id: 'b', name: 'Bánh kẹo', sortOrder: 0 }),
    ]
    const tree = buildCategoryTree(items)
    expect(tree).toHaveLength(2)
    expect(tree[0]?.id).toBe('b')
    expect(tree[1]?.id).toBe('a')
    expect(tree[0]?.children).toEqual([])
  })

  it('mixed levels: gom con theo parent đúng', () => {
    const items = [
      makeItem({ id: 'r1', name: 'Đồ uống', sortOrder: 0 }),
      makeItem({ id: 'r2', name: 'Đồ ăn', sortOrder: 1 }),
      makeItem({ id: 'c1', name: 'Cà phê', parentId: 'r1', sortOrder: 0 }),
      makeItem({ id: 'c2', name: 'Trà', parentId: 'r1', sortOrder: 1 }),
      makeItem({ id: 'c3', name: 'Bánh ngọt', parentId: 'r2', sortOrder: 0 }),
    ]
    const tree = buildCategoryTree(items)
    expect(tree).toHaveLength(2)
    const r1 = tree.find((n) => n.id === 'r1')
    expect(r1?.children.map((c) => c.id)).toEqual(['c1', 'c2'])
    const r2 = tree.find((n) => n.id === 'r2')
    expect(r2?.children.map((c) => c.id)).toEqual(['c3'])
  })

  it('sort theo sortOrder trước, name sau', () => {
    const items = [
      makeItem({ id: 'a', name: 'Zebra', sortOrder: 0 }),
      makeItem({ id: 'b', name: 'Alpha', sortOrder: 0 }),
      makeItem({ id: 'c', name: 'Beta', sortOrder: 1 }),
    ]
    const tree = buildCategoryTree(items)
    // cùng sortOrder=0 → so name vi: Alpha < Zebra
    expect(tree.map((n) => n.id)).toEqual(['b', 'a', 'c'])
  })

  it('children cũng được sort theo sortOrder rồi name', () => {
    const items = [
      makeItem({ id: 'r', name: 'Root', sortOrder: 0 }),
      makeItem({ id: 'c1', name: 'Z', parentId: 'r', sortOrder: 1 }),
      makeItem({ id: 'c2', name: 'A', parentId: 'r', sortOrder: 0 }),
      makeItem({ id: 'c3', name: 'M', parentId: 'r', sortOrder: 0 }),
    ]
    const tree = buildCategoryTree(items)
    const root = tree[0]
    expect(root?.children.map((c) => c.id)).toEqual(['c2', 'c3', 'c1'])
  })

  it('parent không tồn tại trong list → con sẽ không xuất hiện trong tree', () => {
    const items = [makeItem({ id: 'orphan', name: 'mồ côi', parentId: 'missing-parent' })]
    const tree = buildCategoryTree(items)
    expect(tree).toEqual([])
  })
})

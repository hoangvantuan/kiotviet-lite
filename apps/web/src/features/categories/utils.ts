import type { CategoryItem } from '@kiotviet-lite/shared'

export interface CategoryTreeNode extends CategoryItem {
  children: CategoryItem[]
}

function compareCategory(a: CategoryItem, b: CategoryItem): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
  return a.name.localeCompare(b.name, 'vi')
}

export function buildCategoryTree(items: CategoryItem[]): CategoryTreeNode[] {
  const roots = items
    .filter((c) => c.parentId === null)
    .slice()
    .sort(compareCategory)

  const childrenByParent = new Map<string, CategoryItem[]>()
  for (const c of items) {
    if (c.parentId !== null) {
      const list = childrenByParent.get(c.parentId) ?? []
      list.push(c)
      childrenByParent.set(c.parentId, list)
    }
  }
  for (const list of childrenByParent.values()) {
    list.sort(compareCategory)
  }

  return roots.map((r) => ({ ...r, children: childrenByParent.get(r.id) ?? [] }))
}

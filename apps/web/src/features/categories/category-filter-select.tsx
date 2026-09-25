import type { CategoryItem } from '@kiotviet-lite/shared'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { buildCategoryTree } from './utils'

export const CATEGORY_FILTER_ALL = 'all'
export const CATEGORY_FILTER_NONE = 'none'

/**
 * Bộ lọc nhóm hàng dạng cây 2 cấp: 'all' | 'none' (chưa phân loại) | uuid nhóm.
 * Dùng chung cho danh sách sản phẩm và báo cáo tồn kho.
 */
export function CategoryFilterSelect({
  value,
  onValueChange,
  categories,
  className = 'md:w-56',
}: {
  value: string
  onValueChange: (v: string) => void
  categories: CategoryItem[]
  className?: string
}) {
  const tree = buildCategoryTree(categories)
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className} aria-label="Lọc theo danh mục">
        <SelectValue placeholder="Tất cả danh mục" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={CATEGORY_FILTER_ALL}>Tất cả danh mục</SelectItem>
        <SelectItem value={CATEGORY_FILTER_NONE}>Chưa phân loại</SelectItem>
        {tree.map((parent) => (
          <div key={parent.id}>
            <SelectItem value={parent.id}>{parent.name}</SelectItem>
            {parent.children.map((child) => (
              <SelectItem key={child.id} value={child.id}>
                {`    ${child.name}`}
              </SelectItem>
            ))}
          </div>
        ))}
      </SelectContent>
    </Select>
  )
}

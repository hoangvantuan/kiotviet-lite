import type { EffectiveStatus } from '@kiotviet-lite/shared'

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCategoriesQuery } from '@/features/categories/use-categories'
import { useCustomerGroupsQuery } from '@/features/customers/use-customers'

export interface CategoryDiscountsFiltersValue {
  search: string
  categoryId: string
  customerGroupId: string
  effectiveStatus: EffectiveStatus | 'all'
}

interface Props {
  value: CategoryDiscountsFiltersValue
  onChange: (partial: Partial<CategoryDiscountsFiltersValue>) => void
}

export function CategoryDiscountsFilters({ value, onChange }: Props) {
  const categoriesQuery = useCategoriesQuery({ enabled: true })
  const groupsQuery = useCustomerGroupsQuery({ enabled: true })
  const categories = categoriesQuery.data ?? []
  const groups = groupsQuery.data ?? []

  return (
    <div className="grid gap-2 md:grid-cols-4">
      <Input
        placeholder="Tìm theo ghi chú, danh mục, KH…"
        value={value.search}
        onChange={(e) => onChange({ search: e.target.value })}
      />
      <Select
        value={value.categoryId || 'all'}
        onValueChange={(v) => onChange({ categoryId: v === 'all' ? '' : v })}
      >
        <SelectTrigger>
          <SelectValue placeholder="Tất cả danh mục" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả danh mục</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={value.customerGroupId || 'all'}
        onValueChange={(v) => onChange({ customerGroupId: v === 'all' ? '' : v })}
      >
        <SelectTrigger>
          <SelectValue placeholder="Tất cả nhóm KH" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả nhóm KH</SelectItem>
          {groups.map((g) => (
            <SelectItem key={g.id} value={g.id}>
              {g.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={value.effectiveStatus}
        onValueChange={(v) => onChange({ effectiveStatus: v as EffectiveStatus | 'all' })}
      >
        <SelectTrigger>
          <SelectValue placeholder="Trạng thái" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả trạng thái</SelectItem>
          <SelectItem value="active">Đang hiệu lực</SelectItem>
          <SelectItem value="pending">Sắp hiệu lực</SelectItem>
          <SelectItem value="expired">Đã hết hạn</SelectItem>
          <SelectItem value="inactive">Đã tắt</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

import type { PriceListMethod, PriceListStatusFilter } from '@kiotviet-lite/shared'

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface PriceListFiltersValue {
  search: string
  method: PriceListMethod | 'all'
  status: PriceListStatusFilter
}

interface Props {
  value: PriceListFiltersValue
  onChange: (partial: Partial<PriceListFiltersValue>) => void
}

export function PriceListFilters({ value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center">
      <Input
        placeholder="Tìm theo tên bảng giá"
        value={value.search}
        onChange={(e) => onChange({ search: e.target.value })}
        className="md:max-w-xs"
      />
      <Select
        value={value.method}
        onValueChange={(v) => onChange({ method: v as PriceListMethod | 'all' })}
      >
        <SelectTrigger className="md:w-44">
          <SelectValue placeholder="Phương thức" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả phương thức</SelectItem>
          <SelectItem value="direct">Trực tiếp</SelectItem>
          <SelectItem value="formula">Công thức</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={value.status}
        onValueChange={(v) => onChange({ status: v as PriceListStatusFilter })}
      >
        <SelectTrigger className="md:w-44">
          <SelectValue placeholder="Trạng thái" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả trạng thái</SelectItem>
          <SelectItem value="effective">Đang áp dụng</SelectItem>
          <SelectItem value="pending">Chưa hiệu lực</SelectItem>
          <SelectItem value="expired">Hết hiệu lực</SelectItem>
          <SelectItem value="inactive">Đã tắt</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

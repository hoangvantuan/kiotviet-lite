import { useState } from 'react'
import { Filter, Search } from 'lucide-react'

import type { CategoryItem } from '@kiotviet-lite/shared'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useMediaQuery } from '@/hooks/use-media-query'

import { buildCategoryTree } from '../categories/utils'

export type StatusFilter = 'all' | 'active' | 'inactive'
export type StockFilterValue = 'all' | 'in_stock' | 'out_of_stock' | 'below_min'

export interface ProductFiltersValue {
  search: string
  categoryId: string // 'all' | 'none' | uuid
  status: StatusFilter
  stockFilter: StockFilterValue
}

export interface ProductFiltersProps {
  value: ProductFiltersValue
  onChange: (partial: Partial<ProductFiltersValue>) => void
  categories: CategoryItem[]
}

const ALL = 'all'
const NONE = 'none'

function CategorySelect({
  value,
  onValueChange,
  categories,
}: {
  value: string
  onValueChange: (v: string) => void
  categories: CategoryItem[]
}) {
  const tree = buildCategoryTree(categories)
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="md:w-56">
        <SelectValue placeholder="Tất cả danh mục" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Tất cả danh mục</SelectItem>
        <SelectItem value={NONE}>Chưa phân loại</SelectItem>
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

function StatusSelect({
  value,
  onValueChange,
}: {
  value: StatusFilter
  onValueChange: (v: StatusFilter) => void
}) {
  return (
    <Select value={value} onValueChange={(v) => onValueChange(v as StatusFilter)}>
      <SelectTrigger className="md:w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Tất cả trạng thái</SelectItem>
        <SelectItem value="active">Đang bán</SelectItem>
        <SelectItem value="inactive">Ngừng bán</SelectItem>
      </SelectContent>
    </Select>
  )
}

function StockSelect({
  value,
  onValueChange,
}: {
  value: StockFilterValue
  onValueChange: (v: StockFilterValue) => void
}) {
  return (
    <Select value={value} onValueChange={(v) => onValueChange(v as StockFilterValue)}>
      <SelectTrigger className="md:w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Tất cả tồn kho</SelectItem>
        <SelectItem value="in_stock">Còn hàng</SelectItem>
        <SelectItem value="out_of_stock">Hết hàng</SelectItem>
        <SelectItem value="below_min">Dưới định mức</SelectItem>
      </SelectContent>
    </Select>
  )
}

export function ProductFilters({ value, onChange, categories }: ProductFiltersProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [sheetOpen, setSheetOpen] = useState(false)

  const searchInput = (
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Tìm theo tên, SKU hoặc barcode"
        value={value.search}
        onChange={(e) => onChange({ search: e.target.value })}
        className="pl-9"
      />
    </div>
  )

  const filters = (
    <>
      <CategorySelect
        value={value.categoryId}
        onValueChange={(v) => onChange({ categoryId: v })}
        categories={categories}
      />
      <StatusSelect value={value.status} onValueChange={(v) => onChange({ status: v })} />
      <StockSelect value={value.stockFilter} onValueChange={(v) => onChange({ stockFilter: v })} />
    </>
  )

  if (isDesktop) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {searchInput}
        {filters}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {searchInput}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4" />
            <span>Lọc</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Bộ lọc sản phẩm</SheetTitle>
            <SheetDescription>Áp dụng nhiều bộ lọc để thu hẹp kết quả.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-3">{filters}</div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

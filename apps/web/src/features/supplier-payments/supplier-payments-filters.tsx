import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSuppliersQuery } from '@/features/suppliers/use-suppliers'

interface SupplierPaymentsFiltersProps {
  searchInput: string
  onSearchInputChange: (v: string) => void
  supplierId: string | undefined
  onSupplierIdChange: (v: string | undefined) => void
  fromDate: string
  onFromDateChange: (v: string) => void
  toDate: string
  onToDateChange: (v: string) => void
}

export function SupplierPaymentsFilters({
  searchInput,
  onSearchInputChange,
  supplierId,
  onSupplierIdChange,
  fromDate,
  onFromDateChange,
  toDate,
  onToDateChange,
}: SupplierPaymentsFiltersProps) {
  const suppliersQuery = useSuppliersQuery({ pageSize: 200, hasDebt: 'all' })
  const suppliers = suppliersQuery.data?.data ?? []

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <Input
        placeholder="Tìm theo tên NCC hoặc ghi chú"
        value={searchInput}
        onChange={(e) => onSearchInputChange(e.target.value)}
      />
      <Select
        value={supplierId ?? 'all'}
        onValueChange={(v) => onSupplierIdChange(v === 'all' ? undefined : v)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Tất cả NCC" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả NCC</SelectItem>
          {suppliers.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type="date"
        value={fromDate}
        onChange={(e) => onFromDateChange(e.target.value)}
        aria-label="Từ ngày"
      />
      <Input
        type="date"
        value={toDate}
        onChange={(e) => onToDateChange(e.target.value)}
        aria-label="Đến ngày"
      />
    </div>
  )
}

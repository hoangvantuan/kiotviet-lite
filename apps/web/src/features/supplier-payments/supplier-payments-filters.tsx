import { SupplierCombobox } from '@/components/shared/supplier-combobox'
import { Input } from '@/components/ui/input'

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
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <Input
        placeholder="Tìm theo tên nhà cung cấp hoặc ghi chú"
        value={searchInput}
        onChange={(e) => onSearchInputChange(e.target.value)}
      />
      <SupplierCombobox
        value={supplierId}
        onChange={onSupplierIdChange}
        hasDebt="all"
        placeholder="Tất cả nhà cung cấp"
      />
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

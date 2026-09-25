import { CustomerCombobox } from '@/components/shared/customer-combobox'
import { Input } from '@/components/ui/input'

interface ReceiptsFiltersProps {
  searchInput: string
  onSearchInputChange: (v: string) => void
  customerId: string | undefined
  onCustomerIdChange: (v: string | undefined) => void
  fromDate: string
  onFromDateChange: (v: string) => void
  toDate: string
  onToDateChange: (v: string) => void
}

export function ReceiptsFilters({
  searchInput,
  onSearchInputChange,
  customerId,
  onCustomerIdChange,
  fromDate,
  onFromDateChange,
  toDate,
  onToDateChange,
}: ReceiptsFiltersProps) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <Input
        placeholder="Tìm theo tên KH, phone hoặc ghi chú"
        value={searchInput}
        onChange={(e) => onSearchInputChange(e.target.value)}
      />
      <CustomerCombobox
        value={customerId}
        onChange={onCustomerIdChange}
        hasDebt="all"
        placeholder="Tất cả KH"
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

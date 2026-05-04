import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCustomersQuery } from '@/features/customers/use-customers'

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
  const customersQuery = useCustomersQuery({ pageSize: 200, hasDebt: 'all' })
  const customers = customersQuery.data?.data ?? []

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <Input
        placeholder="Tìm theo tên KH, phone hoặc ghi chú"
        value={searchInput}
        onChange={(e) => onSearchInputChange(e.target.value)}
      />
      <Select
        value={customerId ?? 'all'}
        onValueChange={(v) => onCustomerIdChange(v === 'all' ? undefined : v)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Tất cả KH" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả KH</SelectItem>
          {customers.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
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

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCustomersQuery } from '@/features/customers/use-customers'
import { useProductsQuery } from '@/features/products/use-products'

export interface CustomerPricesFiltersValue {
  search: string
  customerId: string
  productId: string
}

interface Props {
  value: CustomerPricesFiltersValue
  onChange: (partial: Partial<CustomerPricesFiltersValue>) => void
}

export function CustomerPricesFilters({ value, onChange }: Props) {
  const customersQuery = useCustomersQuery({ pageSize: 100, page: 1 })
  const productsQuery = useProductsQuery({ status: 'active', pageSize: 100, page: 1 })
  const customers = customersQuery.data?.data ?? []
  const products = productsQuery.data?.data ?? []

  return (
    <div className="grid gap-2 md:grid-cols-3">
      <Input
        placeholder="Tìm theo tên KH, tên SP, SKU…"
        value={value.search}
        onChange={(e) => onChange({ search: e.target.value })}
      />
      <Select
        value={value.customerId || 'all'}
        onValueChange={(v) => onChange({ customerId: v === 'all' ? '' : v })}
      >
        <SelectTrigger>
          <SelectValue placeholder="Tất cả khách hàng" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả khách hàng</SelectItem>
          {customers.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={value.productId || 'all'}
        onValueChange={(v) => onChange({ productId: v === 'all' ? '' : v })}
      >
        <SelectTrigger>
          <SelectValue placeholder="Tất cả sản phẩm" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả sản phẩm</SelectItem>
          {products.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

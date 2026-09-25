import { CustomerCombobox } from '@/components/shared/customer-combobox'
import { ProductCombobox } from '@/components/shared/product-combobox'
import { Input } from '@/components/ui/input'

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
  return (
    <div className="grid gap-2 md:grid-cols-3">
      <Input
        placeholder="Tìm theo tên KH, tên SP, SKU…"
        value={value.search}
        onChange={(e) => onChange({ search: e.target.value })}
      />
      <CustomerCombobox
        value={value.customerId || undefined}
        onChange={(v) => onChange({ customerId: v || '' })}
        placeholder="Tất cả khách hàng"
      />
      <ProductCombobox
        value={value.productId || undefined}
        onChange={(v) => onChange({ productId: v || '' })}
        placeholder="Tất cả sản phẩm"
      />
    </div>
  )
}

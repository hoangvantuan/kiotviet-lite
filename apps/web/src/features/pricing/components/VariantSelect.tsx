import type { VariantItem } from '@kiotviet-lite/shared'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { buildVariantName } from '@/features/products/variants-utils'

// POS-08: dùng chung cho mọi hộp thoại giá cần chọn biến thể sản phẩm
export const ALL_VARIANTS_VALUE = '__all_variants__'

interface VariantSelectProps {
  id?: string
  variants: VariantItem[]
  value: string | null
  onChange: (variantId: string | null) => void
  disabled?: boolean
  /** ID biến thể đã có dòng giá, hiển thị mờ không cho chọn lại */
  disabledVariantIds?: ReadonlySet<string>
  /** Dòng "Tất cả biến thể" đã có sẵn, không cho chọn lại */
  disableAllVariantsOption?: boolean
}

/**
 * Ô chọn biến thể cho sản phẩm có biến thể. Không hiển thị gì nếu sản phẩm
 * chưa cấu hình biến thể (variants rỗng) để không làm rối giao diện.
 */
export function VariantSelect({
  id,
  variants,
  value,
  onChange,
  disabled,
  disabledVariantIds,
  disableAllVariantsOption,
}: VariantSelectProps) {
  if (variants.length === 0) return null

  return (
    <Select
      value={value ?? ALL_VARIANTS_VALUE}
      onValueChange={(v) => onChange(v === ALL_VARIANTS_VALUE ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder="Chọn biến thể" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_VARIANTS_VALUE} disabled={disableAllVariantsOption}>
          Tất cả biến thể (theo sản phẩm)
        </SelectItem>
        {variants.map((v) => (
          <SelectItem key={v.id} value={v.id} disabled={disabledVariantIds?.has(v.id)}>
            {buildVariantName(v.attribute1Value, v.attribute2Value)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Dòng phụ nhỏ hiển thị tên biến thể cạnh tên sản phẩm trong bảng/thẻ */
export function VariantNameHint({ variantName }: { variantName: string | null | undefined }) {
  if (!variantName) return null
  return <p className="text-xs text-muted-foreground">Biến thể: {variantName}</p>
}

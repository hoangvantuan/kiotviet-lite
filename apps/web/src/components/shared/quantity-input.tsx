import * as React from 'react'

import { parseQuantityInput, quantityToInput } from '@kiotviet-lite/shared'

import { Input } from '@/components/ui/input'

export interface QuantityInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'min' | 'max' | 'step'
> {
  value: number | null | undefined
  /** Mặt hàng bán số lẻ (ADR-0015): nhận "1,5" hoặc "1.5", tối đa 3 chữ số lẻ */
  allowDecimal?: boolean
  allowNegative?: boolean
  /** Gọi mỗi lần gõ: số đã phân tích, null khi ô trống hoặc chưa hợp lệ */
  onChange?: (value: number | null) => void
  /** Gọi khi rời ô hoặc nhấn Enter với số hợp lệ khác giá trị hiện tại */
  onCommit?: (value: number) => void
  /**
   * Gọi onCommit ngay mỗi lần gõ ra số hợp lệ (form chứng từ: nút xác nhận bật ngay). Giỏ POS để
   * mặc định (chỉ khi rời ô) vì gõ "0,5" đi qua 0 sẽ xóa dòng.
   */
  live?: boolean
}

/**
 * Ô số lượng: ô chữ với bàn phím số, dấu phẩy thập phân kiểu Việt Nam. Rời ô với chuỗi không hợp
 * lệ thì trả về giá trị đang có.
 */
export const QuantityInput = React.forwardRef<HTMLInputElement, QuantityInputProps>(
  (
    {
      value,
      allowDecimal = false,
      allowNegative = false,
      onChange,
      onCommit,
      live = false,
      onBlur,
      onFocus,
      onKeyDown,
      ...rest
    },
    ref,
  ) => {
    const [text, setText] = React.useState<string>(() => quantityToInput(value ?? null))
    const [focused, setFocused] = React.useState(false)
    const options = { allowDecimal, allowNegative }

    React.useEffect(() => {
      if (!focused) setText(quantityToInput(value ?? null))
    }, [value, focused])

    return (
      <Input
        {...rest}
        ref={ref}
        type="text"
        inputMode={allowDecimal ? 'decimal' : 'numeric'}
        autoComplete="off"
        value={text}
        onFocus={(e) => {
          setFocused(true)
          onFocus?.(e)
        }}
        onChange={(e) => {
          setText(e.target.value)
          const parsed = parseQuantityInput(e.target.value, options)
          onChange?.(parsed)
          if (live && parsed !== null && parsed !== value) onCommit?.(parsed)
        }}
        onBlur={(e) => {
          setFocused(false)
          const parsed = parseQuantityInput(text, options)
          if (parsed === null) {
            setText(quantityToInput(value ?? null))
          } else {
            setText(quantityToInput(parsed))
            if (parsed !== value) onCommit?.(parsed)
          }
          onBlur?.(e)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          onKeyDown?.(e)
        }}
      />
    )
  },
)
QuantityInput.displayName = 'QuantityInput'

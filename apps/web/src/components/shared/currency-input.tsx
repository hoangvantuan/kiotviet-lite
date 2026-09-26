import * as React from 'react'

import { Input } from '@/components/ui/input'
import { formatVnd, parseVnd } from '@/lib/currency'
import { cn } from '@/lib/utils'

export interface CurrencyInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
> {
  value: number | null | undefined
  onChange: (value: number | null) => void
  suffix?: string
}

/** Số chữ số nằm sau vị trí `caret` của chuỗi */
function digitsAfter(text: string, caret: number): number {
  return text.slice(caret).replace(/\D/g, '').length
}

/** Vị trí con trỏ trong `text` sao cho phía sau còn đúng `digits` chữ số */
function caretForDigitsAfter(text: string, digits: number): number {
  let seen = 0
  for (let i = text.length; i > 0; i--) {
    if (seen === digits) return i
    if (/\d/.test(text[i - 1]!)) seen++
  }
  return 0
}

export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onChange, suffix = 'đ', className, onBlur, onFocus, ...rest }, ref) => {
    const [text, setText] = React.useState<string>(() => formatVnd(value ?? null))
    const [focused, setFocused] = React.useState(false)
    const inputRef = React.useRef<HTMLInputElement | null>(null)
    const pendingCaret = React.useRef<number | null>(null)

    const setRefs = React.useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      },
      [ref],
    )

    // Giữ con trỏ đúng chỗ sau khi chèn dấu phân cách nghìn
    React.useLayoutEffect(() => {
      const caret = pendingCaret.current
      if (caret === null || !inputRef.current) return
      pendingCaret.current = null
      inputRef.current.setSelectionRange(caret, caret)
    }, [text])

    React.useEffect(() => {
      if (!focused) {
        setText(formatVnd(value ?? null))
      }
    }, [value, focused])

    return (
      <div className="relative">
        <Input
          {...rest}
          ref={setRefs}
          inputMode="numeric"
          className={cn('pr-10', className)}
          value={text}
          onFocus={(e) => {
            setFocused(true)
            onFocus?.(e)
          }}
          onChange={(e) => {
            // POS-20: định dạng phân cách nghìn ngay khi gõ, không đợi rời ô
            const raw = e.target.value
            const parsed = parseVnd(raw)
            const next = parsed === null ? raw.replace(/[^\d]/g, '') : formatVnd(parsed)
            const caret = e.target.selectionStart ?? raw.length
            pendingCaret.current = caretForDigitsAfter(next, digitsAfter(raw, caret))
            setText(next)
            onChange(parsed)
          }}
          onBlur={(e) => {
            setFocused(false)
            const parsed = parseVnd(text)
            onChange(parsed)
            setText(formatVnd(parsed))
            onBlur?.(e)
          }}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          {suffix}
        </span>
      </div>
    )
  },
)
CurrencyInput.displayName = 'CurrencyInput'

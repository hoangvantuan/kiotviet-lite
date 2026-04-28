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

export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onChange, suffix = 'đ', className, onBlur, onFocus, ...rest }, ref) => {
    const [text, setText] = React.useState<string>(() => formatVnd(value ?? null))
    const [focused, setFocused] = React.useState(false)

    React.useEffect(() => {
      if (!focused) {
        setText(formatVnd(value ?? null))
      }
    }, [value, focused])

    return (
      <div className="relative">
        <Input
          {...rest}
          ref={ref}
          inputMode="numeric"
          className={cn('pr-10', className)}
          value={text}
          onFocus={(e) => {
            setFocused(true)
            onFocus?.(e)
          }}
          onChange={(e) => {
            const raw = e.target.value
            setText(raw)
            const parsed = parseVnd(raw)
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

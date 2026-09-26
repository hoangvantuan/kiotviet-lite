import { Banknote, CreditCard, QrCode } from 'lucide-react'

import { MONEY_METHOD_LABELS, MONEY_METHODS, type MoneyMethod } from '@kiotviet-lite/shared'

import { cn } from '@/lib/utils'

const ICONS: Record<MoneyMethod, React.ElementType> = {
  cash: Banknote,
  transfer: CreditCard,
  qr: QrCode,
}

interface MoneyMethodPickerProps {
  value: MoneyMethod
  onChange: (method: MoneyMethod) => void
  disabled?: boolean
  /** Nhãn cho trình đọc màn hình, ví dụ "Phương thức nhận tiền" */
  ariaLabel: string
  idPrefix?: string
}

/**
 * TIEN-05, TIEN-02: chọn kênh của một khoản tiền (tiền mặt, chuyển khoản, QR) trên phiếu thu,
 * phiếu trả, phiếu chi. Báo cáo dòng tiền và đối soát ca tách theo đúng lựa chọn này.
 */
export function MoneyMethodPicker({
  value,
  onChange,
  disabled,
  ariaLabel,
  idPrefix = 'money-method',
}: MoneyMethodPickerProps) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="grid grid-cols-3 gap-2">
      {MONEY_METHODS.map((method) => {
        const Icon = ICONS[method]
        const selected = value === method
        return (
          <button
            key={method}
            id={`${idPrefix}-${method}`}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(method)}
            className={cn(
              'flex min-h-[44px] items-center justify-center gap-2 rounded-md border px-3 text-sm transition-colors disabled:opacity-50',
              selected
                ? 'border-primary bg-primary/10 font-medium text-primary'
                : 'border-border hover:bg-muted',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {MONEY_METHOD_LABELS[method]}
          </button>
        )
      })}
    </div>
  )
}

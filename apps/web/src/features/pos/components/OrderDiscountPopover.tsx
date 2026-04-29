import { useEffect, useState } from 'react'
import { Percent } from 'lucide-react'

import { CurrencyInput } from '@/components/shared/currency-input'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatVndWithSuffix } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { type DiscountType, useCartStore } from '@/stores/use-cart-store'

import { DISCOUNT_TYPE } from '../constants'

interface OrderDiscountPopoverProps {
  subtotal: number
  discountType: DiscountType | null
  discountValue: number
  discountAmount: number
}

export function OrderDiscountPopover({
  subtotal,
  discountType,
  discountValue,
  discountAmount,
}: OrderDiscountPopoverProps) {
  const updateOrderDiscount = useCartStore((s) => s.updateOrderDiscount)
  const [open, setOpen] = useState(false)
  const [draftType, setDraftType] = useState<DiscountType>(discountType ?? DISCOUNT_TYPE.AMOUNT)
  const [draftValue, setDraftValue] = useState<number>(discountValue)

  useEffect(() => {
    if (open) {
      setDraftType(discountType ?? DISCOUNT_TYPE.AMOUNT)
      setDraftValue(discountValue)
    }
  }, [open, discountType, discountValue])

  function applyDiscount(nextType: DiscountType, nextValue: number) {
    if (nextValue <= 0) {
      updateOrderDiscount(null, 0)
      return
    }
    if (nextType === DISCOUNT_TYPE.PERCENT) {
      const capped = Math.min(Math.max(nextValue, 0), 100)
      updateOrderDiscount(nextType, capped)
      return
    }
    const capped = Math.min(Math.max(nextValue, 0), subtotal)
    updateOrderDiscount(nextType, capped)
  }

  function handleTypeChange(nextType: DiscountType) {
    setDraftType(nextType)
    setDraftValue(0)
    updateOrderDiscount(null, 0)
  }

  function handleValueChange(value: number) {
    setDraftValue(value)
    applyDiscount(draftType, value)
  }

  function handleClear() {
    setDraftValue(0)
    updateOrderDiscount(null, 0)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="-mx-1 flex w-[calc(100%+0.5rem)] items-center justify-between rounded-md px-1 py-1 text-left transition-colors hover:bg-accent"
          aria-label="Chỉnh chiết khấu đơn"
        >
          <span className="text-sm text-orange-500">Chiết khấu đơn</span>
          <span
            className={cn(
              'font-mono text-sm',
              discountAmount > 0 ? 'text-orange-500' : 'text-muted-foreground',
            )}
          >
            {discountAmount > 0 ? `-${formatVndWithSuffix(discountAmount)}` : '0đ'}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-72">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Chiết khấu đơn hàng</p>
            <p className="text-xs text-muted-foreground">
              Tổng tiền hàng: {formatVndWithSuffix(subtotal)}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleTypeChange(DISCOUNT_TYPE.AMOUNT)}
              className={cn(
                'flex h-9 flex-1 items-center justify-center rounded-md border text-sm font-medium transition-colors',
                draftType === DISCOUNT_TYPE.AMOUNT
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input bg-background text-muted-foreground hover:bg-accent',
              )}
              aria-pressed={draftType === DISCOUNT_TYPE.AMOUNT}
            >
              VND
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange(DISCOUNT_TYPE.PERCENT)}
              className={cn(
                'flex h-9 flex-1 items-center justify-center gap-1 rounded-md border text-sm font-medium transition-colors',
                draftType === DISCOUNT_TYPE.PERCENT
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input bg-background text-muted-foreground hover:bg-accent',
              )}
              aria-pressed={draftType === DISCOUNT_TYPE.PERCENT}
            >
              <Percent className="h-3.5 w-3.5" />
              <span>Phần trăm</span>
            </button>
          </div>

          {draftType === DISCOUNT_TYPE.AMOUNT ? (
            <CurrencyInput
              value={draftValue}
              onChange={(v) => handleValueChange(v ?? 0)}
              placeholder="0"
              autoFocus
            />
          ) : (
            <div className="relative">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                value={draftValue || ''}
                onChange={(e) => {
                  const raw = e.target.value
                  const parsed = raw === '' ? 0 : Math.max(0, Math.min(100, Number(raw)))
                  handleValueChange(parsed)
                }}
                placeholder="0"
                className="pr-8"
                autoFocus
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
          )}

          {discountAmount > 0 && (
            <p className="text-xs text-muted-foreground">
              Giảm:{' '}
              <span className="font-mono text-orange-500">
                {formatVndWithSuffix(discountAmount)}
              </span>
            </p>
          )}

          <div className="flex justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={discountAmount === 0 && draftValue === 0}
            >
              Xoá
            </Button>
            <Button type="button" size="sm" onClick={() => setOpen(false)}>
              Đóng
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

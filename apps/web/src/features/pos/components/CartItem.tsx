import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  Minus,
  Pencil,
  Percent,
  Plus,
  Shield,
  Tag,
  Trash2,
} from 'lucide-react'

import { CurrencyInput } from '@/components/shared/currency-input'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { usePermissions } from '@/features/auth/use-permissions'
import { formatVndWithSuffix } from '@/lib/currency'
import { cn } from '@/lib/utils'
import {
  type CartItem as CartItemType,
  type DiscountType,
  useCartStore,
} from '@/stores/use-cart-store'

import { DISCOUNT_TYPE } from '../constants'
import { EditUnitPriceDialog } from './EditUnitPriceDialog'
import { StockInfoPopover } from './StockInfoPopover'

interface CartItemProps {
  item: CartItemType
}

export function CartItem({ item }: CartItemProps) {
  const updateQuantity = useCartStore((s) => s.updateQuantity)
  const removeItem = useCartStore((s) => s.removeItem)
  const updateLineDiscount = useCartStore((s) => s.updateLineDiscount)
  const updateLineNotes = useCartStore((s) => s.updateLineNotes)
  const permissions = usePermissions()
  const canEditPrice = permissions.has('pos.editPrice')

  const [expanded, setExpanded] = useState(false)
  const [editPriceOpen, setEditPriceOpen] = useState(false)
  const [draftQty, setDraftQty] = useState<string>(String(item.quantity))
  const [draftType, setDraftType] = useState<DiscountType>(
    item.discountType ?? DISCOUNT_TYPE.AMOUNT,
  )
  const [draftNotes, setDraftNotes] = useState<string>(item.notes ?? '')

  useEffect(() => {
    setDraftQty(String(item.quantity))
  }, [item.quantity])

  useEffect(() => {
    setDraftNotes(item.notes ?? '')
  }, [item.notes])

  useEffect(() => {
    if (item.discountType) setDraftType(item.discountType)
  }, [item.discountType])

  const gross = item.unitPrice * item.quantity
  const hasLineDiscount = item.discountAmount > 0
  const overStock = item.trackInventory && item.quantity > item.stockQuantity

  function commitQty() {
    const parsed = Number(draftQty)
    if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
      setDraftQty(String(item.quantity))
      return
    }
    if (parsed === item.quantity) return
    updateQuantity(item.id, parsed)
  }

  function handleTypeChange(nextType: DiscountType) {
    setDraftType(nextType)
    updateLineDiscount(item.id, null, 0)
  }

  function handleDiscountValueChange(value: number) {
    if (value <= 0) {
      updateLineDiscount(item.id, null, 0)
      return
    }
    if (draftType === DISCOUNT_TYPE.PERCENT) {
      updateLineDiscount(item.id, draftType, Math.min(Math.max(value, 0), 100))
      return
    }
    updateLineDiscount(item.id, draftType, Math.min(Math.max(value, 0), gross))
  }

  function handleNotesBlur() {
    const next = draftNotes.trim() === '' ? null : draftNotes
    if (next !== (item.notes ?? null)) {
      updateLineNotes(item.id, next)
    }
  }

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-start gap-2 px-3 py-2.5">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="min-w-0 flex-1 cursor-pointer text-left transition-colors hover:bg-accent/40 rounded-md -mx-1 px-1"
        >
          <div className="flex items-start gap-1.5">
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
                expanded ? 'rotate-0' : '-rotate-90',
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{item.productName}</p>
              {item.variantName && (
                <p className="truncate text-xs text-muted-foreground">{item.variantName}</p>
              )}
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                {canEditPrice ? (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditPriceOpen(true)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        e.stopPropagation()
                        setEditPriceOpen(true)
                      }
                    }}
                    className={cn(
                      'inline-flex items-center gap-1 rounded font-mono text-xs cursor-pointer hover:underline',
                      item.priceOverride ? 'text-orange-500' : 'text-muted-foreground',
                    )}
                    aria-label="Sửa giá bán"
                  >
                    {formatVndWithSuffix(item.unitPrice)}
                    {item.unitName && <span className="font-sans"> / {item.unitName}</span>}
                    <Pencil className="h-3 w-3" aria-hidden="true" />
                  </span>
                ) : (
                  <p
                    className={cn(
                      'font-mono text-xs',
                      item.priceOverride ? 'text-orange-500' : 'text-muted-foreground',
                    )}
                  >
                    {formatVndWithSuffix(item.unitPrice)}
                    {item.unitName && <span className="font-sans"> / {item.unitName}</span>}
                  </p>
                )}
                {item.priceOverride && (
                  <span className="inline-flex items-center gap-1 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                    Đã sửa giá
                    {item.priceOverridePinUsed && <Shield className="h-3 w-3" aria-hidden="true" />}
                  </span>
                )}
              </div>
              {item.priceOverride && item.originalPrice !== null && (
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground line-through">
                  {formatVndWithSuffix(item.originalPrice)}
                </p>
              )}
              {hasLineDiscount && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-orange-500">
                  <Tag className="h-3 w-3" aria-hidden="true" />
                  {item.discountType === DISCOUNT_TYPE.PERCENT
                    ? `Giảm ${item.discountValue}% (${formatVndWithSuffix(item.discountAmount)})`
                    : `Giảm ${formatVndWithSuffix(item.discountAmount)}`}
                </p>
              )}
              {item.notes && !expanded && (
                <p className="mt-0.5 truncate text-xs italic text-muted-foreground">{item.notes}</p>
              )}
              {overStock && (
                <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-amber-500">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  {item.stockQuantity <= 0
                    ? 'Hết hàng'
                    : `Tồn kho chỉ còn ${item.stockQuantity}${item.unitName ? ` ${item.unitName}` : ''}`}
                </p>
              )}
            </div>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => updateQuantity(item.id, item.quantity - 1)}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-input text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:h-7 sm:w-7"
            aria-label="Giảm số lượng"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-8 text-center font-mono text-sm font-medium">{item.quantity}</span>
          <button
            type="button"
            onClick={() => updateQuantity(item.id, item.quantity + 1)}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-input text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:h-7 sm:w-7"
            aria-label="Tăng số lượng"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <p className="font-mono text-sm font-semibold text-foreground">
            {formatVndWithSuffix(item.lineTotal)}
          </p>
          <div className="flex items-center gap-0.5">
            <StockInfoPopover productId={item.productId} />
            <button
              type="button"
              onClick={() => removeItem(item.id)}
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive sm:h-7 sm:w-7"
              aria-label="Xoá sản phẩm"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="space-y-3 bg-muted/30 px-3 py-3" data-no-toggle>
          <div>
            <label
              htmlFor={`qty-${item.id}`}
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Số lượng
            </label>
            <Input
              id={`qty-${item.id}`}
              type="number"
              inputMode="numeric"
              min={1}
              value={draftQty}
              onChange={(e) => setDraftQty(e.target.value)}
              onBlur={commitQty}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
              className="h-9"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Chiết khấu dòng
            </label>
            <div className="mb-2 flex gap-2">
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
                <span>%</span>
              </button>
            </div>
            {draftType === DISCOUNT_TYPE.AMOUNT ? (
              <CurrencyInput
                value={item.discountType === DISCOUNT_TYPE.AMOUNT ? item.discountValue : 0}
                onChange={(v) => handleDiscountValueChange(v ?? 0)}
                placeholder="0"
                className="h-9"
              />
            ) : (
              <div className="relative">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  value={
                    item.discountType === DISCOUNT_TYPE.PERCENT ? item.discountValue || '' : ''
                  }
                  onChange={(e) => {
                    const raw = e.target.value
                    const parsed = raw === '' ? 0 : Math.max(0, Math.min(100, Number(raw)))
                    handleDiscountValueChange(parsed)
                  }}
                  placeholder="0"
                  className="h-9 pr-8"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  %
                </span>
              </div>
            )}
          </div>

          <div>
            <label
              htmlFor={`notes-${item.id}`}
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Ghi chú
            </label>
            <Textarea
              id={`notes-${item.id}`}
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              onBlur={handleNotesBlur}
              placeholder="Ghi chú cho dòng..."
              rows={2}
              className="resize-none text-sm"
            />
          </div>
        </div>
      )}

      {canEditPrice && (
        <EditUnitPriceDialog
          item={editPriceOpen ? item : null}
          open={editPriceOpen}
          onOpenChange={setEditPriceOpen}
        />
      )}
    </div>
  )
}

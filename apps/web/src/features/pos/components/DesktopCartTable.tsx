import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  FileText,
  Minus,
  Pencil,
  Percent,
  Plus,
  Shield,
  ShoppingCart,
  Trash2,
} from 'lucide-react'

import { CurrencyInput } from '@/components/shared/currency-input'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { usePermissions } from '@/features/auth/use-permissions'
import { formatVndWithSuffix } from '@/lib/currency'
import { cn } from '@/lib/utils'
import {
  type CartItem as CartItemType,
  type DiscountType,
  useCartStore,
} from '@/stores/use-cart-store'

import { DISCOUNT_TYPE } from '../constants'
import {
  buildCartItemId,
  repriceOnQuantityAction,
  useRepriceOnQuantity,
} from '../hooks/use-auto-reprice'
import { EditUnitPriceDialog } from './EditUnitPriceDialog'
import { PriceSourceBadge } from './PriceSourceBadge'
import { StockInfoPopover } from './StockInfoPopover'

interface DesktopCartRowProps {
  item: CartItemType
  index: number
}

function DesktopCartRow({ item, index }: DesktopCartRowProps) {
  const updateQuantity = useCartStore((s) => s.updateQuantity)
  const removeItem = useCartStore((s) => s.removeItem)
  const updateLineDiscount = useCartStore((s) => s.updateLineDiscount)
  const updateLineNotes = useCartStore((s) => s.updateLineNotes)
  const changeItemUnit = useCartStore((s) => s.changeItemUnit)

  const permissions = usePermissions()
  const canEditPrice = permissions.has('pos.editPrice')
  const repriceOnQuantity = useRepriceOnQuantity()

  const [editPriceOpen, setEditPriceOpen] = useState(false)
  const [discountPopoverOpen, setDiscountPopoverOpen] = useState(false)
  const [notesPopoverOpen, setNotesPopoverOpen] = useState(false)

  const [draftQty, setDraftQty] = useState<string>(String(item.quantity))
  const [draftDiscountType, setDraftDiscountType] = useState<DiscountType>(
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
    if (item.discountType) setDraftDiscountType(item.discountType)
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
    repriceOnQuantity(item.id, parsed)
  }

  function handleTypeChange(nextType: DiscountType) {
    setDraftDiscountType(nextType)
    updateLineDiscount(item.id, null, 0)
  }

  function handleDiscountValueChange(value: number) {
    if (value <= 0) {
      updateLineDiscount(item.id, null, 0)
      return
    }
    if (draftDiscountType === DISCOUNT_TYPE.PERCENT) {
      updateLineDiscount(item.id, draftDiscountType, Math.min(Math.max(value, 0), 100))
      return
    }
    updateLineDiscount(item.id, draftDiscountType, Math.min(Math.max(value, 0), gross))
  }

  function handleNotesSave() {
    const next = draftNotes.trim() === '' ? null : draftNotes
    if (next !== (item.notes ?? null)) {
      updateLineNotes(item.id, next)
    }
    setNotesPopoverOpen(false)
  }

  const hasConversions = item.unitConversions && item.unitConversions.length > 0

  return (
    <tr className="border-b border-border/80 transition-colors hover:bg-muted/40">
      {/* 1. STT */}
      <td className="w-10 px-3 py-3 text-center font-mono text-xs text-muted-foreground">
        {index + 1}
      </td>

      {/* 2. Mã hàng */}
      <td className="w-28 px-3 py-3 font-mono text-xs text-muted-foreground">
        <span className="truncate block max-w-[100px]" title={item.sku}>
          {item.sku}
        </span>
      </td>

      {/* 3. Tên hàng hóa, biến thể, nguồn giá & cảnh báo */}
      <td className="min-w-[180px] px-3 py-3">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-foreground">{item.productName}</span>
            {item.variantName && (
              <span className="rounded bg-secondary/80 px-1.5 py-0.2 text-[11px] text-muted-foreground">
                {item.variantName}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
            {item.priceOverride ? (
              <span className="inline-flex items-center gap-1 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                Đã sửa giá
                {item.priceOverridePinUsed && <Shield className="h-3 w-3" aria-hidden="true" />}
              </span>
            ) : (
              <PriceSourceBadge
                source={item.priceSource}
                sourceDetail={item.priceSourceDetail}
                isFallback={item.isFallback}
              />
            )}

            {overStock && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                {item.stockQuantity <= 0
                  ? 'Hết hàng'
                  : `Tồn: ${item.stockQuantity}${item.unitName ? ` ${item.unitName}` : ''}`}
              </span>
            )}

            {item.notes && (
              <span
                className="inline-flex items-center gap-1 text-[11px] italic text-muted-foreground max-w-[200px] truncate"
                title={item.notes}
              >
                <FileText className="h-3 w-3 shrink-0 text-muted-foreground/70" />
                {item.notes}
              </span>
            )}
          </div>
        </div>
      </td>

      {/* 4. Đơn vị tính / Đơn vị quy đổi inline */}
      <td className="w-32 px-3 py-3">
        {hasConversions ? (
          <select
            value={item.unitConversionId ?? ''}
            onChange={(e) => {
              const val = e.target.value
              const nextUnitConversionId = val === '' ? null : val
              changeItemUnit(item.id, nextUnitConversionId)
              const currentTab = useCartStore.getState().activeTab
              const updatedTab = useCartStore.getState().tabs[currentTab]
              const targetId = buildCartItemId(item.productId, item.variantId, nextUnitConversionId)
              const updatedItem = updatedTab?.items.find((i) => i.id === targetId)
              const effectiveQty = updatedItem ? updatedItem.quantity : item.quantity
              repriceOnQuantityAction(targetId, effectiveQty)
            }}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Chọn đơn vị tính"
          >
            <option value="">{item.baseUnit ?? item.unitName ?? 'Cơ bản'}</option>
            {item.unitConversions?.map((uc) => (
              <option key={uc.id} value={uc.id}>
                {uc.unit}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">
            {item.unitName || 'Cái'}
          </span>
        )}
      </td>

      {/* 5. Số lượng (stepper + direct input) */}
      <td className="w-36 px-3 py-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              updateQuantity(item.id, item.quantity - 1)
              if (item.quantity - 1 > 0) repriceOnQuantity(item.id, item.quantity - 1)
            }}
            className="flex h-8 w-8 items-center justify-center rounded border border-input text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Giảm số lượng"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <Input
            id={`desktop-qty-${item.id}`}
            type="number"
            inputMode="numeric"
            min={1}
            value={draftQty}
            onChange={(e) => setDraftQty(e.target.value)}
            onBlur={commitQty}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            className="h-8 w-14 text-center font-mono text-xs px-1"
            aria-label="Số lượng"
          />
          <button
            type="button"
            onClick={() => {
              updateQuantity(item.id, item.quantity + 1)
              repriceOnQuantity(item.id, item.quantity + 1)
            }}
            className="flex h-8 w-8 items-center justify-center rounded border border-input text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Tăng số lượng"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>

      {/* 6. Đơn giá (inline edit dialog / PIN control) */}
      <td className="w-32 px-3 py-3 text-right">
        <div className="flex flex-col items-end">
          {item.priceOverride && item.originalPrice !== null && (
            <span className="font-mono text-[11px] text-muted-foreground line-through">
              {formatVndWithSuffix(item.originalPrice)}
            </span>
          )}

          {canEditPrice ? (
            <button
              type="button"
              onClick={() => setEditPriceOpen(true)}
              className={cn(
                'group inline-flex items-center gap-1 rounded font-mono text-sm cursor-pointer hover:underline',
                item.priceOverride ? 'text-orange-500 font-medium' : 'text-foreground',
              )}
              aria-label="Sửa giá bán"
            >
              <span>{formatVndWithSuffix(item.unitPrice)}</span>
              <Pencil
                className="h-3 w-3 opacity-40 transition-opacity group-hover:opacity-100"
                aria-hidden="true"
              />
            </button>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      'font-mono text-sm cursor-default',
                      item.priceOverride ? 'text-orange-500 font-medium' : 'text-foreground',
                    )}
                  >
                    {formatVndWithSuffix(item.unitPrice)}
                  </span>
                </TooltipTrigger>
                <TooltipContent>Bạn không có quyền sửa giá</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {canEditPrice && (
          <EditUnitPriceDialog
            item={editPriceOpen ? item : null}
            open={editPriceOpen}
            onOpenChange={setEditPriceOpen}
          />
        )}
      </td>

      {/* 7. Chiết khấu dòng */}
      <td className="w-28 px-3 py-3 text-right">
        <Popover open={discountPopoverOpen} onOpenChange={setDiscountPopoverOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'inline-flex h-7 items-center justify-end rounded px-2 text-xs font-mono transition-colors',
                hasLineDiscount
                  ? 'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-950 dark:text-orange-300'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
              aria-label="Chiết khấu dòng"
            >
              {hasLineDiscount
                ? item.discountType === DISCOUNT_TYPE.PERCENT
                  ? `-${item.discountValue}%`
                  : `-${formatVndWithSuffix(item.discountAmount)}`
                : '0 đ'}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="end">
            <p className="mb-2 text-xs font-semibold text-foreground">Chiết khấu dòng</p>
            <div className="mb-2 flex gap-1">
              <button
                type="button"
                onClick={() => handleTypeChange(DISCOUNT_TYPE.AMOUNT)}
                className={cn(
                  'flex h-7 flex-1 items-center justify-center rounded text-xs font-medium transition-colors border',
                  draftDiscountType === DISCOUNT_TYPE.AMOUNT
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-background text-muted-foreground hover:bg-accent',
                )}
                aria-pressed={draftDiscountType === DISCOUNT_TYPE.AMOUNT}
              >
                VND
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange(DISCOUNT_TYPE.PERCENT)}
                className={cn(
                  'flex h-7 flex-1 items-center justify-center gap-1 rounded text-xs font-medium transition-colors border',
                  draftDiscountType === DISCOUNT_TYPE.PERCENT
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-background text-muted-foreground hover:bg-accent',
                )}
                aria-pressed={draftDiscountType === DISCOUNT_TYPE.PERCENT}
              >
                <Percent className="h-3 w-3" />
                <span>%</span>
              </button>
            </div>

            {draftDiscountType === DISCOUNT_TYPE.AMOUNT ? (
              <CurrencyInput
                value={item.discountType === DISCOUNT_TYPE.AMOUNT ? item.discountValue : 0}
                onChange={(v) => handleDiscountValueChange(v ?? 0)}
                placeholder="0"
                className="h-8 text-xs"
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
                  className="h-8 pr-7 text-xs"
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  %
                </span>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </td>

      {/* 8. Thành tiền */}
      <td className="w-32 px-3 py-3 text-right font-mono text-sm font-semibold text-foreground">
        {formatVndWithSuffix(item.lineTotal)}
      </td>

      {/* 9. Thao tác phụ: ghi chú, tồn kho, xóa */}
      <td className="w-24 px-3 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          {/* Note popover */}
          <Popover open={notesPopoverOpen} onOpenChange={setNotesPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                  item.notes && 'text-primary hover:text-primary',
                )}
                aria-label="Ghi chú dòng"
                title={item.notes ? `Ghi chú: ${item.notes}` : 'Thêm ghi chú'}
              >
                <FileText className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="end">
              <p className="mb-2 text-xs font-semibold text-foreground">Ghi chú dòng hàng</p>
              <Textarea
                value={draftNotes}
                onChange={(e) => setDraftNotes(e.target.value)}
                placeholder="Nhập ghi chú cho dòng hàng..."
                rows={2}
                className="resize-none text-xs mb-2"
              />
              <div className="flex justify-end gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setNotesPopoverOpen(false)}
                >
                  Đóng
                </Button>
                <Button size="sm" className="h-7 text-xs" onClick={handleNotesSave}>
                  Lưu
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          {/* Stock info */}
          <StockInfoPopover productId={item.productId} />

          {/* Delete item */}
          <button
            type="button"
            onClick={() => removeItem(item.id)}
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label="Xoá sản phẩm"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  )
}

export function DesktopCartTable() {
  const items = useCartStore((s) => s.tabs[s.activeTab]?.items ?? [])

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center bg-card rounded-lg border border-border/60">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <ShoppingCart className="h-8 w-8 text-muted-foreground/60" />
        </div>
        <p className="mt-4 text-base font-semibold text-foreground">
          Chưa có sản phẩm trong đơn hàng
        </p>
        <p className="mt-1.5 max-w-sm text-xs text-muted-foreground">
          Tìm sản phẩm bằng tên, mã hàng hoặc mã vạch ở ô tìm kiếm phía trên, hoặc mở Lưới sản phẩm
          để chọn sản phẩm thêm vào đơn.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col min-h-0 bg-card rounded-lg border border-border overflow-hidden shadow-sm">
      <div className="flex-1 overflow-x-auto overflow-y-auto">
        <table className="w-full min-w-[720px] text-left text-sm border-collapse">
          <thead className="sticky top-0 z-10 border-b border-border bg-muted/60 backdrop-blur text-xs font-semibold text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-2.5 text-center">#</th>
              <th className="w-28 px-3 py-2.5">Mã hàng</th>
              <th className="min-w-[180px] px-3 py-2.5">Tên sản phẩm</th>
              <th className="w-32 px-3 py-2.5">Đơn vị</th>
              <th className="w-36 px-3 py-2.5 text-center">Số lượng</th>
              <th className="w-32 px-3 py-2.5 text-right">Đơn giá</th>
              <th className="w-28 px-3 py-2.5 text-right">Chiết khấu</th>
              <th className="w-32 px-3 py-2.5 text-right">Thành tiền</th>
              <th className="w-24 px-3 py-2.5 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item, index) => (
              <DesktopCartRow key={item.id} item={item} index={index} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-border bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
        <span>Tổng cộng: {items.length} dòng sản phẩm</span>
        <span>Tổng số lượng: {items.reduce((sum, i) => sum + i.quantity, 0)}</span>
      </div>
    </div>
  )
}

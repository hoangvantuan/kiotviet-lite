import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Shield } from 'lucide-react'

import { CurrencyInput } from '@/components/shared/currency-input'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PinDialog } from '@/features/auth/pin-dialog'
import { usePermissions } from '@/features/auth/use-permissions'
import { formatVndWithSuffix } from '@/lib/currency'
import { showError, showSuccess } from '@/lib/toast'
import { type CartItem, useCartStore } from '@/stores/use-cart-store'

interface EditUnitPriceDialogProps {
  item: CartItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditUnitPriceDialog({ item, open, onOpenChange }: EditUnitPriceDialogProps) {
  const updateUnitPrice = useCartStore((s) => s.updateUnitPrice)
  const permissions = usePermissions()

  const [draftPrice, setDraftPrice] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [pinOpen, setPinOpen] = useState(false)
  const pendingPriceRef = useRef<number | null>(null)
  const pendingReasonRef = useRef<string | null>(null)

  useEffect(() => {
    if (open && item) {
      setDraftPrice(item.unitPrice)
      setReason(item.priceOverrideReason ?? '')
    }
    if (!open) {
      pendingPriceRef.current = null
      pendingReasonRef.current = null
    }
  }, [open, item])

  if (!item) return null

  const costPrice = item.costPrice
  const isCostUnknown = costPrice === null
  const isBelowCost = !isCostUnknown && draftPrice !== null && draftPrice < costPrice
  const canEditBelowCost = permissions.has('pos.editPriceBelowCost')

  function applyEdit(price: number, reasonText: string | null, pinUsed: boolean) {
    updateUnitPrice(item!.id, price, {
      reason: reasonText,
      pinUsed,
    })
    showSuccess('Đã cập nhật giá bán')
    onOpenChange(false)
  }

  function handleSubmit() {
    if (draftPrice === null || draftPrice <= 0) {
      showError('Giá bán phải lớn hơn 0')
      return
    }

    const trimmedReason = reason.trim() === '' ? null : reason.trim()

    if (isBelowCost && !canEditBelowCost) {
      pendingPriceRef.current = draftPrice
      pendingReasonRef.current = trimmedReason
      setPinOpen(true)
      return
    }

    applyEdit(draftPrice, trimmedReason, false)
  }

  function handlePinVerified() {
    const price = pendingPriceRef.current
    const reasonText = pendingReasonRef.current
    if (price === null) return
    applyEdit(price, reasonText, true)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sửa giá bán</DialogTitle>
            <DialogDescription>
              {item.productName}
              {item.variantName ? ` - ${item.variantName}` : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Giá gốc:</span>
                <span className="font-mono font-medium">
                  {formatVndWithSuffix(item.originalPrice ?? item.unitPrice)}
                </span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">Giá vốn:</span>
                <span className="font-mono font-medium">
                  {isCostUnknown ? '—' : formatVndWithSuffix(costPrice)}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-unit-price">Giá mới</Label>
              <CurrencyInput
                id="edit-unit-price"
                value={draftPrice}
                onChange={(v) => setDraftPrice(v)}
                placeholder="Nhập giá bán mới"
                autoFocus
              />
              {isCostUnknown && (
                <p className="flex items-center gap-1.5 text-xs text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  Chưa có giá vốn, không thể xác minh giá dưới vốn.
                </p>
              )}
              {isBelowCost && (
                <p className="flex items-center gap-1.5 text-xs text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  Giá thấp hơn giá vốn
                  {canEditBelowCost ? '.' : ', cần xác thực PIN của Owner.'}
                </p>
              )}
              {!canEditBelowCost && isBelowCost && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                  Hệ thống sẽ yêu cầu PIN khi xác nhận.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-unit-price-reason">Lý do (tuỳ chọn)</Label>
              <Input
                id="edit-unit-price-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Vd: khách quen, giảm theo combo..."
                maxLength={255}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="button" onClick={handleSubmit}>
              Áp dụng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PinDialog
        open={pinOpen}
        onOpenChange={setPinOpen}
        onVerified={handlePinVerified}
        title="Xác thực PIN của Owner"
        description="Giá bán thấp hơn giá vốn. Vui lòng nhập PIN của Owner để tiếp tục."
      />
    </>
  )
}

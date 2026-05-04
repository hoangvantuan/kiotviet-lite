import { useState } from 'react'

import { RETURN_REASON_LABELS } from '@kiotviet-lite/shared'

import { Badge } from '@/components/ui/badge'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { ApiClientError } from '@/lib/api-client'
import { formatVndWithSuffix } from '@/lib/currency'
import { showError, showSuccess } from '@/lib/toast'

import type { ReturnableItem } from './orders-api'
import { useCreateReturnMutation, useReturnableItemsQuery } from './use-orders'

interface ReturnDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  orderId: string
  orderNumber: string
}

const REASON_OPTIONS = Object.entries(RETURN_REASON_LABELS).map(([value, label]) => ({
  value,
  label,
}))

interface ReturnLine {
  orderItemId: string
  quantity: number
  reason: string
}

export function ReturnDialog({ open, onOpenChange, orderId, orderNumber }: ReturnDialogProps) {
  const itemsQuery = useReturnableItemsQuery(open ? orderId : undefined)
  const mutation = useCreateReturnMutation()
  const [lines, setLines] = useState<Map<string, ReturnLine>>(new Map())
  const [note, setNote] = useState('')
  const [showResult, setShowResult] = useState<{
    refundAmount: number
    debtReductionAmount: number
    returnNumber: string
  } | null>(null)

  const items: ReturnableItem[] = itemsQuery.data ?? []

  function updateLine(orderItemId: string, field: 'quantity' | 'reason', value: number | string) {
    setLines((prev) => {
      const next = new Map(prev)
      const existing = next.get(orderItemId) ?? { orderItemId, quantity: 0, reason: 'defective' }
      if (field === 'quantity') {
        existing.quantity = value as number
      } else {
        existing.reason = value as string
      }
      next.set(orderItemId, existing)
      return next
    })
  }

  const totalRefund = items.reduce((sum, item) => {
    const line = lines.get(item.orderItemId)
    if (!line || line.quantity <= 0) return sum
    return sum + item.unitPrice * line.quantity
  }, 0)

  const hasSelection = Array.from(lines.values()).some((l) => l.quantity > 0)

  async function handleSubmit() {
    const returnItems = Array.from(lines.values())
      .filter((l) => l.quantity > 0)
      .map((l) => ({ orderItemId: l.orderItemId, quantity: l.quantity, reason: l.reason }))

    if (returnItems.length === 0) return

    try {
      const result = await mutation.mutateAsync({
        orderId,
        input: { items: returnItems, note: note.trim() || null },
      })
      const data = result.data
      setShowResult({
        refundAmount: data.refundAmount,
        debtReductionAmount: data.debtReductionAmount,
        returnNumber: data.returnNumber,
      })
      showSuccess(`Trả hàng thành công: ${data.returnNumber}`)
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError(err.message || 'Lỗi khi trả hàng')
      } else {
        showError('Lỗi không xác định')
      }
    }
  }

  function handleClose() {
    setLines(new Map())
    setNote('')
    setShowResult(null)
    onOpenChange(false)
  }

  if (showResult) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Trả hàng thành công</DialogTitle>
            <DialogDescription>Mã phiếu trả: {showResult.returnNumber}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {showResult.refundAmount > 0 && (
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
                <p className="text-sm font-medium text-blue-800">
                  Cần hoàn {formatVndWithSuffix(showResult.refundAmount)} cho khách
                </p>
              </div>
            )}
            {showResult.debtReductionAmount > 0 && (
              <div className="rounded-md border border-green-200 bg-green-50 p-3">
                <p className="text-sm font-medium text-green-800">
                  Đã giảm nợ {formatVndWithSuffix(showResult.debtReductionAmount)}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleClose}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Trả hàng</DialogTitle>
          <DialogDescription>Đơn hàng: {orderNumber}</DialogDescription>
        </DialogHeader>

        {itemsQuery.isLoading && (
          <div className="py-8 text-center text-sm text-muted-foreground">Đang tải...</div>
        )}

        {itemsQuery.isError && (
          <div className="py-8 text-center text-sm text-destructive">
            Không tải được danh sách sản phẩm
          </div>
        )}

        {items.length > 0 && (
          <div className="space-y-3">
            {items.map((item) => {
              const line = lines.get(item.orderItemId)
              const qty = line?.quantity ?? 0
              const reason = line?.reason ?? 'defective'
              const fullyReturned = item.remainingQuantity <= 0

              return (
                <div
                  key={item.orderItemId}
                  className={`rounded-md border p-3 space-y-2 ${fullyReturned ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm">{item.productName}</p>
                      {item.variantName && (
                        <p className="text-xs text-muted-foreground">{item.variantName}</p>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatVndWithSuffix(item.unitPrice)}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Đã mua: {item.purchasedQuantity}</span>
                    {item.returnedQuantity > 0 && (
                      <Badge variant="outline" className="text-xs">
                        Đã trả: {item.returnedQuantity}
                      </Badge>
                    )}
                    {fullyReturned && (
                      <Badge variant="secondary" className="text-xs">
                        Đã trả hết
                      </Badge>
                    )}
                  </div>

                  {!fullyReturned && (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs text-muted-foreground whitespace-nowrap">
                          SL trả:
                        </label>
                        <Input
                          type="number"
                          className="w-20 h-8 text-sm"
                          min={0}
                          max={item.remainingQuantity}
                          value={qty}
                          onChange={(e) => {
                            const val = Math.min(
                              Math.max(0, parseInt(e.target.value) || 0),
                              item.remainingQuantity,
                            )
                            updateLine(item.orderItemId, 'quantity', val)
                          }}
                        />
                        <span className="text-xs text-muted-foreground">
                          / {item.remainingQuantity}
                        </span>
                      </div>

                      <Select
                        value={reason}
                        onValueChange={(v) => updateLine(item.orderItemId, 'reason', v)}
                      >
                        <SelectTrigger className="h-8 text-xs flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {REASON_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <Separator />

        <div className="space-y-2">
          <div className="flex justify-between font-medium">
            <span>Tổng tiền hoàn</span>
            <span>{formatVndWithSuffix(totalRefund)}</span>
          </div>
          <Textarea
            placeholder="Ghi chú (tùy chọn)"
            className="text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Hủy
          </Button>
          <Button onClick={handleSubmit} disabled={!hasSelection || mutation.isPending}>
            {mutation.isPending ? 'Đang xử lý...' : 'Xác nhận trả hàng'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

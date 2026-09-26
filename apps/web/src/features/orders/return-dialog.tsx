import { useState } from 'react'

import {
  defaultRefundMethod,
  formatQuantity,
  hasPermission,
  type MoneyMethod,
  moneyMethodLabel,
  REFUND_METHODS,
  refundExceedsChannel,
  RETURN_REASON_LABELS,
} from '@kiotviet-lite/shared'

import { MoneyMethodPicker } from '@/components/shared/money-method-picker'
import { QuantityInput } from '@/components/shared/quantity-input'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { PinDialog } from '@/features/auth/pin-dialog'
import { DocumentShiftSelect } from '@/features/shifts/document-shift-select'
import { useDocumentShiftChoice } from '@/features/shifts/use-document-shift-choice'
import { useGuardedOpenChange } from '@/hooks/use-document-mutation'
import { ApiClientError } from '@/lib/api-client'
import { formatVndWithSuffix } from '@/lib/currency'
import { showError, showSuccess } from '@/lib/toast'
import { useAuthStore } from '@/stores/use-auth-store'

import type { ReturnableItem } from './orders-api'
import { previewReturn } from './return-preview'
import { useCreateReturnMutation, useReturnableItemsQuery } from './use-orders'

interface ReturnDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  orderId: string
  orderNumber: string
  /** Nợ còn lại của đơn; tiền hoàn cấn vào đây trước (ADR-0010) */
  outstandingDebt: number
  /** TIEN-02: cách khách đã trả đơn gốc, để chọn sẵn kênh hoàn tiền */
  orderPaymentMethod: string
  orderCashAmount: number | null
  orderTransferAmount: number | null
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

export function ReturnDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  outstandingDebt,
  orderPaymentMethod,
  orderCashAmount,
  orderTransferAmount,
}: ReturnDialogProps) {
  const itemsQuery = useReturnableItemsQuery(open ? orderId : undefined)
  const mutation = useCreateReturnMutation()
  const [lines, setLines] = useState<Map<string, ReturnLine>>(new Map())
  const [note, setNote] = useState('')
  const orderPayment = {
    paymentMethod: orderPaymentMethod,
    cashAmount: orderCashAmount,
    transferAmount: orderTransferAmount,
  }
  const initialRefundMethod = defaultRefundMethod(orderPayment)
  const role = useAuthStore((s) => s.user?.role)
  const [pinOpen, setPinOpen] = useState(false)
  const shiftChoice = useDocumentShiftChoice()
  const [refundMethod, setRefundMethod] = useState<MoneyMethod>(initialRefundMethod)
  const [showResult, setShowResult] = useState<{
    refundAmount: number
    debtReductionAmount: number
    prepaymentRefundAmount: number
    returnNumber: string
    refundMethod: MoneyMethod | null
  } | null>(null)

  const items: ReturnableItem[] = itemsQuery.data?.items ?? []
  const prepaymentApplied = itemsQuery.data?.prepaymentApplied ?? 0
  const refundableByChannel = itemsQuery.data?.refundableByChannel ?? null

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

  const preview = previewReturn(
    items,
    new Map(Array.from(lines.values(), (l) => [l.orderItemId, l.quantity])),
    outstandingDebt,
    prepaymentApplied,
  )

  const hasSelection = Array.from(lines.values()).some((l) => l.quantity > 0)
  // TIEN-111: hoàn qua một kênh nhiều hơn số khách đã trả qua kênh đó là vượt quyền, cần PIN người
  // duyệt (R1). Cùng hàm với máy chủ (refundExceedsChannel), máy chủ vẫn là nơi kiểm cuối cùng.
  const refundMethodOverridden =
    refundableByChannel !== null &&
    refundExceedsChannel(refundableByChannel, refundMethod, preview.refundAmount)
  const needsApproval =
    refundMethodOverridden && !!role && !hasPermission(role, 'orders.returnOverride')

  async function handleSubmit(approval?: { approverId: string; approverPin: string }) {
    const returnItems = Array.from(lines.values())
      .filter((l) => l.quantity > 0)
      .map((l) => ({ orderItemId: l.orderItemId, quantity: l.quantity, reason: l.reason }))

    if (returnItems.length === 0) return
    if (needsApproval && !approval) {
      setPinOpen(true)
      return
    }

    try {
      const result = await mutation.mutateAsync({
        orderId,
        input: {
          items: returnItems,
          refundMethod,
          note: note.trim() || null,
          ...(shiftChoice.shiftId ? { shiftId: shiftChoice.shiftId } : {}),
          ...approval,
        },
      })
      const data = result.data
      setShowResult({
        refundAmount: data.refundAmount,
        debtReductionAmount: data.debtReductionAmount,
        prepaymentRefundAmount: data.prepaymentRefundAmount ?? 0,
        returnNumber: data.returnNumber,
        refundMethod: data.refundMethod,
      })
      showSuccess(`Trả hàng thành công: ${data.returnNumber}`)
    } catch (err) {
      if (shiftChoice.capture(err)) return
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
    setRefundMethod(initialRefundMethod)
    setPinOpen(false)
    shiftChoice.reset()
    setShowResult(null)
    onOpenChange(false)
  }
  const closeDialog = useGuardedOpenChange((next) => {
    if (!next) handleClose()
  }, mutation)

  if (showResult) {
    return (
      <Dialog open={open} onOpenChange={closeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Trả hàng thành công</DialogTitle>
            <DialogDescription>Mã phiếu trả: {showResult.returnNumber}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* TIEN-113: tách phần đã xử lý xong (không đụng tiền) với khoản tiền còn phải đưa khách */}
            {(showResult.debtReductionAmount > 0 || showResult.prepaymentRefundAmount > 0) && (
              <div
                className="rounded-md border border-green-200 bg-green-50 p-3"
                data-testid="return-result-settled"
              >
                <p className="text-sm font-medium text-green-800">Đã xử lý, không chi tiền</p>
                <ul className="mt-1 space-y-0.5 text-sm text-green-800">
                  {showResult.debtReductionAmount > 0 && (
                    <li>
                      Cấn vào nợ của đơn: {formatVndWithSuffix(showResult.debtReductionAmount)}
                    </li>
                  )}
                  {showResult.prepaymentRefundAmount > 0 && (
                    <li>
                      Hoàn vào tiền trả trước của khách:{' '}
                      {formatVndWithSuffix(showResult.prepaymentRefundAmount)}
                    </li>
                  )}
                </ul>
              </div>
            )}
            {showResult.refundAmount > 0 ? (
              <div
                className="rounded-md border border-blue-200 bg-blue-50 p-3"
                data-testid="return-result-refund"
              >
                <p className="text-sm font-medium text-blue-800">
                  Còn phải chi cho khách: {formatVndWithSuffix(showResult.refundAmount)} (
                  {moneyMethodLabel(showResult.refundMethod)})
                </p>
                <p className="mt-1 text-xs text-blue-800">
                  Khoản chi đã ghi vào sổ quỹ khi lưu phiếu. Hãy đưa tiền hoặc chuyển khoản cho
                  khách ngay.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Không phải chi thêm tiền cho khách.</p>
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
    <Dialog open={open} onOpenChange={closeDialog}>
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
                    <span>Đã mua: {formatQuantity(item.purchasedQuantity)}</span>
                    {item.returnedQuantity > 0 && (
                      <Badge variant="outline" className="text-xs">
                        Đã trả: {formatQuantity(item.returnedQuantity)}
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
                          Số lượng trả:
                        </label>
                        <QuantityInput
                          live
                          aria-label={`Số lượng trả ${item.productName}`}
                          className="w-20 h-8 text-sm"
                          allowDecimal={item.allowDecimalQuantity}
                          value={qty}
                          onCommit={(v) => {
                            const val = Math.min(Math.max(0, v), item.remainingQuantity)
                            updateLine(item.orderItemId, 'quantity', val)
                          }}
                        />
                        <span className="text-xs text-muted-foreground">
                          / {formatQuantity(item.remainingQuantity)}
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
            <span>Tổng giá trị trả</span>
            <span>{formatVndWithSuffix(preview.totalAmount)}</span>
          </div>
          {preview.debtReductionAmount > 0 && (
            <div className="flex justify-between text-sm text-green-700">
              <span>Cấn nợ</span>
              <span>{formatVndWithSuffix(preview.debtReductionAmount)}</span>
            </div>
          )}
          {preview.prepaymentRefundAmount > 0 && (
            <div className="flex justify-between text-sm text-green-700">
              <span>Hoàn vào tiền trả trước</span>
              <span>{formatVndWithSuffix(preview.prepaymentRefundAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span>Hoàn tiền</span>
            <span>{formatVndWithSuffix(preview.refundAmount)}</span>
          </div>
          {preview.refundAmount > 0 && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Hoàn tiền qua</p>
              <MoneyMethodPicker
                value={refundMethod}
                onChange={setRefundMethod}
                disabled={mutation.isPending}
                ariaLabel="Phương thức hoàn tiền"
                idPrefix="refund-method"
                methods={REFUND_METHODS}
              />
              {needsApproval && (
                <p className="text-xs text-muted-foreground">
                  Số hoàn vượt số khách đã trả qua kênh này. Cần chủ cửa hàng hoặc quản lý nhập mã
                  PIN để duyệt.
                </p>
              )}
            </div>
          )}
          {shiftChoice.choices && (
            <DocumentShiftSelect
              choices={shiftChoice.choices}
              value={shiftChoice.shiftId}
              onChange={shiftChoice.setShiftId}
              disabled={mutation.isPending}
              idPrefix="return"
            />
          )}
          <Textarea
            placeholder="Ghi chú (tùy chọn)"
            className="text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => closeDialog(false)}
          >
            Hủy
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={!hasSelection || mutation.isPending || shiftChoice.pending}
          >
            {mutation.isPending ? 'Đang xử lý...' : 'Xác nhận trả hàng'}
          </Button>
        </DialogFooter>
      </DialogContent>
      {needsApproval && open && (
        <PinDialog
          open={pinOpen}
          onOpenChange={setPinOpen}
          title="Duyệt hoàn tiền vượt kênh khách đã trả"
          description="Chủ cửa hàng hoặc quản lý nhập mã PIN của mình để duyệt."
          approvalPermissions={['orders.returnOverride']}
          onVerified={(pin, approverId) => {
            if (pin && approverId) void handleSubmit({ approverId, approverPin: pin })
          }}
        />
      )}
    </Dialog>
  )
}

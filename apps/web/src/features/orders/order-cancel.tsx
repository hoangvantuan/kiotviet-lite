import { useState } from 'react'
import { Ban } from 'lucide-react'
import { toast } from 'sonner'

import { defaultRefundMethod, moneyMethodLabel, type RefundMethod } from '@kiotviet-lite/shared'

import { CancelDocumentDialog } from '@/components/shared/cancel-document-dialog'
import { Button } from '@/components/ui/button'
import { RefundMethodFields } from '@/features/shifts/refund-method-fields'
import { useDocumentShiftChoice } from '@/features/shifts/use-document-shift-choice'
import { handleApiError } from '@/lib/api-error'
import { formatVndWithSuffix } from '@/lib/currency'
import { formatDateTime } from '@/lib/date'

import type { OrderDetailResponse } from './orders-api'
import { useCancelOrderMutation } from './use-orders'

/**
 * TIEN-107: hủy đơn bán. Chỉ đơn hoàn tất, chưa trả hàng; đơn đã có phiếu thu phải hủy phiếu thu
 * trước (máy chủ chặn và báo lý do). Phần khách đã trả lúc bán là tiền trả lại: người hủy chọn kênh
 * trả, tiền mặt gắn vào ca đang mở (BC-06); tiền bán vẫn thuộc ngày bán, ca bán.
 */
export function OrderCancelButton({ order }: { order: OrderDetailResponse }) {
  const [open, setOpen] = useState(false)
  const mutation = useCancelOrderMutation()
  const initialRefundMethod = defaultRefundMethod({
    paymentMethod: order.paymentMethod,
    cashAmount: order.cashAmount,
    transferAmount: order.transferAmount,
  })
  const [refundMethod, setRefundMethod] = useState<RefundMethod>(initialRefundMethod)
  const shiftChoice = useDocumentShiftChoice()
  if (order.status !== 'completed') return null
  // Ước tính để hiện ô chọn kênh; máy chủ tính chính xác = tổng đơn trừ khoản nợ ghi lúc bán
  const refundEstimate = order.total - (order.debtAmountAtSale ?? order.debtAmount)

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setRefundMethod(initialRefundMethod)
      shiftChoice.reset()
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Ban className="size-4 mr-1" /> Hủy đơn
      </Button>
      <CancelDocumentDialog
        open={open}
        onOpenChange={handleOpenChange}
        title={`Hủy đơn ${order.orderNumber}`}
        description={
          <>
            <p>Hàng trong đơn được hoàn lại kho, doanh thu và công nợ của đơn được xóa.</p>
            {order.debtAmount > 0 && (
              <p>
                Phần ghi nợ {formatVndWithSuffix(order.debtAmount)} được xóa khỏi công nợ khách.
              </p>
            )}
            <p>Đơn đã trả hàng hoặc đã có phiếu thu thì không hủy được.</p>
          </>
        }
        isPending={mutation.isPending}
        confirmDisabled={shiftChoice.pending}
        onConfirm={async (input) => {
          try {
            const res = await mutation.mutateAsync({
              orderId: order.id,
              input: {
                ...input,
                ...(refundEstimate > 0 ? { refundMethod } : {}),
                ...(shiftChoice.shiftId ? { shiftId: shiftChoice.shiftId } : {}),
              },
            })
            const { cashRefundAmount, prepaymentRefundAmount } = res.data
            const parts = [
              cashRefundAmount > 0
                ? `trả lại khách ${formatVndWithSuffix(cashRefundAmount)} (${moneyMethodLabel(res.data.refundMethod)})`
                : '',
              prepaymentRefundAmount > 0
                ? `hoàn ${formatVndWithSuffix(prepaymentRefundAmount)} vào tiền trả trước`
                : '',
            ].filter(Boolean)
            toast.success(
              `Đã hủy đơn ${order.orderNumber}${parts.length ? `, ${parts.join(', ')}` : ''}`,
            )
          } catch (err) {
            // Nhiều ca đang mở: hiện ô chọn ca, giữ hộp thoại để chọn rồi xác nhận lại
            if (!shiftChoice.capture(err)) handleApiError(err)
            throw err
          }
        }}
      >
        {refundEstimate > 0 && (
          <RefundMethodFields
            label={`Trả lại khách ${formatVndWithSuffix(refundEstimate)} qua`}
            value={refundMethod}
            onChange={setRefundMethod}
            shiftChoice={shiftChoice}
            disabled={mutation.isPending}
            idPrefix="order-cancel-refund"
          />
        )}
      </CancelDocumentDialog>
    </>
  )
}

export function OrderCancelledNotice({ order }: { order: OrderDetailResponse }) {
  if (order.status !== 'cancelled' || !order.cancelledAt) return null
  return (
    <div
      role="status"
      className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
    >
      <p className="font-medium">
        Đơn đã hủy lúc {formatDateTime(order.cancelledAt)}
        {order.cancelledByName ? ` bởi ${order.cancelledByName}` : ''}
      </p>
      {order.cancelReason && <p className="mt-1">Lý do: {order.cancelReason}</p>}
    </div>
  )
}

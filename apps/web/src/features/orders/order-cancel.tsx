import { useState } from 'react'
import { Ban } from 'lucide-react'
import { toast } from 'sonner'

import { CancelDocumentDialog } from '@/components/shared/cancel-document-dialog'
import { Button } from '@/components/ui/button'
import { handleApiError } from '@/lib/api-error'
import { formatVndWithSuffix } from '@/lib/currency'
import { formatDateTime } from '@/lib/date'

import type { OrderDetailResponse } from './orders-api'
import { useCancelOrderMutation } from './use-orders'

/**
 * TIEN-107: hủy đơn bán. Chỉ đơn hoàn tất, chưa trả hàng; đơn đã có phiếu thu phải hủy phiếu thu
 * trước (máy chủ chặn và báo lý do).
 */
export function OrderCancelButton({ order }: { order: OrderDetailResponse }) {
  const [open, setOpen] = useState(false)
  const mutation = useCancelOrderMutation()
  if (order.status !== 'completed') return null

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Ban className="size-4 mr-1" /> Hủy đơn
      </Button>
      <CancelDocumentDialog
        open={open}
        onOpenChange={setOpen}
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
        onConfirm={async (input) => {
          try {
            const res = await mutation.mutateAsync({ orderId: order.id, input })
            const { cashRefundAmount, prepaymentRefundAmount } = res.data
            const parts = [
              cashRefundAmount > 0 ? `trả lại khách ${formatVndWithSuffix(cashRefundAmount)}` : '',
              prepaymentRefundAmount > 0
                ? `hoàn ${formatVndWithSuffix(prepaymentRefundAmount)} vào tiền trả trước`
                : '',
            ].filter(Boolean)
            toast.success(
              `Đã hủy đơn ${order.orderNumber}${parts.length ? `, ${parts.join(', ')}` : ''}`,
            )
          } catch (err) {
            handleApiError(err)
            throw err
          }
        }}
      />
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

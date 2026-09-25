import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'

import {
  hasPermission,
  type OrderPolicyViolation,
  type OrderReviewStatus,
} from '@kiotviet-lite/shared'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { formatDateTime } from '@/lib/date'
import { showError, showSuccess, showWarning } from '@/lib/toast'
import { useAuthStore } from '@/stores/use-auth-store'

import { useReviewOrderMutation } from './use-orders'

interface OrderReviewPanelProps {
  orderId: string
  reviewStatus: OrderReviewStatus | undefined
  violations: OrderPolicyViolation[] | null | undefined
  reviewedByName?: string | null
  reviewedAt?: string | null
  reviewNote?: string | null
}

/**
 * ADR-0009: đơn ngoại tuyến vi phạm chính sách đã được nhận (hàng đã giao) nhưng chờ chủ duyệt.
 * Người bán thấy rõ đơn đang chờ duyệt; chủ hoặc quản lý đủ quyền thì duyệt hoặc từ chối. Từ chối
 * chỉ ghi nhận, việc trả hàng hay điều chỉnh công nợ làm tiếp bằng chức năng sẵn có.
 */
export function OrderReviewPanel({
  orderId,
  reviewStatus,
  violations,
  reviewedByName,
  reviewedAt,
  reviewNote,
}: OrderReviewPanelProps) {
  const role = useAuthStore((s) => s.user?.role)
  const mutation = useReviewOrderMutation()
  const [note, setNote] = useState('')

  if (!reviewStatus || reviewStatus === 'none') return null

  const list = violations ?? []
  const required = [...new Set(list.flatMap((v) => v.requiredPermissions))]
  const canReview =
    !!role &&
    hasPermission(role, 'orders.reviewPolicy') &&
    required.every((perm) => hasPermission(role, perm))

  function submit(decision: 'approved' | 'rejected') {
    const trimmed = note.trim()
    if (decision === 'rejected' && trimmed.length === 0) {
      showError('Nhập lý do từ chối để cửa hàng xử lý tiếp')
      return
    }
    mutation.mutate(
      { orderId, input: { decision, note: trimmed.length > 0 ? trimmed : null } },
      {
        onSuccess: (res) => {
          if (decision === 'approved') {
            showSuccess('Đã duyệt đơn')
          } else {
            showWarning(`Đã từ chối đơn. Việc cần làm tiếp: ${res.data.nextSteps.join('; ')}`)
          }
          setNote('')
        },
        onError: (err) => showError(err instanceof Error ? err.message : 'Không duyệt được đơn'),
      },
    )
  }

  const pending = reviewStatus === 'pending_review'
  const tone = pending
    ? 'border-orange-300 bg-orange-50 text-orange-900'
    : reviewStatus === 'rejected'
      ? 'border-red-300 bg-red-50 text-red-900'
      : 'border-border bg-muted/40 text-foreground'

  return (
    <section className={`rounded-md border p-3 text-sm ${tone}`} data-testid="order-review-panel">
      <div className="flex items-center gap-2 font-medium">
        <ShieldAlert className="size-4 shrink-0" />
        {pending
          ? 'Đơn ngoại tuyến vi phạm chính sách, đang chờ chủ duyệt'
          : reviewStatus === 'approved'
            ? 'Đơn ngoại tuyến vi phạm chính sách đã được duyệt'
            : 'Đơn ngoại tuyến vi phạm chính sách đã bị từ chối'}
      </div>
      {list.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-6">
          {list.map((v, idx) => (
            <li key={`${v.code}-${idx}`}>{v.message}</li>
          ))}
        </ul>
      )}
      {pending && (
        <p className="mt-2 text-xs">
          Hàng đã giao nên đơn, tồn kho và công nợ đã được ghi nhận. Duyệt nếu chấp nhận; từ chối để
          ghi nhận và xử lý tiếp bằng phiếu trả hàng hoặc điều chỉnh công nợ.
        </p>
      )}
      {!pending && reviewedAt && (
        <p className="mt-2 text-xs">
          {reviewedByName ?? 'Người duyệt'} lúc {formatDateTime(reviewedAt)}
          {reviewNote ? `: ${reviewNote}` : ''}
        </p>
      )}
      {pending && canReview && (
        <div className="mt-3 space-y-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ghi chú (bắt buộc khi từ chối)"
            maxLength={500}
            rows={2}
            className="bg-background"
            aria-label="Ghi chú duyệt đơn"
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => submit('rejected')}
            >
              Từ chối
            </Button>
            <Button size="sm" disabled={mutation.isPending} onClick={() => submit('approved')}>
              Duyệt đơn
            </Button>
          </div>
        </div>
      )}
      {pending && !canReview && role && hasPermission(role, 'orders.reviewPolicy') && (
        <p className="mt-2 text-xs font-medium">Vi phạm này cần chủ cửa hàng duyệt.</p>
      )}
    </section>
  )
}

import { Link } from '@tanstack/react-router'
import { ShieldAlert } from 'lucide-react'

import { hasPermission } from '@kiotviet-lite/shared'

import { usePendingReviewCountQuery } from '@/features/orders/use-orders'
import { useAuthStore } from '@/stores/use-auth-store'

/** ADR-0009: nhắc chủ, quản lý còn đơn ngoại tuyến vi phạm chính sách đang chờ duyệt */
export function PendingReviewAlert() {
  const role = useAuthStore((s) => s.user?.role)
  const canReview = !!role && hasPermission(role, 'orders.reviewPolicy')
  const { data: count } = usePendingReviewCountQuery(canReview)
  if (!canReview || !count) return null
  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-orange-300 bg-orange-50 p-3 text-sm text-orange-900 sm:flex-row sm:items-center sm:justify-between"
      data-testid="pending-review-alert"
    >
      <div className="flex items-center gap-2">
        <ShieldAlert className="size-4 shrink-0" />
        <span>
          Có <strong>{count}</strong> đơn ngoại tuyến vi phạm chính sách (giá, chiết khấu, hạn mức
          nợ) đang chờ duyệt.
        </span>
      </div>
      <Link
        to="/orders"
        search={{ reviewStatus: 'pending_review', datePreset: 'all', page: 1 }}
        className="font-medium underline underline-offset-2"
      >
        Xem đơn chờ duyệt
      </Link>
    </div>
  )
}

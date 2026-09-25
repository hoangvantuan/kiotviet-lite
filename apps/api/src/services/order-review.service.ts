import { and, count, eq } from 'drizzle-orm'

import {
  hasPermission,
  type OrderPolicyViolation,
  type OrderReviewStatus,
  orders,
  type ReviewOrderInput,
  type UserRole,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { logAction, type RequestMeta } from './audit.service.js'

/**
 * ADR-0009: duyệt đơn ngoại tuyến vi phạm chính sách. Đơn đã bán xong và đã ghi tồn, công nợ nên
 * duyệt hay từ chối đều KHÔNG đổi số liệu của đơn. Từ chối là ghi nhận để cửa hàng xử lý tiếp
 * (lập phiếu trả hàng, điều chỉnh công nợ, nhắc nhân viên), không tự huỷ đơn.
 */

export interface ReviewActor {
  userId: string
  storeId: string
  role: UserRole
}

export interface ReviewOrderResult {
  id: string
  orderNumber: string
  reviewStatus: OrderReviewStatus
  reviewedAt: string
  reviewNote: string | null
  /** Việc cửa hàng nên làm tiếp khi từ chối */
  nextSteps: string[]
}

const REJECT_NEXT_STEPS: Record<OrderPolicyViolation['code'], string> = {
  price_unapproved: 'Lập phiếu trả hàng hoặc thu thêm tiền chênh lệch với khách nếu giá bán sai',
  below_cost_unapproved:
    'Lập phiếu trả hàng hoặc thu thêm tiền chênh lệch với khách nếu giá bán sai',
  debt_limit_exceeded: 'Thu nợ hoặc lập phiếu điều chỉnh công nợ cho khách',
  no_credit: 'Thu nợ hoặc lập phiếu điều chỉnh công nợ, cấp hạn mức nếu vẫn cho khách nợ',
}

export async function reviewOrder({
  db,
  actor,
  orderId,
  input,
  meta,
}: {
  db: Db
  actor: ReviewActor
  orderId: string
  input: ReviewOrderInput
  meta?: RequestMeta
}): Promise<ReviewOrderResult> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        userId: orders.userId,
        reviewStatus: orders.reviewStatus,
        policyViolations: orders.policyViolations,
      })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.storeId, actor.storeId)))
      .for('update')
      .limit(1)
    if (!order) {
      throw new ApiError('NOT_FOUND', 'Không tìm thấy đơn hàng')
    }
    if (order.reviewStatus !== 'pending_review') {
      throw new ApiError('CONFLICT', 'Đơn hàng không ở trạng thái chờ duyệt', {
        reviewStatus: order.reviewStatus,
      })
    }

    // Người duyệt đơn phải giữ quyền mà từng vi phạm cần: đơn dưới giá vốn chỉ chủ duyệt được
    const violations = order.policyViolations ?? []
    const required = [...new Set(violations.flatMap((v) => v.requiredPermissions))]
    const missing = required.filter((perm) => !hasPermission(actor.role, perm))
    if (missing.length > 0) {
      throw new ApiError(
        'FORBIDDEN',
        'Bạn không đủ quyền duyệt vi phạm của đơn này. Cần chủ cửa hàng duyệt',
        { missingPermissions: missing },
      )
    }

    const reviewedAt = new Date()
    const reviewStatus = input.decision
    await tx
      .update(orders)
      .set({ reviewStatus, reviewedBy: actor.userId, reviewedAt, reviewNote: input.note })
      .where(eq(orders.id, order.id))

    const nextSteps =
      reviewStatus === 'rejected'
        ? [...new Set(violations.map((v) => REJECT_NEXT_STEPS[v.code]))]
        : []

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: reviewStatus === 'approved' ? 'order.review_approved' : 'order.review_rejected',
      targetType: 'order',
      targetId: order.id,
      changes: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        sellerId: order.userId,
        violations,
        note: input.note,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      reviewStatus,
      reviewedAt: reviewedAt.toISOString(),
      reviewNote: input.note,
      nextSteps,
    }
  })
}

/** Số đơn đang chờ duyệt, cho thẻ cảnh báo trên tổng quan. */
export async function countPendingReview({
  db,
  storeId,
}: {
  db: Db
  storeId: string
}): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(orders)
    .where(and(eq(orders.storeId, storeId), eq(orders.reviewStatus, 'pending_review')))
  return Number(row?.value ?? 0)
}

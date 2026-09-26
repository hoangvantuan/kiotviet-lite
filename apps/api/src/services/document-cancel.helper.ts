import { type CancelDocumentInput, hasPermission } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import type { RequestMeta } from './audit.service.js'
import { type Approver, type PolicyActor, verifyApproval } from './order-policy.js'

/**
 * TIEN-107: ai được hủy chứng từ. Chủ và quản lý (`documents.cancel`) tự hủy. Người khác phải kèm
 * người duyệt giữ quyền đó cùng PIN của chính người duyệt (R1, ADR-0009); thiếu PIN thì 403.
 * Trả về người duyệt để ghi nhật ký, null khi người thao tác tự đủ quyền.
 */
export async function authorizeDocumentCancel({
  db,
  actor,
  input,
  meta,
}: {
  db: Db
  actor: PolicyActor
  input: CancelDocumentInput
  meta?: RequestMeta
}): Promise<Approver | null> {
  if (hasPermission(actor.role, 'documents.cancel')) return null
  if (!input.approverId || !input.approverPin) {
    throw new ApiError('FORBIDDEN', 'Hủy chứng từ cần mã PIN của chủ cửa hàng hoặc quản lý', {
      requiredPermissions: ['documents.cancel'],
    })
  }
  return verifyApproval({
    db,
    storeId: actor.storeId,
    approverUserId: input.approverId,
    pin: input.approverPin,
    permissions: ['documents.cancel'],
    requester: { userId: actor.userId, ipAddress: meta?.ipAddress ?? null },
    meta,
  })
}

/** Chứng từ đã hủy thì hủy lại là xung đột (409), không đảo bút toán lần hai */
export function alreadyCancelledError(label: string): ApiError {
  return new ApiError('CONFLICT', `${label} đã được hủy trước đó`, { reason: 'already_cancelled' })
}

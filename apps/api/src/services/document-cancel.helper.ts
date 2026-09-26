import { and, eq, inArray, isNotNull } from 'drizzle-orm'

import { type CancelDocumentInput, hasPermission, products } from '@kiotviet-lite/shared'

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

/**
 * Kết quả kiểm quyền hủy đã chạy ở route, trên kết nối gốc và NGOÀI transaction của
 * `idempotent()`: PIN sai phải ghi được số lần sai (khóa PIN) dù request bị rollback, không thì
 * dò được PIN người duyệt qua các lệnh hủy.
 */
export interface PreauthorizedCancel {
  approver: Approver | null
}

/** Người duyệt của lệnh hủy: dùng kết quả route đã kiểm, không có thì tự kiểm (gọi service trực tiếp) */
export async function resolveCancelApprover(deps: {
  db: Db
  actor: PolicyActor
  input: CancelDocumentInput
  meta?: RequestMeta
  preauthorized?: PreauthorizedCancel
}): Promise<Approver | null> {
  if (deps.preauthorized) return deps.preauthorized.approver
  return authorizeDocumentCancel(deps)
}

/**
 * Sản phẩm đã xóa mềm thì không đảo được tồn kho: báo rõ tên thay cho lỗi "không tìm thấy sản
 * phẩm". Khôi phục sản phẩm rồi hủy lại.
 */
export async function assertProductsNotDeleted(
  db: Db,
  storeId: string,
  productIds: string[],
  action: string,
) {
  const ids = [...new Set(productIds)]
  if (ids.length === 0) return
  const deleted = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(
      and(eq(products.storeId, storeId), inArray(products.id, ids), isNotNull(products.deletedAt)),
    )
  if (deleted.length > 0) {
    throw new ApiError(
      'BUSINESS_RULE_VIOLATION',
      `Không ${action} được vì sản phẩm đã bị xóa: ${deleted.map((p) => p.name).join(', ')}. Hãy khôi phục sản phẩm trước`,
      { reason: 'product_deleted', productIds: deleted.map((p) => p.id) },
    )
  }
}

/** Chứng từ đã hủy thì hủy lại là xung đột (409), không đảo bút toán lần hai */
export function alreadyCancelledError(label: string): ApiError {
  return new ApiError('CONFLICT', `${label} đã được hủy trước đó`, { reason: 'already_cancelled' })
}

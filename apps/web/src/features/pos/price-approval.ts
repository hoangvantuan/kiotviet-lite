import { type ApprovalPermissionInput, hasPermission, type UserRole } from '@kiotviet-lite/shared'

import type { TabState } from '@/stores/use-cart-store'

/**
 * POS-01: giỏ có sửa giá, chiết khấu dòng hay chiết khấu đơn mà người bán chưa đủ quyền tự làm
 * (hoặc có sửa giá mà chưa nhập PIN) thì cần một người duyệt nhập PIN trước khi gửi đơn.
 * Trả về các quyền người duyệt phải có, hoặc null khi không cần duyệt.
 * Ngoại tuyến không xác thực được PIN: đơn vẫn lưu, máy chủ gắn cờ thiếu duyệt khi đồng bộ.
 * PIN đã nhập chỉ còn khi giỏ không đổi: giỏ đổi thì store tự bỏ PIN (xem updateTab).
 * Máy chủ vẫn là nơi quyết định cuối (kể cả bán dưới giá vốn mà máy khách không biết giá vốn).
 */
export function requiredPriceApproval(
  tab: Pick<TabState, 'items' | 'orderDiscountAmount' | 'priceOverridePin'>,
  role: UserRole | undefined,
  isOffline: boolean,
): ApprovalPermissionInput[] | null {
  const hasOverride = tab.items.some((i) => i.priceOverride)
  const hasDiscount = tab.items.some((i) => i.discountAmount > 0) || tab.orderDiscountAmount > 0
  if (!hasOverride && !hasDiscount) return null
  if (isOffline || tab.priceOverridePin) return null
  const required: ApprovalPermissionInput[] = ['pos.editPrice']
  if (!hasOverride && role && required.every((p) => hasPermission(role, p))) return null
  return required
}

const PRICE_PERMISSIONS: readonly ApprovalPermissionInput[] = [
  'pos.editPrice',
  'pos.editPriceBelowCost',
]

/**
 * Đọc lỗi tạo đơn của máy chủ: nếu là lỗi thiếu duyệt giá hay chiết khấu thì trả về các quyền
 * người duyệt cần có để mở lại hộp duyệt, ngược lại null.
 */
export function priceApprovalFromError(
  code: string,
  details: unknown,
): ApprovalPermissionInput[] | null {
  const d = (details ?? {}) as { requiredPermissions?: unknown; missingPermissions?: unknown }
  const raw =
    code === 'VALIDATION_ERROR'
      ? d.requiredPermissions
      : code === 'FORBIDDEN'
        ? d.missingPermissions
        : undefined
  if (!Array.isArray(raw) || raw.length === 0) return null
  if (!raw.every((p) => PRICE_PERMISSIONS.includes(p as ApprovalPermissionInput))) return null
  // Người duyệt phải giữ đủ mọi quyền, pos.editPrice luôn nằm trong đó
  const perms = new Set<ApprovalPermissionInput>(['pos.editPrice'])
  for (const p of raw as ApprovalPermissionInput[]) perms.add(p)
  return PRICE_PERMISSIONS.filter((p) => perms.has(p))
}

import type { UserRole } from '../schema/auth.js'

export const PERMISSIONS = {
  'users.manage': ['owner'],
  'store.manage': ['owner'],
  // Kênh thông báo giữ bot token, URL webhook của cửa hàng nên chỉ chủ cửa hàng cấu hình (GL-15)
  'notifications.manage': ['owner'],
  'audit.viewAll': ['owner'],
  'audit.viewTeam': ['manager'],
  'audit.viewOwn': ['owner', 'manager', 'staff'],
  'reports.view': ['owner', 'manager'],
  'products.manage': ['owner', 'manager'],
  'pos.sell': ['owner', 'manager', 'staff'],
  'orders.view': ['owner', 'manager', 'staff'],
  'customers.view': ['owner', 'manager', 'staff'],
  'customers.manage': ['owner', 'manager'],
  // Đặt cờ "không giới hạn nợ" cho khách (ADR-0009): chỉ chủ cửa hàng.
  'customers.setUnlimitedDebt': ['owner'],
  'pricing.view': ['owner', 'manager', 'staff'],
  'pricing.manage': ['owner', 'manager'],
  'inventory.manage': ['owner', 'manager'],
  'pos.editPrice': ['owner', 'manager'],
  'pos.editPriceBelowCost': ['owner'],
  // Duyệt đơn ghi nợ vượt hạn mức (POS-04): PIN của người giữ quyền này.
  'pos.overrideDebtLimit': ['owner', 'manager'],
  // Duyệt hay từ chối đơn ngoại tuyến vi phạm chính sách (ADR-0009). Người duyệt còn phải giữ
  // quyền mà vi phạm cần, ví dụ đơn dưới giá vốn chỉ chủ duyệt được.
  'orders.reviewPolicy': ['owner', 'manager'],
  // Xem giá vốn trên mọi DTO: tìm kiếm POS, /sync/*, tạo đơn, chi tiết đơn (BC-13).
  'products.viewCost': ['owner', 'manager'],
  'orders.return': ['owner', 'manager'],
  // TIEN-107: hủy đơn bán, phiếu thu, phiếu nhập. Nhân viên cần PIN của người giữ quyền này.
  'documents.cancel': ['owner', 'manager'],
} as const satisfies Record<string, ReadonlyArray<UserRole>>

export type Permission = keyof typeof PERMISSIONS

export function hasPermission(role: UserRole, perm: Permission): boolean {
  return (PERMISSIONS[perm] as ReadonlyArray<UserRole>).includes(role)
}

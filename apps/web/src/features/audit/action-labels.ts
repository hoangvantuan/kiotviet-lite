import type { AuditAction } from '@kiotviet-lite/shared'

export const ACTION_LABELS: Record<AuditAction, string> = {
  'user.created': 'Tạo nhân viên',
  'user.updated': 'Sửa nhân viên',
  'user.locked': 'Khoá nhân viên',
  'user.unlocked': 'Mở khoá nhân viên',
  'user.pin_reset': 'Đặt lại mã PIN',
  'store.updated': 'Cập nhật cửa hàng',
  'auth.pin_failed': 'Nhập sai PIN',
  'auth.pin_locked': 'PIN bị khoá tạm thời',
  'category.created': 'Tạo danh mục',
  'category.updated': 'Sửa danh mục',
  'category.deleted': 'Xoá danh mục',
  'category.reordered': 'Sắp xếp danh mục',
  'product.created': 'Tạo sản phẩm',
  'product.updated': 'Sửa sản phẩm',
  'product.deleted': 'Xoá sản phẩm',
  'product.restored': 'Khôi phục sản phẩm',
  'product.stock_initialized': 'Khởi tạo tồn kho',
  'product.variant_created': 'Tạo biến thể',
  'product.variant_updated': 'Sửa biến thể',
  'product.variant_deleted': 'Xoá biến thể',
  'product.variants_enabled': 'Bật biến thể sản phẩm',
  'product.variants_disabled': 'Tắt biến thể sản phẩm',
  'product.unit_conversion_created': 'Tạo đơn vị quy đổi',
  'product.unit_conversion_updated': 'Sửa đơn vị quy đổi',
  'product.unit_conversion_deleted': 'Xoá đơn vị quy đổi',
  'inventory.purchase_recorded': 'Ghi nhận nhập hàng',
  'inventory.manual_adjusted': 'Điều chỉnh tồn kho thủ công',
  'customer.created': 'Tạo khách hàng',
  'customer.updated': 'Sửa khách hàng',
  'customer.deleted': 'Xoá khách hàng',
  'customer.restored': 'Khôi phục khách hàng',
  'customer_group.created': 'Tạo nhóm khách hàng',
  'customer_group.updated': 'Sửa nhóm khách hàng',
  'customer_group.deleted': 'Xoá nhóm khách hàng',
}

export interface ActionGroup {
  label: string
  actions: AuditAction[]
}

export const ACTION_GROUPS: ActionGroup[] = [
  {
    label: 'Nhân viên',
    actions: ['user.created', 'user.updated', 'user.locked', 'user.unlocked', 'user.pin_reset'],
  },
  {
    label: 'Cửa hàng',
    actions: ['store.updated'],
  },
  {
    label: 'Xác thực',
    actions: ['auth.pin_failed', 'auth.pin_locked'],
  },
  {
    label: 'Danh mục',
    actions: ['category.created', 'category.updated', 'category.deleted', 'category.reordered'],
  },
  {
    label: 'Sản phẩm',
    actions: [
      'product.created',
      'product.updated',
      'product.deleted',
      'product.restored',
      'product.stock_initialized',
      'product.variant_created',
      'product.variant_updated',
      'product.variant_deleted',
      'product.variants_enabled',
      'product.variants_disabled',
      'product.unit_conversion_created',
      'product.unit_conversion_updated',
      'product.unit_conversion_deleted',
    ],
  },
  {
    label: 'Tồn kho',
    actions: ['inventory.purchase_recorded', 'inventory.manual_adjusted'],
  },
  {
    label: 'Khách hàng',
    actions: ['customer.created', 'customer.updated', 'customer.deleted', 'customer.restored'],
  },
  {
    label: 'Nhóm khách hàng',
    actions: ['customer_group.created', 'customer_group.updated', 'customer_group.deleted'],
  },
]

export function getActionLabel(action: string): string {
  return (ACTION_LABELS as Record<string, string>)[action] ?? action
}

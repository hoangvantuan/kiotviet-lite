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
    ],
  },
]

export function getActionLabel(action: string): string {
  return (ACTION_LABELS as Record<string, string>)[action] ?? action
}

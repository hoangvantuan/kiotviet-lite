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
  'price_list.created': 'Tạo bảng giá',
  'price_list.updated': 'Sửa bảng giá',
  'price_list.deleted': 'Xoá bảng giá',
  'price_list.restored': 'Khôi phục bảng giá',
  'price_list.recalculated': 'Tính lại bảng giá',
  'price_list.cloned': 'Nhân bản bảng giá',
  'price_list.imported': 'Nhập danh sách giá',
  'price_list_item.created': 'Tạo dòng bảng giá',
  'price_list_item.updated': 'Sửa dòng bảng giá',
  'price_list_item.deleted': 'Xoá dòng bảng giá',
  'customer_price.created': 'Tạo giá riêng KH',
  'customer_price.updated': 'Sửa giá riêng KH',
  'customer_price.deleted': 'Xoá giá riêng KH',
  'volume_prices.replaced': 'Cập nhật giá theo số lượng',
  'supplier.created': 'Tạo nhà cung cấp',
  'supplier.updated': 'Sửa nhà cung cấp',
  'supplier.deleted': 'Xoá nhà cung cấp',
  'supplier.restored': 'Khôi phục nhà cung cấp',
  'supplier.debt_changed': 'Cập nhật công nợ NCC',
  'supplier_payment.created': 'Tạo phiếu chi trả NCC',
  'purchase_order.created': 'Tạo phiếu nhập kho',
  'stock_check.created': 'Tạo phiếu kiểm kho',
  'stock_check.updated': 'Sửa phiếu kiểm kho',
  'stock_check.confirmed': 'Xác nhận phiếu kiểm kho',
  'stock_check.deleted': 'Xoá phiếu kiểm kho',
  'order.created': 'Tạo đơn hàng',
  'category_discount.created': 'Tạo chiết khấu danh mục',
  'category_discount.updated': 'Sửa chiết khấu danh mục',
  'category_discount.deleted': 'Xoá chiết khấu danh mục',
  'order_item.price_overridden': 'Sửa giá trên đơn hàng',
  'debt.created': 'Tạo khoản nợ',
  'debt.limit_overridden': 'Vượt hạn mức công nợ (PIN)',
  'receipt.created': 'Tạo phiếu thu nợ KH',
  'receipt.printed': 'In phiếu thu',
  'debt_adjustment.created': 'Điều chỉnh nợ khách hàng',
  'order.returned': 'Trả hàng',
  'print_settings.updated': 'Cập nhật mẫu in',
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
  {
    label: 'Bảng giá',
    actions: [
      'price_list.created',
      'price_list.updated',
      'price_list.deleted',
      'price_list.restored',
      'price_list.recalculated',
      'price_list.cloned',
      'price_list.imported',
    ],
  },
  {
    label: 'Mục bảng giá',
    actions: ['price_list_item.created', 'price_list_item.updated', 'price_list_item.deleted'],
  },
  {
    label: 'Giá riêng KH',
    actions: ['customer_price.created', 'customer_price.updated', 'customer_price.deleted'],
  },
  {
    label: 'Giá theo số lượng',
    actions: ['volume_prices.replaced'],
  },
  {
    label: 'Nhập hàng',
    actions: [
      'supplier.created',
      'supplier.updated',
      'supplier.deleted',
      'supplier.restored',
      'supplier.debt_changed',
      'supplier_payment.created',
      'purchase_order.created',
    ],
  },
  {
    label: 'Kiểm kho',
    actions: [
      'stock_check.created',
      'stock_check.updated',
      'stock_check.confirmed',
      'stock_check.deleted',
    ],
  },
  {
    label: 'Đơn hàng',
    actions: ['order.created', 'order.returned'],
  },
  {
    label: 'Chiết khấu danh mục',
    actions: [
      'category_discount.created',
      'category_discount.updated',
      'category_discount.deleted',
    ],
  },
  {
    label: 'Sửa giá POS',
    actions: ['order_item.price_overridden'],
  },
  {
    label: 'Công nợ',
    actions: ['debt.created', 'debt.limit_overridden', 'debt_adjustment.created'],
  },
  {
    label: 'Phiếu thu',
    actions: ['receipt.created', 'receipt.printed'],
  },
]

export function getActionLabel(action: string): string {
  return (ACTION_LABELS as Record<string, string>)[action] ?? action
}

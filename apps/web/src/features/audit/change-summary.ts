import { formatVndWithSuffix } from '@kiotviet-lite/shared'

import { formatDateTime } from '@/lib/date'

/** Nhãn tiếng Việt cho các khóa hay gặp trong `changes` của nhật ký hoạt động (UX-22). */
const FIELD_LABELS: Record<string, string> = {
  name: 'Tên',
  code: 'Mã',
  sku: 'Mã hàng',
  barcode: 'Mã vạch',
  phone: 'Số điện thoại',
  email: 'Email',
  role: 'Vai trò',
  note: 'Ghi chú',
  reason: 'Lý do',
  description: 'Mô tả',
  status: 'Trạng thái',
  newStatus: 'Trạng thái mới',
  isActive: 'Đang hoạt động',
  softDelete: 'Đã xoá',
  customerName: 'Khách hàng',
  supplierName: 'Nhà cung cấp',
  priceListName: 'Bảng giá',
  orderNumber: 'Mã đơn hàng',
  returnNumber: 'Mã phiếu trả',
  purchaseOrderCode: 'Mã phiếu nhập',
  itemCount: 'Số dòng',
  totalItems: 'Số sản phẩm',
  variantCount: 'Số biến thể',
  quantity: 'Số lượng',
  initialStock: 'Tồn kho ban đầu',
  stockBefore: 'Tồn kho trước',
  stockAfter: 'Tồn kho sau',
  currentStock: 'Tồn kho',
  stockQuantity: 'Tồn kho',
  delta: 'Chênh lệch',
  totalDiffPositive: 'Tổng chênh lệch tăng',
  totalDiffNegative: 'Tổng chênh lệch giảm',
  totalAdjusted: 'Tổng điều chỉnh',
  unit: 'Đơn vị tính',
  conversionFactor: 'Hệ số quy đổi',
  minQty: 'Số lượng tối thiểu',
  discountType: 'Loại chiết khấu',
  paymentStatus: 'Trạng thái thanh toán',
  paymentMethod: 'Hình thức thanh toán',
  source: 'Nguồn',
  method: 'Cách tạo',
  mode: 'Chế độ',
  effectiveFrom: 'Hiệu lực từ',
  effectiveTo: 'Hiệu lực đến',
  incurredAt: 'Ngày phát sinh',
  lockedUntil: 'Khoá đến',
  attempt: 'Lần thử',
  totalRows: 'Tổng số dòng',
  imported: 'Đã nhập',
  skipped: 'Bỏ qua',
  updatedCount: 'Đã cập nhật',
  addedCount: 'Đã thêm',
  removedCount: 'Đã xoá',
}

/** Các khóa là số tiền VND, hiển thị kèm đơn vị. */
const MONEY_FIELDS = new Set([
  'amount',
  'price',
  'sellingPrice',
  'costPrice',
  'costBefore',
  'costAfter',
  'unitCost',
  'unitPrice',
  'originalPrice',
  'debtBefore',
  'debtAfter',
  'debtLimit',
  'debtAmount',
  'oldAmount',
  'newAmount',
  'subtotal',
  'total',
  'totalAmount',
  'discountAmount',
  'discountTotal',
  'paidAmount',
  'refundAmount',
  'debtReductionAmount',
  'exceededAmount',
])

const MONEY_LABELS: Record<string, string> = {
  amount: 'Số tiền',
  price: 'Giá',
  sellingPrice: 'Giá bán',
  costPrice: 'Giá vốn',
  costBefore: 'Giá vốn trước',
  costAfter: 'Giá vốn sau',
  unitCost: 'Đơn giá vốn',
  unitPrice: 'Đơn giá',
  originalPrice: 'Giá gốc',
  debtBefore: 'Công nợ trước',
  debtAfter: 'Công nợ sau',
  debtLimit: 'Hạn mức nợ',
  debtAmount: 'Số nợ',
  oldAmount: 'Số cũ',
  newAmount: 'Số mới',
  subtotal: 'Tổng tiền hàng',
  total: 'Tổng cộng',
  totalAmount: 'Tổng tiền',
  discountAmount: 'Chiết khấu',
  discountTotal: 'Chiết khấu phiếu',
  paidAmount: 'Đã trả',
  refundAmount: 'Tiền hoàn',
  debtReductionAmount: 'Giảm công nợ',
  exceededAmount: 'Vượt hạn mức',
}

const MAX_ENTRIES = 3

function formatScalar(key: string, value: unknown): string | null {
  if (value === null || value === undefined) return '(trống)'
  if (typeof value === 'boolean') return value ? 'Có' : 'Không'
  if (typeof value === 'number') {
    return MONEY_FIELDS.has(key) ? formatVndWithSuffix(value) : value.toLocaleString('vi-VN')
  }
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDateTime(value)
    return value.length > 40 ? `${value.slice(0, 40)}…` : value
  }
  if (Array.isArray(value)) return `${value.length} mục`
  return null
}

function formatValue(key: string, value: unknown): string | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const v = value as Record<string, unknown>
    const before = 'before' in v ? v.before : 'from' in v ? v.from : undefined
    const after = 'after' in v ? v.after : 'to' in v ? v.to : undefined
    if (before === undefined && after === undefined) return null
    return `${formatScalar(key, before) ?? '…'} → ${formatScalar(key, after) ?? '…'}`
  }
  return formatScalar(key, value)
}

/**
 * Tóm tắt `changes` thành chuỗi tiếng Việt có giá trị, ví dụ
 * "Mã: PK-001, Số dòng: 3, Tổng chênh lệch giảm: 2, +1".
 * Bỏ qua khóa kỹ thuật (id) và khóa chưa có nhãn; chi tiết đầy đủ nằm ở bảng chi tiết.
 */
export function summariseChanges(changes: unknown): string {
  if (!changes) return ''
  if (typeof changes !== 'object') return String(changes)
  const entries: string[] = []
  for (const [key, value] of Object.entries(changes as Record<string, unknown>)) {
    const label = FIELD_LABELS[key] ?? MONEY_LABELS[key]
    if (!label) continue
    const formatted = formatValue(key, value)
    if (formatted === null) continue
    entries.push(`${label}: ${formatted}`)
  }
  if (entries.length === 0) return ''
  const shown = entries.slice(0, MAX_ENTRIES).join(', ')
  return entries.length > MAX_ENTRIES ? `${shown}, +${entries.length - MAX_ENTRIES}` : shown
}

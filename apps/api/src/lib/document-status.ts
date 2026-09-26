/**
 * TIEN-107: chứng từ hủy không bị xóa mà đổi trạng thái sang 'cancelled'. Mọi phép cộng dồn tiền,
 * tồn, công nợ (báo cáo, sổ quỹ, đối soát) phải chỉ tính chứng từ còn hiệu lực. Dùng các helper
 * này thay cho lọc cứng rải rác, để một trạng thái mới chỉ phải sửa ở đây.
 *
 * Đơn bán dùng `revenueStatusFilter()` trong `order-status.ts` (đã loại 'cancelled').
 */
import { eq, type SQL } from 'drizzle-orm'

import { purchaseOrders, receipts, supplierPayments } from '@kiotviet-lite/shared'

export const ACTIVE_DOCUMENT_STATUS = 'active' as const
export const CANCELLED_DOCUMENT_STATUS = 'cancelled' as const

/** Phiếu thu còn hiệu lực */
export function activeReceiptFilter(): SQL {
  return eq(receipts.status, ACTIVE_DOCUMENT_STATUS)
}

/** Phiếu chi NCC còn hiệu lực */
export function activeSupplierPaymentFilter(): SQL {
  return eq(supplierPayments.status, ACTIVE_DOCUMENT_STATUS)
}

/** Phiếu nhập còn hiệu lực */
export function activePurchaseOrderFilter(): SQL {
  return eq(purchaseOrders.status, ACTIVE_DOCUMENT_STATUS)
}

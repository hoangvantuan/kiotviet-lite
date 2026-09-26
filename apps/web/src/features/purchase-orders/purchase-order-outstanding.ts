import type { PurchaseOrderDetail } from '@kiotviet-lite/shared'

/** Số còn phải trả NCC của phiếu: giá trị sau trả hàng trừ phần đã trả ròng */
export function purchaseOrderOutstanding(order: PurchaseOrderDetail): number {
  return Math.max(0, order.totalAmount - order.returnedAmount - order.paidAmount)
}

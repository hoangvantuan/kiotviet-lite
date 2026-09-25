import { computeReturnLineRefund, splitReturnRefund } from '@kiotviet-lite/shared'

import type { ReturnableItem } from './orders-api'

export interface ReturnPreview {
  totalAmount: number
  debtReductionAmount: number
  prepaymentRefundAmount: number
  refundAmount: number
}

/**
 * TIEN-108: xem trước tiền hoàn của phiếu trả bằng đúng hàm máy chủ dùng (ADR-0010), nên số
 * hiện trên hộp thoại khớp số máy chủ ghi. `outstandingOrderDebt` là nợ còn lại của đơn,
 * `orderPrepaymentApplied` là tiền trả trước đã cấn vào đơn (ADR-0011).
 */
export function previewReturn(
  items: ReturnableItem[],
  quantities: ReadonlyMap<string, number>,
  outstandingOrderDebt: number,
  orderPrepaymentApplied = 0,
): ReturnPreview {
  const totalAmount = items.reduce((sum, item) => {
    const quantity = quantities.get(item.orderItemId) ?? 0
    if (quantity <= 0) return sum
    return (
      sum +
      computeReturnLineRefund(
        {
          quantity: item.purchasedQuantity,
          lineTotal: item.lineTotal,
          orderDiscountAllocated: item.orderDiscountAllocated,
        },
        item.returnedQuantity,
        quantity,
      )
    )
  }, 0)
  return {
    totalAmount,
    ...splitReturnRefund(totalAmount, outstandingOrderDebt, orderPrepaymentApplied),
  }
}

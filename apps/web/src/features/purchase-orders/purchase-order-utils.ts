import type { DiscountType } from '@kiotviet-lite/shared'

export interface LineTotalResult {
  lineSubtotal: number
  discountAmount: number
  lineTotal: number
}

export function computeLineTotal(
  quantity: number,
  unitPrice: number,
  discountType: DiscountType,
  discountValue: number,
): LineTotalResult {
  const lineSubtotal = Math.max(0, quantity * unitPrice)
  let discountAmount = 0
  if (discountValue > 0) {
    if (discountType === 'percent') {
      const cappedValue = Math.min(discountValue, 10000)
      discountAmount = Math.floor((lineSubtotal * cappedValue) / 10000)
    } else {
      discountAmount = Math.min(discountValue, lineSubtotal)
    }
  }
  const lineTotal = lineSubtotal - discountAmount
  return { lineSubtotal, discountAmount, lineTotal }
}

export function computeOrderTotals(args: {
  subtotal: number
  discountTotalType: DiscountType
  discountTotalValue: number
}) {
  const { subtotal, discountTotalType, discountTotalValue } = args
  let discountTotal = 0
  if (discountTotalValue > 0) {
    if (discountTotalType === 'percent') {
      const cappedValue = Math.min(discountTotalValue, 10000)
      discountTotal = Math.floor((subtotal * cappedValue) / 10000)
    } else {
      discountTotal = Math.min(discountTotalValue, subtotal)
    }
  }
  const totalAmount = subtotal - discountTotal
  return { discountTotal, totalAmount }
}

import type { DiscountType } from '../schema/purchase-order-management.js'

export type { DiscountType }

export interface LineDiscountInput {
  unitPrice: number
  quantity: number
  discountType?: DiscountType | null
  discountValue?: number | null
}

export interface LineCalculationResult {
  gross: number
  discountAmount: number
  lineTotal: number
}

/**
 * Tính số tiền chiết khấu của một dòng sản phẩm.
 * - %: Làm tròn số nguyên VND, giới hạn 0-100%, không vượt quá tổng tiền dòng (gross).
 * - Tiền: Không vượt quá tổng tiền dòng (gross).
 * - Sản phẩm giá 0đ hoặc số lượng <= 0: Trả về 0 (không lỗi chia 0).
 */
export function calculateLineDiscount(input: LineDiscountInput): number {
  const unitPrice = Math.max(0, input.unitPrice || 0)
  const quantity = Math.max(0, input.quantity || 0)
  const gross = unitPrice * quantity
  if (gross <= 0 || !input.discountType || !input.discountValue || input.discountValue <= 0) {
    return 0
  }

  if (input.discountType === 'percent') {
    const clampedPct = Math.min(100, Math.max(0, input.discountValue))
    return Math.min(Math.round((gross * clampedPct) / 100), gross)
  }

  return Math.min(Math.round(input.discountValue), gross)
}

/**
 * Tính toán thành tiền của một dòng sản phẩm.
 */
export function calculateLineTotal(input: LineDiscountInput): LineCalculationResult {
  const unitPrice = Math.max(0, input.unitPrice || 0)
  const quantity = Math.max(0, input.quantity || 0)
  const gross = unitPrice * quantity
  const discountAmount = calculateLineDiscount(input)
  const lineTotal = Math.max(0, gross - discountAmount)
  return { gross, discountAmount, lineTotal }
}

export interface OrderDiscountInput {
  subtotal: number
  discountType?: DiscountType | null
  discountValue?: number | null
}

/**
 * Tính số tiền chiết khấu của toàn bộ đơn hàng dựa trên tổng tạm tính (subtotal).
 */
export function calculateOrderDiscount(input: OrderDiscountInput): number {
  const subtotal = Math.max(0, input.subtotal || 0)
  if (subtotal <= 0 || !input.discountType || !input.discountValue || input.discountValue <= 0) {
    return 0
  }

  if (input.discountType === 'percent') {
    const clampedPct = Math.min(100, Math.max(0, input.discountValue))
    return Math.min(Math.round((subtotal * clampedPct) / 100), subtotal)
  }

  return Math.min(Math.round(input.discountValue), subtotal)
}

export interface OrderTotalsInputItem {
  unitPrice: number
  quantity: number
  discountType?: DiscountType | null
  discountValue?: number | null
}

export interface OrderTotalsInput {
  items: OrderTotalsInputItem[]
  orderDiscountType?: DiscountType | null
  orderDiscountValue?: number | null
}

export interface CalculatedOrderTotals {
  items: Array<{
    unitPrice: number
    quantity: number
    gross: number
    discountAmount: number
    lineTotal: number
  }>
  subtotal: number
  orderDiscountAmount: number
  total: number
}

/**
 * Tính toàn bộ các thông số tài chính của đơn hàng:
 * Từng dòng (gross, discountAmount, lineTotal) -> subtotal -> orderDiscountAmount -> total.
 */
export function calculateOrderTotals(input: OrderTotalsInput): CalculatedOrderTotals {
  let subtotal = 0
  const items = (input.items || []).map((it) => {
    const lineRes = calculateLineTotal(it)
    subtotal += lineRes.lineTotal
    return {
      unitPrice: it.unitPrice,
      quantity: it.quantity,
      gross: lineRes.gross,
      discountAmount: lineRes.discountAmount,
      lineTotal: lineRes.lineTotal,
    }
  })

  const orderDiscountAmount = calculateOrderDiscount({
    subtotal,
    discountType: input.orderDiscountType,
    discountValue: input.orderDiscountValue,
  })

  const total = Math.max(0, subtotal - orderDiscountAmount)

  return {
    items,
    subtotal,
    orderDiscountAmount,
    total,
  }
}

/**
 * Phân bổ chiết khấu đơn hoặc số tiền hoàn về từng dòng theo tỷ lệ thành tiền dòng.
 * Áp dụng tiền lệ làm tròn dồn phần dư vào dòng cuối cùng (Remainder Allocation)
 * để đảm bảo tổng số tiền phân bổ khớp 100% với orderDiscountAmount, không lệch dù 1 đồng.
 */
export function allocateOrderDiscount(
  items: Array<{ lineTotal: number }>,
  subtotal: number,
  orderDiscountAmount: number,
): number[] {
  if (!items || items.length === 0 || subtotal <= 0 || orderDiscountAmount <= 0) {
    return (items || []).map(() => 0)
  }

  let allocatedSum = 0
  const results: number[] = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (!item) continue
    if (i === items.length - 1) {
      // Dòng cuối cùng nhận toàn bộ phần dư còn lại
      results.push(Math.max(0, orderDiscountAmount - allocatedSum))
    } else {
      const portion = Math.floor((item.lineTotal / subtotal) * orderDiscountAmount)
      allocatedSum += portion
      results.push(portion)
    }
  }

  return results
}

export interface UnitConversionPriceInput {
  basePrice: number
  conversionFactor: number
  customSellingPrice?: number | null
}

/**
 * Tính đơn giá theo đơn vị quy đổi:
 * - Nếu có giá bán riêng (customSellingPrice > 0): ưu tiên dùng giá bán riêng.
 * - Ngược lại: basePrice * conversionFactor (làm tròn số nguyên VND).
 */
export function calculateUnitConversionPrice(input: UnitConversionPriceInput): number {
  if (input.customSellingPrice != null && Number(input.customSellingPrice) > 0) {
    return Number(input.customSellingPrice)
  }
  const basePrice = Math.max(0, Number(input.basePrice) || 0)
  const factor = Math.max(0, Number(input.conversionFactor) || 0)
  return Math.max(0, Math.round(basePrice * factor))
}

export interface RecomputeOrderValidationInput {
  clientSubtotal: number
  clientDiscountAmount: number
  clientTotal: number
  recomputedTotals: CalculatedOrderTotals
}

/**
 * Kiểm tra tính hợp lệ giữa số liệu máy khách gửi lên và số liệu máy chủ tự tính lại.
 * Trả về true nếu khớp hoàn toàn (hoặc nằm trong dung sai cho phép 0đ).
 */
export function validateOrderTotalsMatch(
  client: { subtotal: number; discountAmount: number; total: number },
  recomputed: { subtotal: number; orderDiscountAmount: number; total: number },
): { isValid: boolean; reason?: string } {
  if (client.subtotal !== recomputed.subtotal) {
    return {
      isValid: false,
      reason: `Tổng tạm tính không khớp (máy khách: ${client.subtotal}, máy chủ: ${recomputed.subtotal})`,
    }
  }
  if (client.discountAmount !== recomputed.orderDiscountAmount) {
    return {
      isValid: false,
      reason: `Tiền giảm giá đơn không khớp (máy khách: ${client.discountAmount}, máy chủ: ${recomputed.orderDiscountAmount})`,
    }
  }
  if (client.total !== recomputed.total) {
    return {
      isValid: false,
      reason: `Tổng tiền thanh toán không khớp (máy khách: ${client.total}, máy chủ: ${recomputed.total})`,
    }
  }
  return { isValid: true }
}

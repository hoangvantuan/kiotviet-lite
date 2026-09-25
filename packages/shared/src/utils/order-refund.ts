/**
 * Quy tắc tiền của chứng từ bán (ADR-0010): phân bổ chiết khấu cấp đơn xuống từng dòng lúc bán,
 * và tính tiền hoàn khi trả hàng. Máy chủ và hộp trả hàng ở web dùng chung các hàm này để số
 * xem trước khớp số máy chủ ghi.
 */

/**
 * Chia chiết khấu cấp đơn cho các dòng theo tỷ lệ thành tiền dòng (đã trừ chiết khấu dòng).
 * Mỗi dòng nhận phần làm tròn xuống; phần dư làm tròn dồn vào dòng có thành tiền lớn nhất (dòng
 * đầu tiên nếu bằng nhau), dòng đầy thì sang dòng lớn kế, để tổng khớp đúng chiết khấu đơn và không
 * dòng nào nhận quá thành tiền của nó.
 * Chiết khấu vượt tổng thành tiền được chặn ở tổng thành tiền.
 */
export function allocateOrderDiscount(lineTotals: number[], orderDiscount: number): number[] {
  const base = lineTotals.reduce((sum, v) => sum + Math.max(0, v), 0)
  const discount = Math.min(Math.max(0, orderDiscount), base)
  if (discount === 0 || base === 0) return lineTotals.map(() => 0)

  // Tích thành tiền × chiết khấu có thể vượt 2^53: chia nguyên bằng BigInt để khớp SQL từng đồng
  const shares = lineTotals.map((v) =>
    Number((BigInt(Math.max(0, v)) * BigInt(discount)) / BigInt(base)),
  )
  // Phần dư dồn vào dòng lớn nhất, nhưng mỗi dòng không nhận quá thành tiền của nó: dòng đã đầy
  // thì dồn tiếp sang dòng lớn kế. Tổng sức chứa còn lại luôn đủ vì chiết khấu <= tổng thành tiền.
  let rest = discount - shares.reduce((sum, v) => sum + v, 0)
  const bySize = lineTotals
    .map((v, i) => i)
    .sort((a, b) => lineTotals[b]! - lineTotals[a]! || a - b)
  for (const i of bySize) {
    if (rest <= 0) break
    const extra = Math.min(rest, Math.max(0, lineTotals[i]!) - shares[i]!)
    shares[i] = shares[i]! + extra
    rest -= extra
  }
  return shares
}

/** Ảnh chụp một dòng đơn đủ để tính tiền hoàn */
export interface RefundableLine {
  /** Số lượng đã mua (theo đơn vị bán) */
  quantity: number
  /** Thành tiền dòng sau chiết khấu dòng, trước chiết khấu đơn */
  lineTotal: number
  /** Phần chiết khấu cấp đơn đã phân bổ cho dòng lúc bán */
  orderDiscountAllocated: number
}

/**
 * Giá trị ròng (sau chiết khấu dòng và chiết khấu đơn) của `returnedQuantity` đơn vị đầu tiên
 * của dòng. Trả hết dòng thì đúng bằng giá trị ròng của cả dòng, không còn phần dư làm tròn.
 */
export function netValueOfQuantity(line: RefundableLine, returnedQuantity: number): number {
  const net = Math.max(0, line.lineTotal - line.orderDiscountAllocated)
  if (line.quantity <= 0 || returnedQuantity <= 0) return 0
  if (returnedQuantity >= line.quantity) return net
  return Math.round((net * returnedQuantity) / line.quantity)
}

/**
 * TIEN-101: tiền hoàn của một dòng trong phiếu trả = giá trị ròng lũy kế sau phiếu này trừ giá
 * trị ròng lũy kế trước phiếu này. Tỷ lệ chiết khấu đơn áp đúng một lần, nên trả N lần cộng lại
 * bằng trả một lần.
 */
export function computeReturnLineRefund(
  line: RefundableLine,
  alreadyReturnedQuantity: number,
  quantity: number,
): number {
  return (
    netValueOfQuantity(line, alreadyReturnedQuantity + quantity) -
    netValueOfQuantity(line, alreadyReturnedQuantity)
  )
}

/**
 * Tách tiền hoàn của phiếu trả: phần cấn vào khoản nợ còn lại của đơn trước, phần dư hoàn tiền
 * cho khách.
 */
export function splitReturnRefund(
  totalAmount: number,
  outstandingOrderDebt: number,
): { debtReductionAmount: number; refundAmount: number } {
  const debtReductionAmount = Math.min(totalAmount, Math.max(0, outstandingOrderDebt))
  return { debtReductionAmount, refundAmount: totalAmount - debtReductionAmount }
}

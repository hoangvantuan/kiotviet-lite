import { describe, expect, it } from 'vitest'

import {
  allocateOrderDiscount,
  computeReturnLineRefund,
  netValueOfQuantity,
  splitReturnRefund,
} from './order-refund.js'

describe('allocateOrderDiscount', () => {
  it('chia theo tỷ lệ thành tiền dòng, tổng khớp đúng chiết khấu đơn', () => {
    const shares = allocateOrderDiscount([100_000, 50_000, 50_001], 10_001)
    expect(shares.reduce((a, b) => a + b, 0)).toBe(10_001)
    // 5000,57..., 2500,26..., 2500,27...: làm tròn xuống 5000 + 2500 + 2500, dư 1 vào dòng lớn nhất
    expect(shares).toEqual([5_001, 2_500, 2_500])
  })

  it('dòng bằng nhau: phần dư vào dòng đầu, một dòng nhận trọn', () => {
    expect(allocateOrderDiscount([100_000, 100_000, 100_000], 10_000)).toEqual([
      3_334, 3_333, 3_333,
    ])
    expect(allocateOrderDiscount([100_000], 15_000)).toEqual([15_000])
    expect(allocateOrderDiscount([], 0)).toEqual([])
  })

  it('không chiết khấu hoặc đơn 0 đồng: toàn 0', () => {
    expect(allocateOrderDiscount([10, 20], 0)).toEqual([0, 0])
    expect(allocateOrderDiscount([0, 0], 5)).toEqual([0, 0])
  })

  it('phần dư không đẩy dòng vượt thành tiền, dồn sang dòng lớn kế', () => {
    expect(allocateOrderDiscount([10_000, 10_000, 10_000], 29_999)).toEqual([10_000, 10_000, 9_999])
    expect(allocateOrderDiscount([10_000, 10_000, 10_000], 30_000)).toEqual([
      10_000, 10_000, 10_000,
    ])
    // Dòng lớn nhất đã đầy sau làm tròn xuống: phần dư sang dòng kế
    expect(allocateOrderDiscount([3, 2, 2], 6)).toEqual([3, 2, 1])
  })

  it('dòng 0 đồng không nhận phần dư, chiết khấu vượt tổng bị chặn', () => {
    expect(allocateOrderDiscount([0, 3], 10)).toEqual([0, 3])
  })
})

describe('computeReturnLineRefund (TIEN-101)', () => {
  it('135.000, chiết khấu đơn 20%, trả 3 lần bằng trả một lần: 108.000', () => {
    const line = { quantity: 3, lineTotal: 135_000, orderDiscountAllocated: 27_000 }
    const parts = [
      computeReturnLineRefund(line, 0, 1),
      computeReturnLineRefund(line, 1, 1),
      computeReturnLineRefund(line, 2, 1),
    ]
    expect(parts.reduce((a, b) => a + b, 0)).toBe(108_000)
    expect(computeReturnLineRefund(line, 0, 3)).toBe(108_000)
  })

  it('2.000.000, chiết khấu đơn 50%: trả hai nửa cộng lại 1.000.000', () => {
    const line = { quantity: 2, lineTotal: 2_000_000, orderDiscountAllocated: 1_000_000 }
    expect(computeReturnLineRefund(line, 0, 1)).toBe(500_000)
    expect(computeReturnLineRefund(line, 1, 1)).toBe(500_000)
  })

  it('số lẻ làm tròn: cộng các phiếu luôn bằng giá trị ròng cả dòng', () => {
    const line = { quantity: 7, lineTotal: 100_000, orderDiscountAllocated: 3_333 }
    let sum = 0
    for (let i = 0; i < 7; i++) sum += computeReturnLineRefund(line, i, 1)
    expect(sum).toBe(96_667)
    expect(netValueOfQuantity(line, 7)).toBe(96_667)
  })
})

describe('splitReturnRefund', () => {
  it('cấn nợ còn lại của đơn trước, dư mới hoàn tiền', () => {
    expect(splitReturnRefund(100_000, 30_000)).toEqual({
      debtReductionAmount: 30_000,
      prepaymentRefundAmount: 0,
      refundAmount: 70_000,
    })
    expect(splitReturnRefund(100_000, 0)).toEqual({
      debtReductionAmount: 0,
      prepaymentRefundAmount: 0,
      refundAmount: 100_000,
    })
  })

  it('phần đơn đã cấn bằng tiền trả trước hoàn vào trả trước, không hoàn tiền mặt (ADR-0011)', () => {
    // Trả trước 500k, mua nợ 300k được cấn hết: trả hàng 300k hoàn cả vào trả trước
    expect(splitReturnRefund(300_000, 0, 300_000)).toEqual({
      debtReductionAmount: 0,
      prepaymentRefundAmount: 300_000,
      refundAmount: 0,
    })
    // Đơn 500k: 100k tiền mặt, 250k cấn trả trước, còn nợ 150k. Trả hàng 450k
    expect(splitReturnRefund(450_000, 150_000, 250_000)).toEqual({
      debtReductionAmount: 150_000,
      prepaymentRefundAmount: 250_000,
      refundAmount: 50_000,
    })
  })
})

import { describe, expect, it } from 'vitest'

import {
  allocateOrderDiscount,
  calculateLineDiscount,
  calculateLineTotal,
  calculateOrderDiscount,
  calculateOrderTotals,
  calculateUnitConversionPrice,
  validateOrderTotalsMatch,
} from './pricing'

describe('Shared Pricing Module', () => {
  describe('calculateLineDiscount', () => {
    it('tính chiết khấu dòng theo phần trăm hợp lệ', () => {
      // 100.000 * 2 = 200.000, giảm 10% = 20.000
      expect(
        calculateLineDiscount({
          unitPrice: 100_000,
          quantity: 2,
          discountType: 'percent',
          discountValue: 10,
        }),
      ).toBe(20_000)
    })

    it('làm tròn số tiền VND khi chiết khấu phần trăm lẻ', () => {
      // 33.333 * 1 = 33.333, giảm 10% = 3.333,3 -> làm tròn 3.333
      expect(
        calculateLineDiscount({
          unitPrice: 33_333,
          quantity: 1,
          discountType: 'percent',
          discountValue: 10,
        }),
      ).toBe(3333)
    })

    it('giới hạn chiết khấu phần trăm tối đa 100%', () => {
      expect(
        calculateLineDiscount({
          unitPrice: 50_000,
          quantity: 1,
          discountType: 'percent',
          discountValue: 150,
        }),
      ).toBe(50_000)
    })

    it('tính chiết khấu dòng theo số tiền cố định', () => {
      expect(
        calculateLineDiscount({
          unitPrice: 100_000,
          quantity: 2,
          discountType: 'amount',
          discountValue: 30_000,
        }),
      ).toBe(30_000)
    })

    it('không để chiết khấu theo số tiền vượt quá tổng tiền dòng', () => {
      expect(
        calculateLineDiscount({
          unitPrice: 50_000,
          quantity: 1,
          discountType: 'amount',
          discountValue: 80_000,
        }),
      ).toBe(50_000)
    })

    it('xử lý an toàn sản phẩm giá 0đ hoặc số lượng 0 (không chia 0, không lỗi)', () => {
      expect(
        calculateLineDiscount({
          unitPrice: 0,
          quantity: 5,
          discountType: 'percent',
          discountValue: 20,
        }),
      ).toBe(0)

      expect(
        calculateLineDiscount({
          unitPrice: 100_000,
          quantity: 0,
          discountType: 'percent',
          discountValue: 20,
        }),
      ).toBe(0)
    })
  })

  describe('calculateLineTotal', () => {
    it('tính thành tiền dòng chính xác', () => {
      const res = calculateLineTotal({
        unitPrice: 100_000,
        quantity: 3,
        discountType: 'percent',
        discountValue: 10,
      })
      expect(res.gross).toBe(300_000)
      expect(res.discountAmount).toBe(30_000)
      expect(res.lineTotal).toBe(270_000)
    })
  })

  describe('calculateOrderDiscount', () => {
    it('tính chiết khấu đơn theo phần trăm', () => {
      expect(
        calculateOrderDiscount({
          subtotal: 500_000,
          discountType: 'percent',
          discountValue: 5,
        }),
      ).toBe(25_000)
    })

    it('tính chiết khấu đơn theo số tiền cố định', () => {
      expect(
        calculateOrderDiscount({
          subtotal: 500_000,
          discountType: 'amount',
          discountValue: 50_000,
        }),
      ).toBe(50_000)
    })

    it('không để chiết khấu đơn vượt quá subtotal', () => {
      expect(
        calculateOrderDiscount({
          subtotal: 100_000,
          discountType: 'amount',
          discountValue: 200_000,
        }),
      ).toBe(100_000)
    })
  })

  describe('allocateOrderDiscount (dồn phần dư làm tròn)', () => {
    it('phân bổ chiết khấu đơn cho 3 dòng và dồn phần dư vào dòng cuối', () => {
      // 3 dòng có lineTotal: 100.000, 100.000, 100.000 (tổng 300.000)
      // Chiết khấu đơn: 10.000
      // Dòng 1: floor(100/300 * 10000) = 3333
      // Dòng 2: floor(100/300 * 10000) = 3333
      // Dòng 3: 10000 - (3333 + 3333) = 3334 (dồn phần dư 1đ)
      const items = [{ lineTotal: 100_000 }, { lineTotal: 100_000 }, { lineTotal: 100_000 }]
      const allocations = allocateOrderDiscount(items, 300_000, 10_000)

      expect(allocations).toEqual([3333, 3333, 3334])
      expect(allocations.reduce((a, b) => a + b, 0)).toBe(10_000)
    })

    it('xử lý trường hợp chỉ có 1 dòng duy nhất', () => {
      const items = [{ lineTotal: 100_000 }]
      const allocations = allocateOrderDiscount(items, 100_000, 15_000)
      expect(allocations).toEqual([15_000])
    })

    it('xử lý danh sách rỗng hoặc chiết khấu bằng 0', () => {
      expect(allocateOrderDiscount([], 0, 0)).toEqual([])
      expect(allocateOrderDiscount([{ lineTotal: 50_000 }], 50_000, 0)).toEqual([0])
    })
  })

  describe('calculateUnitConversionPrice', () => {
    it('sử dụng giá bán riêng nếu có (customSellingPrice)', () => {
      expect(
        calculateUnitConversionPrice({
          basePrice: 10_000,
          conversionFactor: 10,
          customSellingPrice: 95_000,
        }),
      ).toBe(95_000)
    })

    it('tính theo hệ số quy đổi nếu không có customSellingPrice', () => {
      expect(
        calculateUnitConversionPrice({
          basePrice: 10_000,
          conversionFactor: 12,
          customSellingPrice: null,
        }),
      ).toBe(120_000)
    })
  })

  describe('calculateOrderTotals & validateOrderTotalsMatch', () => {
    it('tính toán đầy đủ toàn bộ đơn hàng', () => {
      const result = calculateOrderTotals({
        items: [
          { unitPrice: 50_000, quantity: 2, discountType: 'percent', discountValue: 10 }, // 100k - 10k = 90k
          { unitPrice: 200_000, quantity: 1, discountType: 'amount', discountValue: 20_000 }, // 200k - 20k = 180k
        ],
        orderDiscountType: 'percent',
        orderDiscountValue: 10, // 270k * 10% = 27k
      })

      expect(result.subtotal).toBe(270_000)
      expect(result.orderDiscountAmount).toBe(27_000)
      expect(result.total).toBe(243_000)

      const validCheck = validateOrderTotalsMatch(
        { subtotal: 270_000, discountAmount: 27_000, total: 243_000 },
        result,
      )
      expect(validCheck.isValid).toBe(true)

      const invalidCheck = validateOrderTotalsMatch(
        { subtotal: 270_000, discountAmount: 0, total: 270_000 },
        result,
      )
      expect(invalidCheck.isValid).toBe(false)
    })
  })
})

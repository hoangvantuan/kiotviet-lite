import { describe, expect, it } from 'vitest'

import { calculateLineTotal } from './pricing.js'
import {
  addQty,
  amountByQtyRatio,
  formatQuantity,
  hasValidQuantityScale,
  isQuantityAllowed,
  lineAmount,
  mulQty,
  parseQuantity,
  parseQuantityInput,
  quantityToDb,
  quantityToInput,
  subQty,
  sumQty,
  unitAmountOf,
  weightedAverageCost,
} from './quantity.js'

describe('số lượng thập phân (ADR-0015)', () => {
  it('cộng trừ chính xác trên nghìn đơn vị', () => {
    expect(addQty(0.1, 0.2)).toBe(0.3)
    expect(subQty(10, 1.255)).toBe(8.745)
    expect(sumQty([0.1, 0.1, 0.1])).toBe(0.3)
    expect(mulQty(1.5, 24)).toBe(36)
    expect(mulQty(0.333, 3)).toBe(0.999)
    expect(subQty(1, 1)).toBe(0)
    expect(Object.is(subQty(1, 1), -0)).toBe(false)
  })

  it('đọc chuỗi numeric của driver ở một chỗ', () => {
    expect(parseQuantity('1.255')).toBe(1.255)
    expect(parseQuantity('-368.300')).toBe(-368.3)
    expect(parseQuantity(12)).toBe(12)
    expect(parseQuantity(null)).toBe(0)
    expect(quantityToDb(1.5)).toBe('1.500')
    expect(quantityToDb(0.1 + 0.2)).toBe('0.300')
  })

  it('tiền dòng = round_half_up(đơn giá × số lượng)', () => {
    expect(lineAmount(45_000, 1.255)).toBe(56_475)
    expect(lineAmount(10_001, 0.333)).toBe(3_330) // 3.330,333
    expect(lineAmount(1_001, 0.5)).toBe(501) // 500,5 lên 501
    expect(lineAmount(999, 0.001)).toBe(1) // 0,999
    expect(lineAmount(15_000, 3)).toBe(45_000)
    // Số lớn vẫn đúng (BigInt)
    expect(lineAmount(999_999_999, 999_999.999)).toBe(999_999_998_000_000)
    expect(calculateLineTotal({ unitPrice: 45_000, quantity: 1.255 }).lineTotal).toBe(56_475)
  })

  it('chia theo tỷ lệ số lượng và bình quân gia quyền', () => {
    expect(amountByQtyRatio(56_475, 0.5, 1.255)).toBe(22_500) // 22.500,0
    expect(unitAmountOf(472_500, 10.5)).toBe(45_000)
    // tồn 2 kg giá 40.000, nhập 10,5 kg giá trị 472.500 -> (80.000 + 472.500) / 12,5 = 44.200
    expect(
      weightedAverageCost({
        stockBefore: 2,
        costBefore: 40_000,
        addedValue: 472_500,
        stockAfter: 12.5,
      }),
    ).toBe(44_200)
  })

  it('kiểm số chữ số lẻ', () => {
    expect(hasValidQuantityScale(1.255)).toBe(true)
    // Sai số dấu phẩy động của số gửi lên không làm hỏng kiểm
    expect(hasValidQuantityScale(0.1 + 0.2)).toBe(true)
    expect(hasValidQuantityScale(1.2345)).toBe(false)
    expect(hasValidQuantityScale(3)).toBe(true)
  })

  it('hiển thị tối đa 3 chữ số lẻ, bỏ số 0 thừa, dấu phẩy Việt Nam', () => {
    expect(formatQuantity(1.5)).toBe('1,5')
    expect(formatQuantity(1.255)).toBe('1,255')
    expect(formatQuantity('2.500')).toBe('2,5')
    expect(formatQuantity(12)).toBe('12')
    expect(formatQuantity(1200)).toBe('1.200')
    expect(quantityToInput(1.5)).toBe('1,5')
  })

  it('phân tích ô nhập dấu phẩy kiểu Việt Nam', () => {
    expect(parseQuantityInput('1,5', { allowDecimal: true })).toBe(1.5)
    expect(parseQuantityInput('1.255', { allowDecimal: true })).toBe(1.255)
    expect(parseQuantityInput('0,5', { allowDecimal: true })).toBe(0.5)
    expect(parseQuantityInput(',5', { allowDecimal: true })).toBe(0.5)
    expect(parseQuantityInput('1,2345', { allowDecimal: true })).toBeNull()
    expect(parseQuantityInput('1,5')).toBeNull()
    expect(parseQuantityInput('3')).toBe(3)
    expect(parseQuantityInput('abc', { allowDecimal: true })).toBeNull()
    expect(parseQuantityInput('1,5,2', { allowDecimal: true })).toBeNull()
    expect(parseQuantityInput('', { allowDecimal: true })).toBeNull()
  })

  it('cờ bán số lẻ: đơn vị theo cờ của nó, số quy ra đơn vị gốc nguyên khi sản phẩm không bật', () => {
    const can = { conversionFactor: 24, allowDecimalQuantity: true }
    expect(isQuantityAllowed({ quantity: 1.5, productAllowsDecimal: true })).toBe(true)
    expect(isQuantityAllowed({ quantity: 1.5, productAllowsDecimal: false })).toBe(false)
    expect(isQuantityAllowed({ quantity: 2, productAllowsDecimal: false })).toBe(true)
    expect(isQuantityAllowed({ quantity: 1.2345, productAllowsDecimal: true })).toBe(false)
    // 0,5 thùng 24 lon = 12 lon được, 0,3 thùng = 7,2 lon thì không
    expect(
      isQuantityAllowed({ quantity: 0.5, productAllowsDecimal: false, unitConversion: can }),
    ).toBe(true)
    expect(
      isQuantityAllowed({ quantity: 0.3, productAllowsDecimal: false, unitConversion: can }),
    ).toBe(false)
    // Đơn vị không bật cờ: chỉ số nguyên dù sản phẩm bật
    expect(
      isQuantityAllowed({
        quantity: 0.5,
        productAllowsDecimal: true,
        unitConversion: { conversionFactor: 10 },
      }),
    ).toBe(false)
  })
})

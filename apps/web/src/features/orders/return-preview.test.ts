import { describe, expect, it } from 'vitest'

import type { ReturnableItem } from './orders-api'
import { previewReturn } from './return-preview'

function item(overrides: Partial<ReturnableItem>): ReturnableItem {
  return {
    orderItemId: 'a',
    productId: 'p',
    variantId: null,
    productName: 'Mì',
    variantName: null,
    unit: null,
    unitPrice: 45_000,
    purchasedQuantity: 3,
    returnedQuantity: 0,
    remainingQuantity: 3,
    lineTotal: 135_000,
    orderDiscountAllocated: 27_000,
    conversionFactor: 1,
    ...overrides,
  }
}

describe('previewReturn (TIEN-108)', () => {
  it('trừ chiết khấu đơn đã phân bổ, không lấy đơn giá × số lượng', () => {
    expect(previewReturn([item({})], new Map([['a', 1]]), 0)).toEqual({
      totalAmount: 36_000,
      debtReductionAmount: 0,
      refundAmount: 36_000,
    })
  })

  it('lần trả sau tính tiếp từ số đã trả, cộng lại bằng trả một lần', () => {
    const second = previewReturn(
      [item({ returnedQuantity: 1, remainingQuantity: 2 })],
      new Map([['a', 2]]),
      0,
    )
    expect(second.totalAmount).toBe(72_000)
  })

  it('tách cấn nợ còn lại của đơn trước, dư mới hoàn tiền', () => {
    expect(previewReturn([item({})], new Map([['a', 3]]), 50_000)).toEqual({
      totalAmount: 108_000,
      debtReductionAmount: 50_000,
      refundAmount: 58_000,
    })
  })
})

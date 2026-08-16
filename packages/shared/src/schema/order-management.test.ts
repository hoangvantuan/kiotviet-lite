import { describe, expect, it } from 'vitest'

import { createOrderSchema } from './order-management.js'

const PID = '123e4567-e89b-12d3-a456-426614174000'

function validItem(over: Record<string, unknown> = {}) {
  return {
    productId: PID,
    productName: 'Sản phẩm A',
    unitPrice: 100000,
    quantity: 3,
    discountAmount: 0,
    lineTotal: 300000,
    ...over,
  }
}

function validOrder(over: Record<string, unknown> = {}) {
  return {
    subtotal: 300000,
    discountAmount: 0,
    total: 300000,
    paymentMethod: 'cash' as const,
    cashAmount: 300000,
    items: [validItem()],
    ...over,
  }
}

describe('createOrderSchema - CRIT C2 bất biến tổng tiền', () => {
  it('chấp nhận đơn hợp lệ khi subtotal khớp tổng thành tiền các dòng', () => {
    expect(createOrderSchema.safeParse(validOrder()).success).toBe(true)
  })

  it('từ chối subtotal=0 với hàng thật (chống trừ kho mà ghi doanh thu 0)', () => {
    const bad = validOrder({ subtotal: 0, total: 0, cashAmount: 0 })
    expect(createOrderSchema.safeParse(bad).success).toBe(false)
  })

  it('từ chối subtotal lệch tổng thành tiền các dòng', () => {
    const bad = validOrder({ subtotal: 250000, total: 250000, cashAmount: 250000 })
    expect(createOrderSchema.safeParse(bad).success).toBe(false)
  })
})

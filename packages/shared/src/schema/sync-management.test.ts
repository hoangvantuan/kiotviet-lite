import { describe, expect, it } from 'vitest'

import { syncPushOrderDataSchema } from './sync-management.js'

const PID = '123e4567-e89b-12d3-a456-426614174000'

function validItem(over: Record<string, unknown> = {}) {
  return {
    productId: PID,
    productName: 'SP',
    unitPrice: 100000,
    quantity: 2,
    discountAmount: 0,
    lineTotal: 200000,
    ...over,
  }
}

function validData(over: Record<string, unknown> = {}) {
  return {
    subtotal: 200000,
    discountAmount: 0,
    total: 200000,
    paymentMethod: 'cash' as const,
    items: [validItem()],
    ...over,
  }
}

describe('syncPushOrderDataSchema - CRIT C2 bất biến tiền đơn offline', () => {
  it('chấp nhận đơn offline hợp lệ', () => {
    expect(syncPushOrderDataSchema.safeParse(validData()).success).toBe(true)
  })

  it('từ chối lineTotal sai công thức (server không còn tin tuyệt đối client)', () => {
    const bad = validData({ items: [validItem({ lineTotal: 999 })] })
    expect(syncPushOrderDataSchema.safeParse(bad).success).toBe(false)
  })

  it('từ chối subtotal lệch tổng dòng (chống trừ kho mà ghi doanh thu sai)', () => {
    const bad = validData({ subtotal: 0, total: 0 })
    expect(syncPushOrderDataSchema.safeParse(bad).success).toBe(false)
  })

  it('từ chối total lệch subtotal - discountAmount', () => {
    const bad = validData({ total: 150000 })
    expect(syncPushOrderDataSchema.safeParse(bad).success).toBe(false)
  })
})

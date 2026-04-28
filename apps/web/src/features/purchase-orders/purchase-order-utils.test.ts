import { describe, expect, it } from 'vitest'

import { computeLineTotal, computeOrderTotals } from './purchase-order-utils'

describe('computeLineTotal', () => {
  it('amount discount: 10 x 78000 - 20000 = 760000', () => {
    const r = computeLineTotal(10, 78000, 'amount', 20000)
    expect(r.lineSubtotal).toBe(780000)
    expect(r.discountAmount).toBe(20000)
    expect(r.lineTotal).toBe(760000)
  })

  it('percent 5% (value 500): 10 x 78000 → discount 39000, line 741000', () => {
    const r = computeLineTotal(10, 78000, 'percent', 500)
    expect(r.discountAmount).toBe(39000)
    expect(r.lineTotal).toBe(741000)
  })

  it('cap discount khi vượt subtotal', () => {
    const r = computeLineTotal(1, 100, 'amount', 999)
    expect(r.discountAmount).toBe(100)
    expect(r.lineTotal).toBe(0)
  })

  it('percent > 100% (10000) cap về 100%', () => {
    const r = computeLineTotal(1, 100, 'percent', 20000)
    expect(r.discountAmount).toBe(100)
    expect(r.lineTotal).toBe(0)
  })

  it('quantity = 0 hoặc unitPrice = 0 → subtotal = 0', () => {
    expect(computeLineTotal(0, 100, 'amount', 0).lineSubtotal).toBe(0)
    expect(computeLineTotal(5, 0, 'amount', 0).lineSubtotal).toBe(0)
  })
})

describe('computeOrderTotals', () => {
  it('amount discount tổng', () => {
    const r = computeOrderTotals({
      subtotal: 1_000_000,
      discountTotalType: 'amount',
      discountTotalValue: 50_000,
    })
    expect(r.discountTotal).toBe(50_000)
    expect(r.totalAmount).toBe(950_000)
  })

  it('percent 10% trên 1tr', () => {
    const r = computeOrderTotals({
      subtotal: 1_000_000,
      discountTotalType: 'percent',
      discountTotalValue: 1000,
    })
    expect(r.discountTotal).toBe(100_000)
    expect(r.totalAmount).toBe(900_000)
  })

  it('cap discount tổng vượt subtotal', () => {
    const r = computeOrderTotals({
      subtotal: 100,
      discountTotalType: 'amount',
      discountTotalValue: 999,
    })
    expect(r.discountTotal).toBe(100)
    expect(r.totalAmount).toBe(0)
  })
})

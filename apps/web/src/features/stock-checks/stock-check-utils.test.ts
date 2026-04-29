import { describe, expect, it } from 'vitest'

import { computeStockCheckTotals, formatDiff } from './stock-check-utils'

describe('computeStockCheckTotals', () => {
  it('tính tổng tăng giảm và unchanged đúng', () => {
    const result = computeStockCheckTotals([
      { systemQty: 10, actualQty: 12 },
      { systemQty: 5, actualQty: 3 },
      { systemQty: 8, actualQty: 8 },
    ])
    expect(result.totalDiffPositive).toBe(2)
    expect(result.totalDiffNegative).toBe(2)
    expect(result.unchangedCount).toBe(1)
    expect(result.changedCount).toBe(2)
  })

  it('items rỗng trả về tất cả 0', () => {
    const result = computeStockCheckTotals([])
    expect(result.totalDiffPositive).toBe(0)
    expect(result.totalDiffNegative).toBe(0)
    expect(result.unchangedCount).toBe(0)
    expect(result.changedCount).toBe(0)
  })

  it('integer arithmetic không bị floating', () => {
    const result = computeStockCheckTotals([
      { systemQty: 100, actualQty: 99 },
      { systemQty: 200, actualQty: 201 },
    ])
    expect(result.totalDiffPositive).toBe(1)
    expect(result.totalDiffNegative).toBe(1)
  })
})

describe('formatDiff', () => {
  it('số dương có prefix + và class xanh', () => {
    const r = formatDiff(5)
    expect(r.text).toBe('+5')
    expect(r.className).toContain('green')
  })

  it('số âm class đỏ', () => {
    const r = formatDiff(-3)
    expect(r.text).toBe('-3')
    expect(r.className).toContain('red')
  })

  it('số 0 class xám', () => {
    const r = formatDiff(0)
    expect(r.text).toBe('0')
    expect(r.className).toContain('gray')
  })
})

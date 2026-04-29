import { describe, expect, it } from 'vitest'

import { computeStockCheckTotals, formatDiff } from './stock-check-utils'

interface DraftItem {
  productId: string
  variantId: string | null
  systemQty: number
  actualQty: number
}

function isItemValid(item: DraftItem): boolean {
  return Number.isInteger(item.actualQty) && item.actualQty >= 0
}

function isFormSubmittable(items: DraftItem[]): boolean {
  if (items.length === 0) return false
  return items.every(isItemValid)
}

function computeLiveDiff(systemQty: number, actualQty: number): number {
  return actualQty - systemQty
}

describe('StockCheckForm — AC27 validate actualQty integer ≥ 0', () => {
  it('actualQty âm → invalid, không thể submit', () => {
    const items: DraftItem[] = [{ productId: 'p1', variantId: null, systemQty: 10, actualQty: -1 }]
    expect(isItemValid(items[0]!)).toBe(false)
    expect(isFormSubmittable(items)).toBe(false)
  })

  it('actualQty là số thập phân → invalid', () => {
    const items: DraftItem[] = [{ productId: 'p1', variantId: null, systemQty: 10, actualQty: 5.5 }]
    expect(isItemValid(items[0]!)).toBe(false)
    expect(isFormSubmittable(items)).toBe(false)
  })

  it('actualQty là 0 → valid (cho phép)', () => {
    const items: DraftItem[] = [{ productId: 'p1', variantId: null, systemQty: 10, actualQty: 0 }]
    expect(isItemValid(items[0]!)).toBe(true)
    expect(isFormSubmittable(items)).toBe(true)
  })

  it('actualQty NaN → invalid', () => {
    const items: DraftItem[] = [
      { productId: 'p1', variantId: null, systemQty: 10, actualQty: Number.NaN },
    ]
    expect(isItemValid(items[0]!)).toBe(false)
    expect(isFormSubmittable(items)).toBe(false)
  })

  it('items rỗng → form không submit được', () => {
    expect(isFormSubmittable([])).toBe(false)
  })

  it('1 dòng valid + 1 dòng invalid → form không submit được', () => {
    const items: DraftItem[] = [
      { productId: 'p1', variantId: null, systemQty: 10, actualQty: 12 },
      { productId: 'p2', variantId: null, systemQty: 5, actualQty: -1 },
    ]
    expect(isFormSubmittable(items)).toBe(false)
  })
})

describe('StockCheckForm — AC28 tính diff live đúng', () => {
  it('actualQty > systemQty → diff dương', () => {
    expect(computeLiveDiff(100, 110)).toBe(10)
  })

  it('actualQty < systemQty → diff âm', () => {
    expect(computeLiveDiff(100, 95)).toBe(-5)
  })

  it('actualQty = systemQty → diff = 0', () => {
    expect(computeLiveDiff(50, 50)).toBe(0)
  })

  it('summary footer phản ánh đúng tăng/giảm/không-đổi từ items live', () => {
    const items = [
      { systemQty: 10, actualQty: 12 }, // +2
      { systemQty: 20, actualQty: 18 }, // -2
      { systemQty: 5, actualQty: 5 }, // 0
      { systemQty: 8, actualQty: 11 }, // +3
    ]
    const total = computeStockCheckTotals(items)
    expect(total.totalDiffPositive).toBe(5)
    expect(total.totalDiffNegative).toBe(2)
    expect(total.unchangedCount).toBe(1)
    expect(total.changedCount).toBe(3)
  })
})

describe('StockCheckForm — AC29 color-code chênh lệch xanh/đỏ/xám', () => {
  it('diff > 0 → text xanh, prefix +', () => {
    const r = formatDiff(7)
    expect(r.text).toBe('+7')
    expect(r.className).toContain('green')
  })

  it('diff < 0 → text đỏ, prefix -', () => {
    const r = formatDiff(-4)
    expect(r.text).toBe('-4')
    expect(r.className).toContain('red')
  })

  it('diff = 0 → text 0, class xám', () => {
    const r = formatDiff(0)
    expect(r.text).toBe('0')
    expect(r.className).toContain('gray')
  })

  it('diff = 1 → text "+1" (không bị bỏ +)', () => {
    expect(formatDiff(1).text).toBe('+1')
  })

  it('diff = -1 → text "-1"', () => {
    expect(formatDiff(-1).text).toBe('-1')
  })
})

import { describe, expect, it } from 'vitest'

import type { CompareRow } from '../schema/price-list-management.js'
import { computeCompareRow, computeCompareSummary } from './price-list-compare.js'

const baseInput = {
  productId: '11111111-1111-1111-1111-111111111111',
  productName: 'Sản phẩm A',
  productSku: 'SP-001',
  productImageUrl: null,
  productSellingPrice: 100000,
  productCostPrice: 80000,
  priceA: null as number | null,
  priceB: null as number | null,
}

describe('computeCompareRow', () => {
  it('cả 2 giá đều có: diffAmount + diffPercent đúng', () => {
    const row = computeCompareRow({ ...baseInput, priceA: 10000, priceB: 12000 })
    expect(row.diffAmount).toBe(2000)
    expect(row.diffPercent).toBe(20)
    expect(row.isMissingA).toBe(false)
    expect(row.isMissingB).toBe(false)
  })

  it('rounding 2 chữ số: priceA=10000, priceB=12345 → diffPercent=23.45', () => {
    const row = computeCompareRow({ ...baseInput, priceA: 10000, priceB: 12345 })
    expect(row.diffPercent).toBe(23.45)
  })

  it('priceA = 0 → diffPercent = null, marginA = null', () => {
    const row = computeCompareRow({ ...baseInput, priceA: 0, priceB: 1000 })
    expect(row.diffPercent).toBe(null)
    expect(row.marginA).toBe(null)
  })

  it('costPrice = null → margin null, isBelowCost false', () => {
    const row = computeCompareRow({
      ...baseInput,
      productCostPrice: null,
      priceA: 10000,
      priceB: 8000,
    })
    expect(row.marginA).toBe(null)
    expect(row.marginB).toBe(null)
    expect(row.isBelowCostA).toBe(false)
    expect(row.isBelowCostB).toBe(false)
  })

  it('priceA === priceB → diffPercent = 0 (không null)', () => {
    const row = computeCompareRow({ ...baseInput, priceA: 50000, priceB: 50000 })
    expect(row.diffPercent).toBe(0)
    expect(row.diffAmount).toBe(0)
  })

  it('isMissingA khi priceA null', () => {
    const row = computeCompareRow({ ...baseInput, priceA: null, priceB: 10000 })
    expect(row.isMissingA).toBe(true)
    expect(row.isMissingB).toBe(false)
    expect(row.diffAmount).toBe(null)
    expect(row.diffPercent).toBe(null)
  })

  it('isMissingB khi priceB null', () => {
    const row = computeCompareRow({ ...baseInput, priceA: 10000, priceB: null })
    expect(row.isMissingA).toBe(false)
    expect(row.isMissingB).toBe(true)
    expect(row.diffAmount).toBe(null)
    expect(row.diffPercent).toBe(null)
  })

  it('isBelowCostB khi priceB < costPrice', () => {
    const row = computeCompareRow({
      ...baseInput,
      productCostPrice: 80000,
      priceA: 90000,
      priceB: 70000,
    })
    expect(row.isBelowCostA).toBe(false)
    expect(row.isBelowCostB).toBe(true)
  })

  it('marginA = (price - cost) / price * 100, làm tròn 2 chữ số', () => {
    const row = computeCompareRow({
      ...baseInput,
      productCostPrice: 30000,
      priceA: 50000,
      priceB: 60000,
    })
    expect(row.marginA).toBe(40)
    expect(row.marginB).toBe(50)
  })
})

describe('computeCompareSummary', () => {
  function makeRow(overrides: Partial<CompareRow>): CompareRow {
    return {
      productId: 'p',
      productName: 'p',
      productSku: 'sku',
      productImageUrl: null,
      productSellingPrice: 0,
      productCostPrice: null,
      priceA: 100,
      priceB: 100,
      diffAmount: 0,
      diffPercent: 0,
      marginA: null,
      marginB: null,
      isBelowCostA: false,
      isBelowCostB: false,
      isMissingA: false,
      isMissingB: false,
      ...overrides,
    }
  }

  it('tổng hợp counts đúng từ rows mock', () => {
    const rows: CompareRow[] = [
      makeRow({ isMissingA: false, isMissingB: false, diffPercent: 5 }),
      makeRow({ isMissingA: false, isMissingB: false, diffPercent: 15 }),
      makeRow({ isMissingA: false, isMissingB: false, diffPercent: -20 }),
      makeRow({ isMissingA: true, isMissingB: false, priceA: null }),
      makeRow({ isMissingA: false, isMissingB: true, priceB: null }),
      makeRow({ isMissingA: false, isMissingB: false, isBelowCostB: true, diffPercent: 0 }),
      makeRow({ isMissingA: false, isMissingB: false, isBelowCostA: true, diffPercent: 0 }),
    ]

    const summary = computeCompareSummary(rows)

    expect(summary.totalProducts).toBe(7)
    expect(summary.bothCount).toBe(5)
    expect(summary.onlyACount).toBe(1)
    expect(summary.onlyBCount).toBe(1)
    expect(summary.diffOver10Count).toBe(2)
    expect(summary.belowCostBCount).toBe(1)
    expect(summary.belowCostACount).toBe(1)
  })

  it('rows rỗng → tất cả counts = 0', () => {
    const summary = computeCompareSummary([])
    expect(summary.totalProducts).toBe(0)
    expect(summary.bothCount).toBe(0)
    expect(summary.onlyACount).toBe(0)
    expect(summary.onlyBCount).toBe(0)
    expect(summary.diffOver10Count).toBe(0)
    expect(summary.belowCostBCount).toBe(0)
    expect(summary.belowCostACount).toBe(0)
  })
})

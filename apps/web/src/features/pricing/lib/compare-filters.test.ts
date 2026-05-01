import { describe, expect, it } from 'vitest'

import type { CompareRow } from '@kiotviet-lite/shared'

import {
  applyCompareFilters,
  type CompareFiltersState,
  DEFAULT_COMPARE_FILTERS,
} from './compare-filters'

function makeRow(overrides: Partial<CompareRow>): CompareRow {
  return {
    productId: 'p',
    productName: 'Sản phẩm',
    productSku: 'SP',
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

describe('applyCompareFilters', () => {
  const rows: CompareRow[] = [
    makeRow({ productId: '1', productName: 'Áo thun', productSku: 'AT01', diffPercent: 5 }),
    makeRow({
      productId: '2',
      productName: 'Quần jeans',
      productSku: 'QJ01',
      diffPercent: 15,
    }),
    makeRow({
      productId: '3',
      productName: 'Mũ lưỡi trai',
      productSku: 'MLT01',
      isBelowCostB: true,
      diffPercent: -5,
    }),
    makeRow({
      productId: '4',
      productName: 'Giày thể thao',
      productSku: 'GTT01',
      isMissingA: true,
      priceA: null,
      diffPercent: null,
    }),
  ]

  it('Empty filter trả nguyên rows', () => {
    expect(applyCompareFilters(rows, DEFAULT_COMPARE_FILTERS)).toEqual(rows)
  })

  it('onlyBelowCostB chỉ lấy row có isBelowCostB', () => {
    const filters: CompareFiltersState = { ...DEFAULT_COMPARE_FILTERS, onlyBelowCostB: true }
    const result = applyCompareFilters(rows, filters)
    expect(result.length).toBe(1)
    expect(result[0]?.productId).toBe('3')
  })

  it('onlyDiffOver10 chỉ lấy row có |diffPercent| > 10', () => {
    const filters: CompareFiltersState = { ...DEFAULT_COMPARE_FILTERS, onlyDiffOver10: true }
    const result = applyCompareFilters(rows, filters)
    expect(result.length).toBe(1)
    expect(result[0]?.productId).toBe('2')
  })

  it('onlyBoth lọc bỏ row missing', () => {
    const filters: CompareFiltersState = { ...DEFAULT_COMPARE_FILTERS, onlyBoth: true }
    const result = applyCompareFilters(rows, filters)
    expect(result.length).toBe(3)
    expect(result.find((r) => r.productId === '4')).toBeUndefined()
  })

  it('Search lowercase match name', () => {
    const filters: CompareFiltersState = { ...DEFAULT_COMPARE_FILTERS, search: 'áo' }
    const result = applyCompareFilters(rows, filters)
    expect(result.length).toBe(1)
    expect(result[0]?.productSku).toBe('AT01')
  })

  it('Search match SKU', () => {
    const filters: CompareFiltersState = { ...DEFAULT_COMPARE_FILTERS, search: 'qj01' }
    const result = applyCompareFilters(rows, filters)
    expect(result.length).toBe(1)
    expect(result[0]?.productId).toBe('2')
  })

  it('AND giữa các filter (search + onlyBelowCostB)', () => {
    const filters: CompareFiltersState = {
      ...DEFAULT_COMPARE_FILTERS,
      search: 'mũ',
      onlyBelowCostB: true,
    }
    const result = applyCompareFilters(rows, filters)
    expect(result.length).toBe(1)
    expect(result[0]?.productId).toBe('3')
  })
})

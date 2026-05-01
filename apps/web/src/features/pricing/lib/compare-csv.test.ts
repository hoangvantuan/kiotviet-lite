import { describe, expect, it } from 'vitest'

import type { CompareRow } from '@kiotviet-lite/shared'

import { buildCompareCsv } from './compare-csv'

function makeRow(overrides: Partial<CompareRow>): CompareRow {
  return {
    productId: 'p',
    productName: 'Sản phẩm 1',
    productSku: 'SP1',
    productImageUrl: null,
    productSellingPrice: 100000,
    productCostPrice: 50000,
    priceA: 80000,
    priceB: 90000,
    diffAmount: 10000,
    diffPercent: 12.5,
    marginA: 37.5,
    marginB: 44.44,
    isBelowCostA: false,
    isBelowCostB: false,
    isMissingA: false,
    isMissingB: false,
    ...overrides,
  }
}

describe('buildCompareCsv', () => {
  it('Header line đúng', () => {
    const csv = buildCompareCsv([])
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe(
      'product_sku,product_name,cost_price,price_a,margin_a_percent,price_b,margin_b_percent,diff_amount,diff_percent,below_cost_a,below_cost_b',
    )
    expect(lines.length).toBe(1)
  })

  it('Row bình thường: số nguyên giữ nguyên, float làm tròn 2 chữ số, bool 0/1', () => {
    const csv = buildCompareCsv([makeRow({})])
    const lines = csv.split('\r\n')
    expect(lines.length).toBe(2)
    expect(lines[1]).toBe('SP1,Sản phẩm 1,50000,80000,37.50,90000,44.44,10000,12.50,0,0')
  })

  it('Row missing A: priceA + marginA + diffAmount + diffPercent rỗng', () => {
    const csv = buildCompareCsv([
      makeRow({
        priceA: null,
        marginA: null,
        diffAmount: null,
        diffPercent: null,
        isMissingA: true,
      }),
    ])
    const dataLine = csv.split('\r\n')[1]
    expect(dataLine).toBe('SP1,Sản phẩm 1,50000,,,90000,44.44,,,0,0')
  })

  it('Row below cost B: below_cost_b=1', () => {
    const csv = buildCompareCsv([
      makeRow({ isBelowCostB: true, priceB: 30000, marginB: -66.67, diffAmount: -50000 }),
    ])
    const dataLine = csv.split('\r\n')[1]
    expect(dataLine).toContain(',1')
    expect(dataLine?.endsWith('0,1')).toBe(true)
  })

  it('Tên có dấu phẩy → wrap quote', () => {
    const csv = buildCompareCsv([makeRow({ productName: 'Áo, sơ mi' })])
    const dataLine = csv.split('\r\n')[1]
    expect(dataLine).toContain('"Áo, sơ mi"')
  })

  it('Cost price null → empty cell', () => {
    const csv = buildCompareCsv([makeRow({ productCostPrice: null })])
    const dataLine = csv.split('\r\n')[1]
    // Vị trí 3 (index 2) là cost_price → empty
    const cells = dataLine?.split(',') ?? []
    expect(cells[2]).toBe('')
  })

  it('3 row: number of lines = 4 (header + 3 rows)', () => {
    const csv = buildCompareCsv([
      makeRow({ productSku: 'A' }),
      makeRow({ productSku: 'B', isBelowCostB: true }),
      makeRow({ productSku: 'C', priceA: null, isMissingA: true }),
    ])
    const lines = csv.split('\r\n')
    expect(lines.length).toBe(4)
  })
})

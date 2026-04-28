import { describe, expect, it } from 'vitest'

import {
  applyFormula,
  applyRounding,
  computeFinalPrice,
  formatFormulaLabel,
  formatRoundingLabel,
} from './pricing-formulas.js'

describe('applyFormula', () => {
  it('percent_increase 10% (1000) trên 100000 → 110000', () => {
    expect(applyFormula(100000, 'percent_increase', 1000)).toBe(110000)
  })

  it('percent_decrease 10% (1000) trên 100000 → 90000', () => {
    expect(applyFormula(100000, 'percent_decrease', 1000)).toBe(90000)
  })

  it('amount_increase 5000 trên 50000 → 55000', () => {
    expect(applyFormula(50000, 'amount_increase', 5000)).toBe(55000)
  })

  it('amount_decrease 60000 trên 50000 → 0 (clamp)', () => {
    expect(applyFormula(50000, 'amount_decrease', 60000)).toBe(0)
  })

  it('percent_decrease 33.33% (3333) trên 33333 → 22223 (Math.round)', () => {
    expect(applyFormula(33333, 'percent_decrease', 3333)).toBe(22223)
  })

  it('percent_increase 0 trên 100000 → 100000', () => {
    expect(applyFormula(100000, 'percent_increase', 0)).toBe(100000)
  })
})

describe('applyRounding', () => {
  it('none giữ nguyên', () => {
    expect(applyRounding(45250, 'none')).toBe(45250)
  })

  it('nearest_thousand: 45250 → 45000', () => {
    expect(applyRounding(45250, 'nearest_thousand')).toBe(45000)
  })

  it('nearest_thousand: 45500 → 46000 (Math.round)', () => {
    expect(applyRounding(45500, 'nearest_thousand')).toBe(46000)
  })

  it('ceil_thousand: 45200 → 46000', () => {
    expect(applyRounding(45200, 'ceil_thousand')).toBe(46000)
  })

  it('floor_thousand: 45800 → 45000', () => {
    expect(applyRounding(45800, 'floor_thousand')).toBe(45000)
  })

  it('nearest_hundred: 45250 → 45300', () => {
    expect(applyRounding(45250, 'nearest_hundred')).toBe(45300)
  })

  it('ceil_five_hundred: 45200 → 45500', () => {
    expect(applyRounding(45200, 'ceil_five_hundred')).toBe(45500)
  })

  it('floor_five_hundred: 45200 → 45000', () => {
    expect(applyRounding(45200, 'floor_five_hundred')).toBe(45000)
  })

  it('nearest_five_hundred: 45250 → 45500', () => {
    expect(applyRounding(45250, 'nearest_five_hundred')).toBe(45500)
  })

  it('floor_hundred: 45299 → 45200', () => {
    expect(applyRounding(45299, 'floor_hundred')).toBe(45200)
  })
})

describe('computeFinalPrice', () => {
  it('33333 × percent_decrease 10% × ceil_thousand → 30000', () => {
    expect(computeFinalPrice(33333, 'percent_decrease', 1000, 'ceil_thousand')).toBe(30000)
  })

  it('33334 × percent_decrease 10% × ceil_thousand → 31000', () => {
    expect(computeFinalPrice(33334, 'percent_decrease', 1000, 'ceil_thousand')).toBe(31000)
  })

  it('100000 × amount_decrease 50000 × none → 50000', () => {
    expect(computeFinalPrice(100000, 'amount_decrease', 50000, 'none')).toBe(50000)
  })

  it('100000 × amount_decrease 200000 × ceil_thousand → 0 (clamp)', () => {
    expect(computeFinalPrice(100000, 'amount_decrease', 200000, 'ceil_thousand')).toBe(0)
  })
})

describe('formatFormulaLabel', () => {
  it('percent_increase 1050 → Tăng 10.5%', () => {
    expect(formatFormulaLabel('percent_increase', 1050)).toBe('Tăng 10.5%')
  })

  it('percent_decrease 500 → Giảm 5%', () => {
    expect(formatFormulaLabel('percent_decrease', 500)).toBe('Giảm 5%')
  })

  it('amount_increase 5000 → Tăng 5.000đ', () => {
    expect(formatFormulaLabel('amount_increase', 5000)).toBe('Tăng 5.000đ')
  })
})

describe('formatRoundingLabel', () => {
  it('none → Không làm tròn', () => {
    expect(formatRoundingLabel('none')).toBe('Không làm tròn')
  })

  it('ceil_thousand → Làm tròn lên 1.000đ', () => {
    expect(formatRoundingLabel('ceil_thousand')).toBe('Làm tròn lên 1.000đ')
  })
})

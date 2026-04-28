import { describe, expect, it } from 'vitest'

import {
  convertToBaseUnit,
  formatUnitDisplay,
  validateUnitNotConflict,
} from './unit-conversion-utils'

describe('convertToBaseUnit', () => {
  it('1 thùng × 24 = 24 cái', () => {
    expect(convertToBaseUnit(1, 24)).toBe(24)
  })

  it('3 lốc × 6 = 18', () => {
    expect(convertToBaseUnit(3, 6)).toBe(18)
  })
})

describe('formatUnitDisplay', () => {
  it('formats string đúng dạng "1 X = N Y"', () => {
    expect(formatUnitDisplay('Thùng', 24, 'Cái')).toBe('1 Thùng = 24 Cái')
  })
})

describe('validateUnitNotConflict', () => {
  it('returns null khi unit hợp lệ', () => {
    expect(validateUnitNotConflict('Thùng', 'Cái', [])).toBeNull()
  })

  it('phát hiện trùng parent unit (case-insensitive)', () => {
    expect(validateUnitNotConflict('cái', 'Cái', [])).toMatch(/khác đơn vị tính/)
  })

  it('phát hiện trùng đơn vị khác trong list', () => {
    expect(validateUnitNotConflict('Thùng', 'Cái', [{ unit: 'thùng' }, { unit: 'Lốc' }])).toMatch(
      /đã tồn tại/,
    )
  })

  it('bỏ qua chính nó (selfIndex)', () => {
    expect(
      validateUnitNotConflict('Thùng', 'Cái', [{ unit: 'Thùng' }, { unit: 'Lốc' }], 0),
    ).toBeNull()
  })

  it('phát hiện unit rỗng', () => {
    expect(validateUnitNotConflict('', 'Cái', [])).toMatch(/không được trống/)
  })
})

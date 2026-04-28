import { describe, expect, it } from 'vitest'

import { formatVnd, formatVndWithSuffix, parseVnd } from './currency.js'

describe('formatVnd', () => {
  it('format 0', () => {
    expect(formatVnd(0)).toBe('0')
  })

  it('format số nhỏ không có dấu', () => {
    expect(formatVnd(100)).toBe('100')
  })

  it('format có dấu chấm phân cách', () => {
    expect(formatVnd(150000)).toBe('150.000')
  })

  it('format số lớn', () => {
    expect(formatVnd(1500000)).toBe('1.500.000')
  })

  it('null trả chuỗi rỗng', () => {
    expect(formatVnd(null)).toBe('')
  })

  it('undefined trả chuỗi rỗng', () => {
    expect(formatVnd(undefined)).toBe('')
  })

  it('NaN trả chuỗi rỗng', () => {
    expect(formatVnd(Number.NaN)).toBe('')
  })
})

describe('formatVndWithSuffix', () => {
  it('append suffix " đ"', () => {
    expect(formatVndWithSuffix(150000)).toBe('150.000 đ')
  })

  it('null trả chuỗi rỗng (không suffix)', () => {
    expect(formatVndWithSuffix(null)).toBe('')
  })
})

describe('parseVnd', () => {
  it('parse "150.000"', () => {
    expect(parseVnd('150.000')).toBe(150000)
  })

  it('parse "1.500.000 đ"', () => {
    expect(parseVnd('1.500.000 đ')).toBe(1500000)
  })

  it('parse có dấu phẩy + space', () => {
    expect(parseVnd(' 25,000 ')).toBe(25000)
  })

  it('parse chuỗi rỗng → null', () => {
    expect(parseVnd('')).toBeNull()
  })

  it('parse chuỗi chữ → null', () => {
    expect(parseVnd('abc')).toBeNull()
  })

  it('parse số 0', () => {
    expect(parseVnd('0')).toBe(0)
  })

  it('parse số âm → null (chỉ chấp nhận ≥ 0)', () => {
    expect(parseVnd('-100')).toBeNull()
  })
})

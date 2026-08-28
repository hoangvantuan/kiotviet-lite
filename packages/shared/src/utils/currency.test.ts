import { describe, expect, it } from 'vitest'

import { formatCurrencyVnd, formatVnd, formatVndWithSuffix, parseVnd } from './currency.js'

describe('currency utils', () => {
  describe('formatVnd', () => {
    it('định dạng số tiền chuẩn VND', () => {
      expect(formatVnd(1_000_000)).toBe('1.000.000')
      expect(formatVnd(0)).toBe('0')
      expect(formatVnd(500)).toBe('500')
      expect(formatVnd(null)).toBe('')
      expect(formatVnd(undefined)).toBe('')
      expect(formatVnd(Number.NaN)).toBe('')
    })
  })

  describe('formatVndWithSuffix', () => {
    it('định dạng kèm hậu tố mặc định hoặc tùy chỉnh', () => {
      expect(formatVndWithSuffix(1_000_000)).toBe('1.000.000 đ')
      expect(formatVndWithSuffix(1_000_000, 'đ')).toBe('1.000.000đ')
      expect(formatVndWithSuffix(null)).toBe('')
    })
  })

  describe('formatCurrencyVnd', () => {
    it('luôn trả về chuỗi có đuôi đ', () => {
      expect(formatCurrencyVnd(1_000_000)).toBe('1.000.000đ')
      expect(formatCurrencyVnd(0)).toBe('0đ')
      expect(formatCurrencyVnd(null)).toBe('0đ')
    })
  })

  describe('parseVnd', () => {
    it('phân tích chuỗi số tiền hợp lệ', () => {
      expect(parseVnd('1.000.000')).toBe(1000000)
      expect(parseVnd('100,000')).toBe(100000)
      expect(parseVnd('50000đ')).toBe(50000)
      expect(parseVnd('0')).toBe(0)
    })

    it('trả về null khi chuỗi không hợp lệ hoặc âm', () => {
      expect(parseVnd('')).toBeNull()
      expect(parseVnd('abc')).toBeNull()
      expect(parseVnd('-5000')).toBeNull()
    })
  })
})

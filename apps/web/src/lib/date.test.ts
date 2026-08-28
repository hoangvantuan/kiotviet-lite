import { describe, expect, it } from 'vitest'

import { formatDate, formatDateTime } from './date'

describe('date utils', () => {
  describe('formatDate', () => {
    it('định dạng ngày từ chuỗi YYYY-MM-DD', () => {
      expect(formatDate('2026-08-28')).toBe('28/08/2026')
      expect(formatDate('2026-01-05')).toBe('05/01/2026')
    })

    it('định dạng ngày từ chuỗi ISO timestamp', () => {
      const formatted = formatDate('2026-08-28T10:30:00.000Z')
      expect(formatted).toMatch(/\d{2}\/\d{2}\/2026/)
    })

    it('xử lý chuỗi rỗng / null / undefined', () => {
      expect(formatDate('')).toBe('')
      expect(formatDate(null)).toBe('')
      expect(formatDate(undefined)).toBe('')
    })
  })

  describe('formatDateTime', () => {
    it('định dạng ngày giờ có đủ giờ phút ngày tháng năm', () => {
      const formatted = formatDateTime('2026-08-28T10:30:00.000Z')
      expect(formatted).toBeTruthy()
      expect(formatted).toContain('2026')
    })

    it('xử lý chuỗi rỗng / null / undefined', () => {
      expect(formatDateTime('')).toBe('')
      expect(formatDateTime(null)).toBe('')
      expect(formatDateTime(undefined)).toBe('')
    })
  })
})

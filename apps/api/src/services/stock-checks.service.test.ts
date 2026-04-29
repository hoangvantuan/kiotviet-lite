import { describe, expect, it } from 'vitest'

import {
  __TEST_ONLY__,
  formatStockCheckDateForCode,
  recomputeStockCheckTotals,
} from './stock-checks.service.js'

const { incrementCodeSequence } = __TEST_ONLY__

describe('recomputeStockCheckTotals', () => {
  it('mảng rỗng → totals = 0', () => {
    const r = recomputeStockCheckTotals([])
    expect(r).toEqual({ totalItems: 0, totalDiffPositive: 0, totalDiffNegative: 0 })
  })

  it('chỉ diff dương → totalDiffPositive = sum, negative = 0', () => {
    const r = recomputeStockCheckTotals([{ diff: 5 }, { diff: 3 }])
    expect(r.totalItems).toBe(2)
    expect(r.totalDiffPositive).toBe(8)
    expect(r.totalDiffNegative).toBe(0)
  })

  it('chỉ diff âm → totalDiffNegative = abs(sum), positive = 0', () => {
    const r = recomputeStockCheckTotals([{ diff: -2 }, { diff: -7 }])
    expect(r.totalItems).toBe(2)
    expect(r.totalDiffPositive).toBe(0)
    expect(r.totalDiffNegative).toBe(9)
  })

  it('lẫn dương âm và bằng 0 → tách đúng', () => {
    const r = recomputeStockCheckTotals([{ diff: 4 }, { diff: -3 }, { diff: 0 }, { diff: 1 }])
    expect(r.totalItems).toBe(4)
    expect(r.totalDiffPositive).toBe(5)
    expect(r.totalDiffNegative).toBe(3)
  })
})

describe('formatStockCheckDateForCode', () => {
  it('trả YYYYMMDD theo timezone Asia/Ho_Chi_Minh', () => {
    // 2026-01-15 10:00 UTC = 2026-01-15 17:00 ICT
    const r = formatStockCheckDateForCode(new Date('2026-01-15T10:00:00Z'))
    expect(r).toBe('20260115')
  })

  it('xử lý đúng ranh giới ngày qua midnight ICT', () => {
    // 2026-01-15 18:00 UTC = 2026-01-16 01:00 ICT
    const r = formatStockCheckDateForCode(new Date('2026-01-15T18:00:00Z'))
    expect(r).toBe('20260116')
  })
})

describe('incrementCodeSequence (retry on 23505)', () => {
  it('tăng sequence chính xác', () => {
    expect(incrementCodeSequence('KK-20260101-0001')).toBe('KK-20260101-0002')
    expect(incrementCodeSequence('KK-20260101-0099')).toBe('KK-20260101-0100')
    expect(incrementCodeSequence('KK-20260101-0999')).toBe('KK-20260101-1000')
  })

  it('giữ nguyên prefix khi tăng', () => {
    expect(incrementCodeSequence('KK-20260101-0500')).toMatch(/^KK-20260101-/)
  })

  it('throw khi vượt quá 9999', () => {
    expect(() => incrementCodeSequence('KK-20260101-9999')).toThrowError(/9999 phiếu kiểm kho/)
  })

  it('chuỗi nhiều lần liên tiếp giữ format pad-zero 4 chữ số', () => {
    let code = 'KK-20260101-0001'
    for (let i = 0; i < 10; i++) {
      code = incrementCodeSequence(code)
    }
    expect(code).toBe('KK-20260101-0011')
    expect(code.slice(-4)).toMatch(/^\d{4}$/)
  })
})

describe('applyStockCheck (recomputeStockCheckTotals integer arithmetic + edge)', () => {
  it('integer arithmetic chính xác với diff lớn', () => {
    const r = recomputeStockCheckTotals([{ diff: 1_000_000 }, { diff: -500_000 }, { diff: 2_500 }])
    expect(r.totalDiffPositive).toBe(1_002_500)
    expect(r.totalDiffNegative).toBe(500_000)
    expect(r.totalItems).toBe(3)
  })

  it('edge: tất cả diff=0 → SKIP equivalent (positive=0, negative=0, totalItems giữ count)', () => {
    const r = recomputeStockCheckTotals([{ diff: 0 }, { diff: 0 }, { diff: 0 }])
    expect(r.totalDiffPositive).toBe(0)
    expect(r.totalDiffNegative).toBe(0)
    expect(r.totalItems).toBe(3)
  })

  it('edge: hỗn hợp diff=0 + dương + âm → diff=0 không cộng vào tổng', () => {
    const r = recomputeStockCheckTotals([{ diff: 0 }, { diff: 3 }, { diff: 0 }, { diff: -1 }])
    expect(r.totalDiffPositive).toBe(3)
    expect(r.totalDiffNegative).toBe(1)
    expect(r.totalItems).toBe(4)
  })
})

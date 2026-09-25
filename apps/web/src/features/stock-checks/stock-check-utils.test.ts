import { describe, expect, it } from 'vitest'

import { ApiClientError } from '@/lib/api-client'

import {
  computeStockCheckTotals,
  formatConfirmStockCheckError,
  formatDiff,
} from './stock-check-utils'

describe('computeStockCheckTotals', () => {
  it('tính tổng tăng giảm và unchanged đúng', () => {
    const result = computeStockCheckTotals([
      { systemQty: 10, actualQty: 12 },
      { systemQty: 5, actualQty: 3 },
      { systemQty: 8, actualQty: 8 },
    ])
    expect(result.totalDiffPositive).toBe(2)
    expect(result.totalDiffNegative).toBe(2)
    expect(result.unchangedCount).toBe(1)
    expect(result.changedCount).toBe(2)
  })

  it('items rỗng trả về tất cả 0', () => {
    const result = computeStockCheckTotals([])
    expect(result.totalDiffPositive).toBe(0)
    expect(result.totalDiffNegative).toBe(0)
    expect(result.unchangedCount).toBe(0)
    expect(result.changedCount).toBe(0)
  })

  it('integer arithmetic không bị floating', () => {
    const result = computeStockCheckTotals([
      { systemQty: 100, actualQty: 99 },
      { systemQty: 200, actualQty: 201 },
    ])
    expect(result.totalDiffPositive).toBe(1)
    expect(result.totalDiffNegative).toBe(1)
  })
})

describe('formatDiff', () => {
  it('số dương có prefix + và class xanh', () => {
    const r = formatDiff(5)
    expect(r.text).toBe('+5')
    expect(r.className).toContain('green')
  })

  it('số âm class đỏ', () => {
    const r = formatDiff(-3)
    expect(r.text).toBe('-3')
    expect(r.className).toContain('red')
  })

  it('số 0 class xám', () => {
    const r = formatDiff(0)
    expect(r.text).toBe('0')
    expect(r.className).toContain('gray')
  })
})

describe('formatConfirmStockCheckError', () => {
  it('KHO-02: tồn đổi sau lúc đếm → liệt kê dòng cần đếm lại kèm số lúc đếm và số hiện tại', () => {
    const err = new ApiClientError(422, {
      code: 'BUSINESS_RULE_VIOLATION',
      message: 'Tồn kho đã thay đổi sau lúc đếm',
      details: {
        code: 'STOCK_CHANGED_SINCE_COUNT',
        items: [
          { productName: 'Oishi Cay', variantLabel: null, systemQty: 12, currentStock: 17 },
          { productName: 'Áo thun', variantLabel: 'Đỏ / M', systemQty: 3, currentStock: 1 },
        ],
      },
    })
    const msg = formatConfirmStockCheckError(err)
    expect(msg).toContain('• Oishi Cay (lúc đếm 12, hiện 17)')
    expect(msg).toContain('• Áo thun - Đỏ / M (lúc đếm 3, hiện 1)')
    expect(msg).toMatch(/đếm lại/)
  })

  it('Tồn âm vẫn hiển thị danh sách như cũ', () => {
    const err = new ApiClientError(422, {
      code: 'BUSINESS_RULE_VIOLATION',
      message: 'x',
      details: { code: 'NEGATIVE_STOCK', items: [{ productName: 'A', wouldBe: -2 }] },
    })
    expect(formatConfirmStockCheckError(err)).toBe('Tồn sẽ âm sau khi xác nhận:\n• A (sẽ còn -2)')
  })

  it('Lỗi khác: dùng thông báo từ máy chủ, lỗi không rõ: thông báo mặc định', () => {
    const err = new ApiClientError(409, { code: 'CONFLICT', message: 'Phiếu đã xác nhận' })
    expect(formatConfirmStockCheckError(err)).toBe('Phiếu đã xác nhận')
    expect(formatConfirmStockCheckError(new Error('boom'))).toBe('Không xác nhận được phiếu kiểm')
  })
})

import { describe, expect, it } from 'vitest'

import { parseRecalcArgs } from './recalc-purchase-cost.args.js'

describe('parseRecalcArgs (cost:recalc)', () => {
  it('Mặc định chạy thử cả DB', () => {
    expect(parseRecalcArgs([])).toEqual({
      apply: false,
      applyVariantParent: false,
      json: false,
      storeId: undefined,
    })
  })

  it('Đọc --store và các cờ, bỏ qua "--" của pnpm', () => {
    expect(parseRecalcArgs(['--', '--store', 'abc', '--apply', '--apply-variant-parent'])).toEqual({
      apply: true,
      applyVariantParent: true,
      json: false,
      storeId: 'abc',
    })
  })

  it('--store đứng cuối thiếu giá trị → lỗi, không chạy cả DB', () => {
    expect(() => parseRecalcArgs(['--store'])).toThrow(/--store thiếu storeId/)
  })

  it('--store nuốt cờ đứng sau → lỗi, không bỏ mất --apply', () => {
    expect(() => parseRecalcArgs(['--store', '--apply'])).toThrow(/--store thiếu storeId/)
  })

  it('Cờ lạ (gõ sai) → lỗi', () => {
    expect(() => parseRecalcArgs(['--aply'])).toThrow(/Tham số không hợp lệ/)
  })
})

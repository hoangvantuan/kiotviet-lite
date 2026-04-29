import { describe, expect, it } from 'vitest'

import { replaceVolumePricesSchema } from './volume-price-management.js'

describe('replaceVolumePricesSchema', () => {
  it('chấp nhận 0 tier (xoá hết)', () => {
    const r = replaceVolumePricesSchema.safeParse({ tiers: [] })
    expect(r.success).toBe(true)
  })

  it('chấp nhận default tiers = []', () => {
    const r = replaceVolumePricesSchema.safeParse({})
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.tiers).toEqual([])
  })

  it('chấp nhận 5 tier hợp lệ giảm dần', () => {
    const r = replaceVolumePricesSchema.safeParse({
      tiers: [
        { minQty: 1, price: 50000 },
        { minQty: 10, price: 45000 },
        { minQty: 50, price: 40000 },
        { minQty: 100, price: 35000 },
        { minQty: 200, price: 30000 },
      ],
    })
    expect(r.success).toBe(true)
  })

  it('reject 6 tier', () => {
    const r = replaceVolumePricesSchema.safeParse({
      tiers: [
        { minQty: 1, price: 60000 },
        { minQty: 10, price: 55000 },
        { minQty: 50, price: 50000 },
        { minQty: 100, price: 45000 },
        { minQty: 200, price: 40000 },
        { minQty: 500, price: 35000 },
      ],
    })
    expect(r.success).toBe(false)
  })

  it('reject duplicate minQty', () => {
    const r = replaceVolumePricesSchema.safeParse({
      tiers: [
        { minQty: 10, price: 50000 },
        { minQty: 10, price: 45000 },
      ],
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      const issue = r.error.issues.find((i) => /trùng/i.test(i.message))
      expect(issue).toBeDefined()
    }
  })

  it('reject giá KHÔNG giảm dần (giữ nguyên)', () => {
    const r = replaceVolumePricesSchema.safeParse({
      tiers: [
        { minQty: 1, price: 50000 },
        { minQty: 10, price: 45000 },
        { minQty: 50, price: 45000 },
      ],
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      const issue = r.error.issues.find((i) => /giảm dần/i.test(i.message))
      expect(issue).toBeDefined()
    }
  })

  it('reject giá tăng theo số lượng', () => {
    const r = replaceVolumePricesSchema.safeParse({
      tiers: [
        { minQty: 1, price: 30000 },
        { minQty: 10, price: 50000 },
      ],
    })
    expect(r.success).toBe(false)
  })

  it('reject minQty = 0', () => {
    const r = replaceVolumePricesSchema.safeParse({
      tiers: [{ minQty: 0, price: 50000 }],
    })
    expect(r.success).toBe(false)
  })

  it('reject minQty âm', () => {
    const r = replaceVolumePricesSchema.safeParse({
      tiers: [{ minQty: -1, price: 50000 }],
    })
    expect(r.success).toBe(false)
  })

  it('reject price âm', () => {
    const r = replaceVolumePricesSchema.safeParse({
      tiers: [{ minQty: 1, price: -1 }],
    })
    expect(r.success).toBe(false)
  })

  it('chấp nhận thứ tự gửi không sort - validate sau khi sort minQty ASC', () => {
    const r = replaceVolumePricesSchema.safeParse({
      tiers: [
        { minQty: 50, price: 40000 },
        { minQty: 1, price: 50000 },
        { minQty: 10, price: 45000 },
      ],
    })
    expect(r.success).toBe(true)
  })
})

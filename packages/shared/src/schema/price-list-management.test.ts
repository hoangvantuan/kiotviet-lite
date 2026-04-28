import { describe, expect, it } from 'vitest'

import {
  createPriceListSchema,
  listPriceListsQuerySchema,
  priceSchema,
  updatePriceListItemSchema,
  updatePriceListSchema,
} from './price-list-management.js'

describe('createPriceListSchema (discriminated union)', () => {
  it('chấp nhận direct hợp lệ', () => {
    const result = createPriceListSchema.safeParse({
      method: 'direct',
      name: 'Bảng giá VIP',
      roundingRule: 'nearest_thousand',
      items: [{ productId: '00000000-0000-7000-8000-000000000001', price: 50000 }],
    })
    expect(result.success).toBe(true)
  })

  it('direct kèm baseListId được strip (Zod discriminated union ignore extra)', () => {
    const result = createPriceListSchema.safeParse({
      method: 'direct',
      name: 'X',
      baseListId: '00000000-0000-7000-8000-000000000001',
    })
    expect(result.success).toBe(true)
    if (result.success && result.data.method === 'direct') {
      expect((result.data as Record<string, unknown>).baseListId).toBeUndefined()
    }
  })

  it('chấp nhận formula hợp lệ', () => {
    const result = createPriceListSchema.safeParse({
      method: 'formula',
      name: 'Giá sỉ',
      baseListId: '00000000-0000-7000-8000-000000000001',
      formulaType: 'percent_decrease',
      formulaValue: 1000,
      roundingRule: 'ceil_thousand',
    })
    expect(result.success).toBe(true)
  })

  it('reject formula thiếu baseListId', () => {
    const result = createPriceListSchema.safeParse({
      method: 'formula',
      name: 'X',
      formulaType: 'percent_decrease',
      formulaValue: 1000,
    })
    expect(result.success).toBe(false)
  })

  it('reject effectiveTo < effectiveFrom', () => {
    const result = createPriceListSchema.safeParse({
      method: 'direct',
      name: 'X',
      effectiveFrom: '2026-12-01',
      effectiveTo: '2026-01-01',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('effectiveTo'))
      expect(issue).toBeDefined()
    }
  })

  it('reject method missing', () => {
    const result = createPriceListSchema.safeParse({ name: 'X' })
    expect(result.success).toBe(false)
  })

  it('reject tên trống', () => {
    const result = createPriceListSchema.safeParse({ method: 'direct', name: '   ' })
    expect(result.success).toBe(false)
  })

  it('reject tên chứa ký tự không hợp lệ', () => {
    const result = createPriceListSchema.safeParse({ method: 'direct', name: 'X<script>' })
    expect(result.success).toBe(false)
  })

  it('default items = [] cho direct', () => {
    const result = createPriceListSchema.safeParse({ method: 'direct', name: 'X' })
    expect(result.success).toBe(true)
    if (result.success && result.data.method === 'direct') {
      expect(result.data.items).toEqual([])
    }
  })
})

describe('priceSchema', () => {
  it('chấp nhận 0', () => {
    expect(priceSchema.safeParse(0).success).toBe(true)
  })

  it('reject âm', () => {
    expect(priceSchema.safeParse(-100).success).toBe(false)
  })

  it('reject decimal', () => {
    expect(priceSchema.safeParse(100.5).success).toBe(false)
  })
})

describe('updatePriceListSchema', () => {
  it('reject empty object', () => {
    const result = updatePriceListSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('chấp nhận 1 field', () => {
    const result = updatePriceListSchema.safeParse({ name: 'New name' })
    expect(result.success).toBe(true)
  })

  it('reject effectiveTo < effectiveFrom', () => {
    const result = updatePriceListSchema.safeParse({
      effectiveFrom: '2026-12-01',
      effectiveTo: '2026-01-01',
    })
    expect(result.success).toBe(false)
  })

  it('strict: reject key lạ (method, baseListId, ...)', () => {
    const r1 = updatePriceListSchema.safeParse({ name: 'X', method: 'formula' })
    expect(r1.success).toBe(false)
    const r2 = updatePriceListSchema.safeParse({
      name: 'X',
      baseListId: '00000000-0000-7000-8000-000000000001',
    })
    expect(r2.success).toBe(false)
  })
})

describe('updatePriceListItemSchema', () => {
  it('chấp nhận price ≥ 0', () => {
    expect(updatePriceListItemSchema.safeParse({ price: 50000 }).success).toBe(true)
  })

  it('reject price âm', () => {
    expect(updatePriceListItemSchema.safeParse({ price: -1 }).success).toBe(false)
  })
})

describe('listPriceListsQuerySchema', () => {
  it('default page=1, pageSize=20, status=all', () => {
    const result = listPriceListsQuerySchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(1)
      expect(result.data.pageSize).toBe(20)
      expect(result.data.status).toBe('all')
    }
  })

  it('coerce string sang number', () => {
    const result = listPriceListsQuerySchema.safeParse({ page: '3', pageSize: '50' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(3)
      expect(result.data.pageSize).toBe(50)
    }
  })

  it('reject pageSize > 100', () => {
    expect(listPriceListsQuerySchema.safeParse({ pageSize: 200 }).success).toBe(false)
  })
})

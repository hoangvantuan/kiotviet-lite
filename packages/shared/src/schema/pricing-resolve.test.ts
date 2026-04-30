import { describe, expect, it } from 'vitest'

import { resolvedPriceItemSchema, resolvePricesSchema } from './pricing-resolve.js'

const VALID_UUID = '01234567-89ab-cdef-0123-456789abcdef'
const VALID_UUID2 = 'abcdefab-1234-5678-9abc-def012345678'

describe('resolvePricesSchema', () => {
  it('accepts valid input with customerId and items', () => {
    const input = {
      customerId: VALID_UUID,
      items: [{ productId: VALID_UUID2, quantity: 5 }],
    }
    const result = resolvePricesSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('accepts null customerId', () => {
    const input = {
      customerId: null,
      items: [{ productId: VALID_UUID, quantity: 1 }],
    }
    const result = resolvePricesSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('accepts omitted customerId', () => {
    const input = {
      items: [{ productId: VALID_UUID, quantity: 1 }],
    }
    const result = resolvePricesSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('rejects empty items array', () => {
    const input = { customerId: null, items: [] }
    const result = resolvePricesSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects items with quantity 0', () => {
    const input = {
      items: [{ productId: VALID_UUID, quantity: 0 }],
    }
    const result = resolvePricesSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects items with negative quantity', () => {
    const input = {
      items: [{ productId: VALID_UUID, quantity: -1 }],
    }
    const result = resolvePricesSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects invalid productId', () => {
    const input = {
      items: [{ productId: 'not-a-uuid', quantity: 1 }],
    }
    const result = resolvePricesSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects more than 100 items', () => {
    const items = Array.from({ length: 101 }, () => ({
      productId: VALID_UUID,
      quantity: 1,
    }))
    const input = { items }
    const result = resolvePricesSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('accepts items with variantId', () => {
    const input = {
      items: [{ productId: VALID_UUID, variantId: VALID_UUID2, quantity: 3 }],
    }
    const result = resolvePricesSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('accepts items with null variantId', () => {
    const input = {
      items: [{ productId: VALID_UUID, variantId: null, quantity: 3 }],
    }
    const result = resolvePricesSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('rejects extra fields (strict)', () => {
    const input = {
      customerId: null,
      items: [{ productId: VALID_UUID, quantity: 1 }],
      extraField: 'bad',
    }
    const result = resolvePricesSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})

describe('resolvedPriceItemSchema', () => {
  it('accepts valid resolved price item', () => {
    const item = {
      productId: VALID_UUID,
      variantId: null,
      price: 50000,
      source: 'customer_price' as const,
      sourceDetail: 'Giá riêng cho KH Nguyễn Văn A',
    }
    const result = resolvedPriceItemSchema.safeParse(item)
    expect(result.success).toBe(true)
  })

  it('accepts retail_price source', () => {
    const item = {
      productId: VALID_UUID,
      variantId: null,
      price: 15000,
      source: 'retail_price' as const,
      sourceDetail: null,
    }
    const result = resolvedPriceItemSchema.safeParse(item)
    expect(result.success).toBe(true)
  })

  it('rejects invalid source', () => {
    const item = {
      productId: VALID_UUID,
      variantId: null,
      price: 15000,
      source: 'invalid_source',
      sourceDetail: null,
    }
    const result = resolvedPriceItemSchema.safeParse(item)
    expect(result.success).toBe(false)
  })
})

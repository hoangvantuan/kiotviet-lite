import { describe, expect, it } from 'vitest'

import { PRICE_SOURCE_LABELS, PRICE_SOURCES, type PriceSource } from './pricing.js'

describe('PRICE_SOURCES', () => {
  it('contains exactly 6 sources in priority order', () => {
    expect(PRICE_SOURCES).toHaveLength(6)
    expect(PRICE_SOURCES).toEqual([
      'customer_price',
      'category_discount',
      'manual_override',
      'volume_price',
      'price_list',
      'retail_price',
    ])
  })
})

describe('PRICE_SOURCE_LABELS', () => {
  it('has a Vietnamese label for every source', () => {
    for (const source of PRICE_SOURCES) {
      expect(PRICE_SOURCE_LABELS[source]).toBeTruthy()
      expect(typeof PRICE_SOURCE_LABELS[source]).toBe('string')
    }
  })

  it('labels are non-empty strings', () => {
    const entries = Object.entries(PRICE_SOURCE_LABELS)
    expect(entries).toHaveLength(6)
    for (const [, label] of entries) {
      expect(label.length).toBeGreaterThan(0)
    }
  })
})

describe('PriceSource type', () => {
  it('accepts valid sources', () => {
    const valid: PriceSource[] = [
      'customer_price',
      'category_discount',
      'manual_override',
      'volume_price',
      'price_list',
      'retail_price',
    ]
    expect(valid).toHaveLength(6)
  })
})

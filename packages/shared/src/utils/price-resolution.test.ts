import { describe, expect, it } from 'vitest'

import { resolvePriceFromSources } from './price-resolution.js'

describe('resolvePriceFromSources: nhãn giá theo số lượng (ADR-0015)', () => {
  it('ngưỡng số lẻ hiển thị theo vi-VN: "SL >= 2,5"', () => {
    const resolved = resolvePriceFromSources({
      product: { sellingPrice: 45_000 },
      variantSellingPrice: null,
      unitConversion: null,
      manualPriceList: null,
      customer: null,
      volumeTiers: [{ minQty: 2.5, price: 40_000 }],
      quantity: 2.5,
    })
    expect(resolved).toMatchObject({ price: 40_000, source: 'volume_price' })
    expect(resolved.sourceDetail).toBe('SL >= 2,5')
    expect(resolved.breakdown.find((b) => b.tier === 4)?.reason).toBe('SL >= 2,5: 40.000đ')
  })
})

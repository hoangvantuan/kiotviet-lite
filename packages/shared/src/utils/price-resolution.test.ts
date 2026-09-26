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

describe('resolvePriceFromSources: ngưỡng theo đơn vị cơ bản với số lẻ (POS-16, ADR-0015)', () => {
  const base = {
    product: { sellingPrice: 10_000 },
    variantSellingPrice: null,
    unitConversion: { conversionFactor: 24, sellingPrice: null },
    manualPriceList: null,
    customer: null,
    volumeTiers: [{ minQty: 12, price: 9_000 }],
  }

  it('0,5 thùng 24 = 12 đơn vị cơ bản đạt bậc giá minQty 12, 0,499 thùng thì chưa', () => {
    expect(resolvePriceFromSources({ ...base, quantity: 0.5 })).toMatchObject({
      price: 216_000,
      source: 'volume_price',
    })
    expect(resolvePriceFromSources({ ...base, quantity: 0.499 })).toMatchObject({
      price: 240_000,
      source: 'retail_price',
    })
  })

  it('chiết khấu danh mục minQty 12 đạt khi bán 0,5 thùng 24', () => {
    const resolved = resolvePriceFromSources({
      ...base,
      volumeTiers: [],
      quantity: 0.5,
      customer: {
        customerPrice: null,
        categoryDiscounts: [{ discountType: 'percent', discountValue: 10, minQty: 12 }],
        groupPriceList: null,
      },
    })
    expect(resolved).toMatchObject({ price: 216_000, source: 'category_discount' })
  })

  it('0,58 bao 50 kg = 29 kg đạt ngưỡng 29 (nhân float ra 28,999999999999996)', () => {
    const resolved = resolvePriceFromSources({
      ...base,
      unitConversion: { conversionFactor: 50, sellingPrice: null },
      volumeTiers: [{ minQty: 29, price: 9_000 }],
      quantity: 0.58,
    })
    expect(resolved).toMatchObject({ price: 450_000, source: 'volume_price' })
  })
})

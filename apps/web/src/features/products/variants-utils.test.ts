import { describe, expect, it } from 'vitest'

import {
  buildVariantName,
  buildVariantSku,
  cartesianProduct,
  mergeVariants,
  slugifyForSku,
} from './variants-utils'

describe('slugifyForSku', () => {
  it('xử lý dấu tiếng Việt', () => {
    expect(slugifyForSku('Cà phê đen')).toBe('ca-phe-den')
  })
  it('xử lý đ → d', () => {
    expect(slugifyForSku('Đỏ')).toBe('do')
  })
  it('xử lý space + underscore', () => {
    expect(slugifyForSku('Size  M_Plus')).toBe('size-m-plus')
  })
  it('rỗng cho ký tự đặc biệt thuần', () => {
    expect(slugifyForSku('!!!')).toBe('')
  })
})

describe('buildVariantSku', () => {
  it('1 giá trị', () => {
    expect(buildVariantSku('AT-001', 'Đỏ', null, 0)).toBe('AT-001-do')
  })
  it('2 giá trị', () => {
    expect(buildVariantSku('AT-001', 'Đỏ', 'L', 0)).toBe('AT-001-do-l')
  })
  it('fallback V{index} khi slug rỗng', () => {
    expect(buildVariantSku('AT-001', '!!!', null, 2)).toBe('AT-001-V3')
  })
})

describe('buildVariantName', () => {
  it('1 thuộc tính', () => {
    expect(buildVariantName('Đỏ', null)).toBe('Đỏ')
  })
  it('2 thuộc tính', () => {
    expect(buildVariantName('Đỏ', 'L')).toBe('Đỏ - L')
  })
})

describe('cartesianProduct', () => {
  it('2 thuộc tính', () => {
    const r = cartesianProduct(['Đỏ', 'Xanh'], ['S', 'M'])
    expect(r).toHaveLength(4)
    expect(r).toEqual([
      { v1: 'Đỏ', v2: 'S' },
      { v1: 'Đỏ', v2: 'M' },
      { v1: 'Xanh', v2: 'S' },
      { v1: 'Xanh', v2: 'M' },
    ])
  })
  it('1 thuộc tính (b undefined)', () => {
    const r = cartesianProduct(['Đỏ'])
    expect(r).toEqual([{ v1: 'Đỏ', v2: null }])
  })
})

describe('mergeVariants', () => {
  it('giữ id và giá khi combo trùng', () => {
    const existing = [
      {
        id: 'id-1',
        sku: 'AT-001-do-s',
        barcode: '',
        attribute1Value: 'Đỏ',
        attribute2Value: 'S',
        sellingPrice: 100000,
        costPrice: null,
        stockQuantity: 10,
        status: 'active' as const,
      },
    ]
    const combos = cartesianProduct(['Đỏ'], ['S', 'M'])
    const merged = mergeVariants({
      existing,
      combos,
      parentSku: 'AT-001',
      defaultSellingPrice: 50000,
      defaultCostPrice: null,
    })
    expect(merged[0]?.id).toBe('id-1')
    expect(merged[0]?.sellingPrice).toBe(100000)
    expect(merged[1]?._isNew).toBe(true)
    expect(merged[1]?.sellingPrice).toBe(50000)
  })

  it('mark _pendingDelete cho combo bị xoá có id', () => {
    const existing = [
      {
        id: 'id-1',
        sku: 'AT-001-do-s',
        barcode: '',
        attribute1Value: 'Đỏ',
        attribute2Value: 'S',
        sellingPrice: 100000,
        costPrice: null,
        stockQuantity: 10,
        status: 'active' as const,
      },
    ]
    const combos = cartesianProduct(['Xanh'], ['S'])
    const merged = mergeVariants({
      existing,
      combos,
      parentSku: 'AT-001',
      defaultSellingPrice: 50000,
      defaultCostPrice: null,
    })
    const pending = merged.find((m) => m._pendingDelete)
    expect(pending?.id).toBe('id-1')
  })
})

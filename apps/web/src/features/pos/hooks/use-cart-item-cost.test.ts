import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/api-client', () => ({ apiClient: { get } }))

import { deriveCartItemCost, fetchCartItemCostPrice } from './use-cart-item-cost'

const product = {
  id: 'prod-coke',
  sku: 'COKE',
  costPrice: 7_000,
  variants: [
    { id: 'var-can', costPrice: 6_500 },
    { id: 'var-bottle', costPrice: null },
  ],
}

describe('nạp lại giá vốn cho dòng giỏ vừa khôi phục', () => {
  beforeEach(() => {
    get.mockReset()
  })

  it('tìm theo SKU và lấy giá vốn biến thể, thiếu thì lấy của sản phẩm', async () => {
    get.mockResolvedValue({ data: [{ id: 'khac', variants: [], costPrice: 1 }, product] })

    await expect(
      fetchCartItemCostPrice({ productId: 'prod-coke', variantId: null, sku: 'COKE' }),
    ).resolves.toBe(7_000)
    expect(get).toHaveBeenCalledWith('/api/v1/pos/products/search?q=COKE')
    await expect(
      fetchCartItemCostPrice({ productId: 'prod-coke', variantId: 'var-can', sku: 'COKE-C' }),
    ).resolves.toBe(6_500)
    await expect(
      fetchCartItemCostPrice({ productId: 'prod-coke', variantId: 'var-bottle', sku: 'COKE-B' }),
    ).resolves.toBe(7_000)
  })

  it('sản phẩm hay biến thể không còn thì trả undefined, không phải 0', async () => {
    get.mockResolvedValue({ data: [product] })
    await expect(
      fetchCartItemCostPrice({ productId: 'da-xoa', variantId: null, sku: 'X' }),
    ).resolves.toBeUndefined()
    await expect(
      fetchCartItemCostPrice({ productId: 'prod-coke', variantId: 'da-xoa', sku: 'X' }),
    ).resolves.toBeUndefined()
  })

  it('giá vốn chưa nạp (undefined) không bao giờ hiện như giá vốn 0', () => {
    const restored = { costPrice: undefined }
    expect(deriveCartItemCost(restored, { fetched: undefined, loading: true })).toEqual({
      status: 'loading',
    })
    expect(deriveCartItemCost(restored, { fetched: undefined, loading: false })).toEqual({
      status: 'unavailable',
    })
    expect(deriveCartItemCost(restored, { fetched: 7_000, loading: false })).toEqual({
      status: 'known',
      costPrice: 7_000,
    })
    expect(deriveCartItemCost(restored, { fetched: null, loading: false })).toEqual({
      status: 'none',
    })
  })

  it('giá vốn có sẵn trong giỏ được dùng thẳng, kể cả 0 và null', () => {
    const remote = { fetched: 9_999, loading: false }
    expect(deriveCartItemCost({ costPrice: 0 }, remote)).toEqual({ status: 'known', costPrice: 0 })
    expect(deriveCartItemCost({ costPrice: null }, remote)).toEqual({ status: 'none' })
  })
})

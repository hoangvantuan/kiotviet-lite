import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useCartStore } from '@/stores/use-cart-store'

import * as pricingApi from '../pos-pricing-api'
import type { PosProductItem } from '../types'
import { addToCartAction } from './use-add-to-cart'
import { resetRepriceSequence } from './use-auto-reprice'

vi.mock('../pos-pricing-api', () => ({
  resolvePricesApi: vi.fn().mockResolvedValue({ data: [] }),
}))

describe('useAddToCart (M14 & M18)', () => {
  beforeEach(() => {
    resetRepriceSequence()
    useCartStore.getState().clearCart()
    vi.clearAllMocks()
  })

  const mockProduct: PosProductItem = {
    id: 'prod-1',
    name: 'Sản phẩm thử nghiệm',
    sku: 'SKU-001',
    barcode: '8930000000001',
    unit: 'Cái',
    basePrice: 50_000,
    costPrice: 30_000,
    imageUrl: null,
    trackInventory: true,
    stockQuantity: 15,
    hasVariants: false,
    categoryId: null,
    variants: [],
    unitConversions: [
      {
        id: 'uc-thung',
        unit: 'Thùng',
        conversionFactor: 10,
        sellingPrice: 480_000,
      },
    ],
  }

  it('M18: Thêm sản phẩm đơn truyền đầy đủ trackInventory và stockQuantity vào giỏ hàng', () => {
    addToCartAction({ product: mockProduct, quantity: 2 })

    const cartItems = useCartStore.getState().tabs[1]?.items ?? []
    expect(cartItems).toHaveLength(1)
    const item = cartItems[0]!
    expect(item.id).toBe('prod-1')
    expect(item.trackInventory).toBe(true)
    expect(item.stockQuantity).toBe(15)
    expect(item.unitPrice).toBe(50_000)
    expect(item.quantity).toBe(2)
  })

  it('M18: Thêm sản phẩm với đơn vị quy đổi tính đúng stockQuantity theo conversionFactor', () => {
    addToCartAction({
      product: mockProduct,
      unitConversion: mockProduct.unitConversions[0],
      quantity: 1,
    })

    const cartItems = useCartStore.getState().tabs[1]?.items ?? []
    expect(cartItems).toHaveLength(1)
    const item = cartItems[0]!
    expect(item.id).toBe('prod-1-uc-thung')
    expect(item.trackInventory).toBe(true)
    // stockQuantity = Math.floor(15 / 10) = 1 thùng
    expect(item.stockQuantity).toBe(1)
    expect(item.unitPrice).toBe(480_000)
    expect(item.unitName).toBe('Thùng')
    expect(item.unitConversionId).toBe('uc-thung')
  })

  it('M14: Thêm sản phẩm tự động trigger repriceOnAdd với payload đúng', () => {
    addToCartAction({ product: mockProduct, quantity: 3 })

    expect(pricingApi.resolvePricesApi).toHaveBeenCalledTimes(1)
    expect(pricingApi.resolvePricesApi).toHaveBeenCalledWith({
      customerId: null,
      items: [
        {
          productId: 'prod-1',
          variantId: null,
          unitConversionId: null,
          quantity: 3,
        },
      ],
    })
  })
})

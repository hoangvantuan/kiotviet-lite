import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useCartStore } from '@/stores/use-cart-store'
import { useOfflineStore } from '@/stores/use-offline-store'

import { addToCartAction } from './hooks/use-add-to-cart'
import { resetRepriceSequence } from './hooks/use-auto-reprice'
import type { PosProductItem } from './types'

// Khi ngoại tuyến, API định giá phía máy chủ sẽ lỗi hoặc không thể gọi
vi.mock('./pos-pricing-api', () => ({
  resolvePricesApi: vi.fn().mockRejectedValue(new Error('Network error: offline')),
}))

describe('POS Ngoại tuyến: Giữ giá trên từng dòng và cảnh báo giá', () => {
  beforeEach(() => {
    resetRepriceSequence()
    useCartStore.getState().clearCart()
    useOfflineStore.getState().setStatus('online')
    vi.clearAllMocks()
  })

  const mockProduct: PosProductItem = {
    id: 'prod-offline-1',
    name: 'Sản phẩm bán offline',
    sku: 'SKU-OFF-01',
    barcode: '8930000000010',
    unit: 'Chai',
    basePrice: 45_000,
    costPrice: 30_000,
    imageUrl: null,
    trackInventory: true,
    stockQuantity: 20,
    hasVariants: false,
    categoryId: null,
    variants: [],
    unitConversions: [
      {
        id: 'uc-loc-6',
        unit: 'Lốc 6',
        conversionFactor: 6,
        sellingPrice: 260_000,
      },
    ],
  }

  it('1. useOfflineStore phản ánh trạng thái offline chính xác', () => {
    expect(useOfflineStore.getState().status).toBe('online')

    useOfflineStore.getState().setStatus('offline')
    expect(useOfflineStore.getState().status).toBe('offline')
  })

  it('2. Khi ngoại tuyến, thêm sản phẩm giữ nguyên giá hiển thị và nguồn giá retail_price', async () => {
    useOfflineStore.getState().setStatus('offline')

    addToCartAction({ product: mockProduct, quantity: 2 })

    // Đợi promise resolvePricesApi reject
    await new Promise((r) => setTimeout(r, 50))

    const tab = useCartStore.getState().tabs[1]
    expect(tab?.items).toHaveLength(1)
    const item = tab!.items[0]!
    expect(item.unitPrice).toBe(45_000)
    expect(item.quantity).toBe(2)
    expect(item.lineTotal).toBe(90_000)
    expect(item.priceSource).toBe('retail_price')
  })

  it('3. Khi ngoại tuyến, đổi đơn vị quy đổi tính giá cục bộ và giữ nguyên giá', async () => {
    useOfflineStore.getState().setStatus('offline')

    addToCartAction({ product: mockProduct, quantity: 1 })
    const itemId = 'prod-offline-1'

    useCartStore.getState().changeItemUnit(itemId, 'uc-loc-6')

    await new Promise((r) => setTimeout(r, 50))

    const tab = useCartStore.getState().tabs[1]
    expect(tab?.items).toHaveLength(1)
    const item = tab!.items[0]!
    expect(item.unitName).toBe('Lốc 6')
    expect(item.unitPrice).toBe(260_000)
    expect(item.lineTotal).toBe(260_000)
  })

  it('4. Khi ngoại tuyến, chọn khách hàng không xóa hay làm mất giá đã hiển thị', async () => {
    useOfflineStore.getState().setStatus('offline')

    addToCartAction({ product: mockProduct, quantity: 3 })
    expect(useCartStore.getState().tabs[1]?.items[0]?.unitPrice).toBe(45_000)

    useCartStore.getState().setCustomer({
      id: 'cust-vip-1',
      name: 'Khách VIP Offline',
      groupId: null,
      groupName: null,
    })

    // Auto reprice debounce 200ms
    await new Promise((r) => setTimeout(r, 250))

    const tab = useCartStore.getState().tabs[1]
    const item = tab!.items[0]!
    // Giá vẫn được bảo toàn dù resolvePricesApi bị lỗi do ngoại tuyến
    expect(item.unitPrice).toBe(45_000)
    expect(item.lineTotal).toBe(135_000)
  })
})

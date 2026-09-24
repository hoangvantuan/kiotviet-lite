import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useCartStore } from '@/stores/use-cart-store'
import { useOfflineStore } from '@/stores/use-offline-store'

import {
  applyResults,
  repriceOnAddAction,
  resetRepriceSequence,
  resolvePricesInBatches,
} from './hooks/use-auto-reprice'
import * as pricingApi from './pos-pricing-api'

vi.mock('./pos-pricing-api', () => ({
  resolvePricesApi: vi.fn(),
  listPosPriceListsApi: vi.fn(),
  usePosPriceLists: vi.fn(),
}))

describe('Issue #35: POS Price List Selection & Auto-Reprice Unit Tests', () => {
  beforeEach(() => {
    resetRepriceSequence()
    useCartStore.getState().clearCart()
    useCartStore.getState().setActiveTab(1)
    useOfflineStore.getState().setStatus('online')
    vi.clearAllMocks()
  })

  describe('1. useCartStore Price List State & Tab Isolation', () => {
    it('initializes tabs with null priceListId and priceListName', () => {
      const tab1 = useCartStore.getState().tabs[1]
      expect(tab1?.priceListId).toBeNull()
      expect(tab1?.priceListName).toBeNull()
    })

    it('setPriceList sets price list on active tab without affecting other tabs', () => {
      useCartStore.getState().setActiveTab(1)
      useCartStore.getState().setPriceList({ id: 'pl-wholesale-1', name: 'Bảng giá sỉ' })

      expect(useCartStore.getState().tabs[1]?.priceListId).toBe('pl-wholesale-1')
      expect(useCartStore.getState().tabs[1]?.priceListName).toBe('Bảng giá sỉ')

      // Tab 2 must remain default
      expect(useCartStore.getState().tabs[2]?.priceListId).toBeNull()
      expect(useCartStore.getState().tabs[2]?.priceListName).toBeNull()

      // Set different price list on Tab 2
      useCartStore.getState().setActiveTab(2)
      useCartStore.getState().setPriceList({ id: 'pl-vip-2', name: 'Bảng giá VIP' })
      expect(useCartStore.getState().tabs[2]?.priceListId).toBe('pl-vip-2')
      expect(useCartStore.getState().tabs[1]?.priceListId).toBe('pl-wholesale-1')
    })

    it('switching customer preserves manual price list selection on the tab', () => {
      useCartStore.getState().setActiveTab(1)
      useCartStore.getState().setPriceList({ id: 'pl-wholesale-1', name: 'Bảng giá sỉ' })
      useCartStore.getState().setCustomer({
        id: 'cust-1',
        name: 'Nguyễn Văn A',
        groupId: 'grp-1',
        groupName: 'Đại lý',
      })

      expect(useCartStore.getState().tabs[1]?.customerId).toBe('cust-1')
      expect(useCartStore.getState().tabs[1]?.priceListId).toBe('pl-wholesale-1')

      // Switch to different customer
      useCartStore.getState().setCustomer({
        id: 'cust-2',
        name: 'Trần Thị B',
        groupId: null,
        groupName: null,
      })

      expect(useCartStore.getState().tabs[1]?.customerId).toBe('cust-2')
      expect(useCartStore.getState().tabs[1]?.priceListId).toBe('pl-wholesale-1')
      expect(useCartStore.getState().tabs[1]?.priceListName).toBe('Bảng giá sỉ')

      // Clear customer -> price list still preserved
      useCartStore.getState().setCustomer(null)
      expect(useCartStore.getState().tabs[1]?.customerId).toBeNull()
      expect(useCartStore.getState().tabs[1]?.priceListId).toBe('pl-wholesale-1')
    })

    it('clearCart resets priceListId and priceListName to null', () => {
      useCartStore.getState().setPriceList({ id: 'pl-wholesale-1', name: 'Bảng giá sỉ' })
      expect(useCartStore.getState().tabs[1]?.priceListId).toBe('pl-wholesale-1')

      useCartStore.getState().clearCart()
      expect(useCartStore.getState().tabs[1]?.priceListId).toBeNull()
      expect(useCartStore.getState().tabs[1]?.priceListName).toBeNull()
    })

    it('updateItemPrice sets price, source, sourceDetail, and isFallback', () => {
      useCartStore.getState().addItem({
        productId: 'prod-1',
        variantId: null,
        unitConversionId: null,
        productName: 'Cà phê Robusta',
        variantName: null,
        sku: 'CF-ROB',
        unitPrice: 100_000,
        costPrice: 60_000,
        imageUrl: null,
        notes: null,
        unitName: 'Gói',
      })

      const itemId = 'prod-1'
      useCartStore
        .getState()
        .updateItemPrice(itemId, 85_000, 'retail_price', 'Giá dự phòng: Giá bán lẻ', 1, true)

      const updated = useCartStore.getState().tabs[1]?.items[0]
      expect(updated?.unitPrice).toBe(85_000)
      expect(updated?.priceSource).toBe('retail_price')
      expect(updated?.priceSourceDetail).toBe('Giá dự phòng: Giá bán lẻ')
      expect(updated?.isFallback).toBe(true)
    })
  })

  describe('2. Auto-Reprice Batching & Stale Response Safety', () => {
    it('resolvePricesInBatches splits items into batches <= 100 items', async () => {
      const mockItems = Array.from({ length: 150 }, (_, i) => ({
        productId: `prod-${i}`,
        variantId: null,
        unitConversionId: null,
        quantity: 1,
      }))

      const mockResponse1 = {
        data: mockItems.slice(0, 100).map((it) => ({
          productId: it.productId,
          variantId: null,
          unitConversionId: null,
          price: 50_000,
          source: 'price_list' as const,
          sourceDetail: 'Bảng giá sỉ',
          isFallback: false,
          breakdown: [],
        })),
      }
      const mockResponse2 = {
        data: mockItems.slice(100, 150).map((it) => ({
          productId: it.productId,
          variantId: null,
          unitConversionId: null,
          price: 60_000,
          source: 'price_list' as const,
          sourceDetail: 'Bảng giá sỉ',
          isFallback: false,
          breakdown: [],
        })),
      }

      vi.mocked(pricingApi.resolvePricesApi)
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2)

      const result = await resolvePricesInBatches({
        customerId: 'cust-1',
        priceListId: 'pl-1',
        items: mockItems,
      })

      expect(pricingApi.resolvePricesApi).toHaveBeenCalledTimes(2)
      expect(result).toHaveLength(150)
      expect(result[0]?.price).toBe(50_000)
      expect(result[149]?.price).toBe(60_000)
    })

    it('applyResults discards results if tab switched before response returned', () => {
      useCartStore.getState().setActiveTab(1)
      useCartStore.getState().addItem({
        productId: 'prod-1',
        variantId: null,
        unitConversionId: null,
        productName: 'Item 1',
        variantName: null,
        sku: 'SKU-1',
        unitPrice: 100_000,
        costPrice: 50_000,
        imageUrl: null,
        notes: null,
        unitName: 'Cái',
      })

      // User switches to Tab 2
      useCartStore.getState().setActiveTab(2)

      // Response for Tab 1 arrives
      applyResults(
        [
          {
            productId: 'prod-1',
            variantId: null,
            unitConversionId: null,
            price: 70_000,
            source: 'price_list',
            sourceDetail: 'Bảng giá',
            isFallback: false,
            breakdown: [],
          },
        ],
        { tabIndex: 1, customerId: null, priceListId: null },
      )

      // Tab 1 price should not have changed
      expect(useCartStore.getState().tabs[1]?.items[0]?.unitPrice).toBe(100_000)
    })

    it('applyResults discards results if price list changed before response returned', () => {
      useCartStore.getState().setActiveTab(1)
      useCartStore.getState().setPriceList({ id: 'pl-old', name: 'Cũ' })
      useCartStore.getState().addItem({
        productId: 'prod-1',
        variantId: null,
        unitConversionId: null,
        productName: 'Item 1',
        variantName: null,
        sku: 'SKU-1',
        unitPrice: 100_000,
        costPrice: 50_000,
        imageUrl: null,
        notes: null,
        unitName: 'Cái',
      })

      // User changed price list to 'pl-new'
      useCartStore.getState().setPriceList({ id: 'pl-new', name: 'Mới' })

      // Stale response from 'pl-old' arrives
      applyResults(
        [
          {
            productId: 'prod-1',
            variantId: null,
            unitConversionId: null,
            price: 70_000,
            source: 'price_list',
            sourceDetail: 'Bảng giá cũ',
            isFallback: false,
            breakdown: [],
          },
        ],
        { tabIndex: 1, customerId: null, priceListId: 'pl-old' },
      )

      // Price should remain 100_000, not 70_000
      expect(useCartStore.getState().tabs[1]?.items[0]?.unitPrice).toBe(100_000)
    })

    it('repriceOnAddAction and repriceOnQuantityAction pass priceListId to API', async () => {
      useCartStore.getState().setActiveTab(1)
      useCartStore.getState().setPriceList({ id: 'pl-active-1', name: 'Bảng giá 1' })

      vi.mocked(pricingApi.resolvePricesApi).mockResolvedValue({
        data: [
          {
            productId: 'prod-1',
            variantId: null,
            unitConversionId: null,
            price: 80_000,
            source: 'price_list',
            sourceDetail: 'Bảng giá 1',
            isFallback: false,
            breakdown: [],
          },
        ],
      })

      await repriceOnAddAction('prod-1', null, null, 2)

      expect(pricingApi.resolvePricesApi).toHaveBeenCalledWith(
        expect.objectContaining({
          priceListId: 'pl-active-1',
          items: [{ productId: 'prod-1', variantId: null, unitConversionId: null, quantity: 2 }],
        }),
      )
    })
  })
})

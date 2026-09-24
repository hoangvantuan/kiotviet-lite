import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useCartStore } from '@/stores/use-cart-store'

import * as pricingApi from '../pos-pricing-api'
import {
  applyResults,
  buildCartItemId,
  repriceOnQuantityAction,
  resetRepriceSequence,
} from './use-auto-reprice'

vi.mock('../pos-pricing-api', () => ({
  resolvePricesApi: vi.fn(),
}))

describe('use-auto-reprice (M14 & M15)', () => {
  beforeEach(() => {
    resetRepriceSequence()
    useCartStore.getState().setActiveTab(1)
    useCartStore.getState().clearCart()
    vi.clearAllMocks()
  })

  // ---------------------------------------------------------------------------
  // M14: buildCartItemId và applyResults với unitConversionId
  // ---------------------------------------------------------------------------
  describe('M14: buildCartItemId & applyResults', () => {
    it('buildCartItemId tạo đúng ID với các trường hợp variant và unitConversion', () => {
      expect(buildCartItemId('p1', null, null)).toBe('p1')
      expect(buildCartItemId('p1', 'v1', null)).toBe('p1-v1')
      expect(buildCartItemId('p1', null, 'uc1')).toBe('p1-uc1')
      expect(buildCartItemId('p1', 'v1', 'uc1')).toBe('p1-v1-uc1')
    })

    it('applyResults cập nhật đúng giá cho item có unitConversionId', () => {
      // Setup cart item có unitConversionId
      useCartStore.getState().addItem({
        productId: 'p1',
        variantId: null,
        productName: 'SP 1',
        variantName: null,
        sku: 'SKU1',
        unitPrice: 10_000,
        costPrice: 5_000,
        imageUrl: null,
        notes: null,
        unitName: 'Thùng',
        unitConversionId: 'uc1',
      })

      const itemId = 'p1-uc1'
      expect(useCartStore.getState().tabs[1]?.items[0]?.id).toBe(itemId)
      expect(useCartStore.getState().tabs[1]?.items[0]?.unitPrice).toBe(10_000)

      applyResults([
        {
          productId: 'p1',
          variantId: null,
          unitConversionId: 'uc1',
          price: 240_000,
          source: 'retail_price',
          sourceDetail: null,
        },
      ])

      expect(useCartStore.getState().tabs[1]?.items[0]?.unitPrice).toBe(240_000)
    })
  })

  // ---------------------------------------------------------------------------
  // M15: Chống race condition khi bấm nhanh +/- số lượng trong giỏ
  // ---------------------------------------------------------------------------
  describe('M15: Chống race condition khi bấm nhanh +/-', () => {
    it('Response cũ về sau KHÔNG ghi đè giá mới nhất (out-of-order responses)', async () => {
      // Thêm item vào cart
      useCartStore.getState().addItem({
        productId: 'p1',
        variantId: null,
        productName: 'SP Sỉ Lẻ',
        variantName: null,
        sku: 'SKU-SI',
        unitPrice: 100_000,
        costPrice: 50_000,
        imageUrl: null,
        notes: null,
        unitName: null,
        unitConversionId: null,
      })

      const itemId = 'p1'

      // Mock resolvePricesApi với delay đảo ngược:
      // Request 1 (qty=9): delay 100ms, trả về giá lẻ 100_000đ
      // Request 2 (qty=10): delay 20ms (về trước), trả về giá sỉ 80_000đ
      vi.mocked(pricingApi.resolvePricesApi).mockImplementation(async (input) => {
        const item = input.items[0]!
        if (item.quantity === 9) {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return {
            data: [
              {
                productId: 'p1',
                variantId: null,
                price: 100_000,
                source: 'retail_price' as const,
                sourceDetail: 'Giá lẻ',
              },
            ],
          }
        }
        if (item.quantity === 10) {
          await new Promise((resolve) => setTimeout(resolve, 20))
          return {
            data: [
              {
                productId: 'p1',
                variantId: null,
                price: 80_000,
                source: 'volume_price' as const,
                sourceDetail: 'SL >= 10',
              },
            ],
          }
        }
        return { data: [] }
      })

      // Bấm nhanh 9 rồi bấm 10
      repriceOnQuantityAction(itemId, 9) // Request 1 phát ra
      repriceOnQuantityAction(itemId, 10) // Request 2 phát ra ngay sau đó

      // Chờ cả 2 request hoàn thành
      await new Promise((resolve) => setTimeout(resolve, 150))

      // Kết quả cuối cùng trong giỏ PHẢI là 80_000 (từ Request 2), không bị Request 1 ghi đè!
      const currentItem = useCartStore.getState().tabs[1]?.items.find((i) => i.id === itemId)
      expect(currentItem?.unitPrice).toBe(80_000)
      expect(currentItem?.priceSource).toBe('volume_price')
    })
  })

  // ---------------------------------------------------------------------------
  // #32 Regression: Tab-cross-contamination protection
  // ---------------------------------------------------------------------------
  describe('#32: Tab safety — applyResults guards against tab/customer mismatch', () => {
    it('applyResults with tab context updates target tab in background without mutating active tab when tab has switched', () => {
      // Add same item to tab 1
      useCartStore.getState().addItem({
        productId: 'p1',
        variantId: null,
        productName: 'SP 1',
        variantName: null,
        sku: 'SKU1',
        unitPrice: 100_000,
        costPrice: 50_000,
        imageUrl: null,
        notes: null,
        unitName: null,
        unitConversionId: null,
      })

      // Switch to tab 2 and add same itemId pattern
      useCartStore.getState().setActiveTab(2)
      useCartStore.getState().addItem({
        productId: 'p1',
        variantId: null,
        productName: 'SP 1',
        variantName: null,
        sku: 'SKU1',
        unitPrice: 200_000,
        costPrice: 50_000,
        imageUrl: null,
        notes: null,
        unitName: null,
        unitConversionId: null,
      })

      // Now simulate: results were for tab 1, but user is on tab 2
      applyResults(
        [
          {
            productId: 'p1',
            variantId: null,
            unitConversionId: null,
            price: 50_000,
            source: 'customer_price',
            sourceDetail: 'Giá riêng',
          },
        ],
        { tabIndex: 1, customerId: null },
      )

      // Tab 2's item should NOT be overwritten (tab isolation preserved)
      const tab2Item = useCartStore.getState().tabs[2]?.items.find((i) => i.id === 'p1')
      expect(tab2Item?.unitPrice).toBe(200_000)
      expect(tab2Item?.priceSource).toBe('retail_price')

      // Tab 1's item should be updated in background (not discarded)
      const tab1Item = useCartStore.getState().tabs[1]?.items.find((i) => i.id === 'p1')
      expect(tab1Item?.unitPrice).toBe(50_000)
    })

    it('applyResults without context still applies to active tab (backward compat)', () => {
      useCartStore.getState().addItem({
        productId: 'p1',
        variantId: null,
        productName: 'SP 1',
        variantName: null,
        sku: 'SKU1',
        unitPrice: 100_000,
        costPrice: 50_000,
        imageUrl: null,
        notes: null,
        unitName: null,
        unitConversionId: null,
      })

      // No context passed — backward compatible
      applyResults([
        {
          productId: 'p1',
          variantId: null,
          unitConversionId: null,
          price: 80_000,
          source: 'volume_price',
          sourceDetail: 'SL >= 5',
        },
      ])

      const item = useCartStore.getState().tabs[1]?.items.find((i) => i.id === 'p1')
      expect(item?.unitPrice).toBe(80_000)
      expect(item?.priceSource).toBe('volume_price')
    })
  })
})

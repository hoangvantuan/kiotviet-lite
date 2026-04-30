import { useEffect, useRef } from 'react'

import type { ResolvedPriceItem, ResolvePricesInput } from '@kiotviet-lite/shared'

import { useCartStore } from '@/stores/use-cart-store'

import { resolvePricesApi } from '../pos-pricing-api'

function applyResults(results: ResolvedPriceItem[]) {
  const { updateItemPrice } = useCartStore.getState()
  for (const r of results) {
    const id = r.variantId ? `${r.productId}-${r.variantId}` : r.productId
    updateItemPrice(id, r.price, r.source, r.sourceDetail)
  }
}

export function useAutoReprice() {
  const activeTab = useCartStore((s) => s.activeTab)
  const customerId = useCartStore((s) => s.tabs[s.activeTab]?.customerId ?? null)
  const items = useCartStore((s) => s.tabs[s.activeTab]?.items ?? [])

  const prevCustomerIdRef = useRef<string | null>(customerId)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    const prevCustomerId = prevCustomerIdRef.current
    prevCustomerIdRef.current = customerId

    if (prevCustomerId === customerId) return

    const repriceItems = items.filter((i) => !i.priceOverride)
    if (repriceItems.length === 0) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const input: ResolvePricesInput = {
        customerId,
        items: repriceItems.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: i.quantity,
        })),
      }
      resolvePricesApi(input)
        .then((res) => applyResults(res.data))
        .catch(() => {})
    }, 200)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, activeTab])
}

export function useRepriceOnAdd() {
  const customerId = useCartStore((s) => s.tabs[s.activeTab]?.customerId ?? null)

  return (productId: string, variantId: string | null, quantity: number) => {
    const input: ResolvePricesInput = {
      customerId,
      items: [{ productId, variantId, quantity }],
    }
    resolvePricesApi(input)
      .then((res) => applyResults(res.data))
      .catch(() => {})
  }
}

export function useRepriceOnQuantity() {
  const customerId = useCartStore((s) => s.tabs[s.activeTab]?.customerId ?? null)
  const items = useCartStore((s) => s.tabs[s.activeTab]?.items ?? [])

  return (itemId: string, newQty: number) => {
    const item = items.find((i) => i.id === itemId)
    if (!item || item.priceOverride) return
    const input: ResolvePricesInput = {
      customerId,
      items: [{ productId: item.productId, variantId: item.variantId, quantity: newQty }],
    }
    resolvePricesApi(input)
      .then((res) => applyResults(res.data))
      .catch(() => {})
  }
}

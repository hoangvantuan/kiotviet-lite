import { useCallback, useEffect, useRef } from 'react'

import type { ResolvedPriceItem, ResolvePricesInput } from '@kiotviet-lite/shared'

import { useCartStore } from '@/stores/use-cart-store'

import { resolvePricesApi } from '../pos-pricing-api'

export function buildCartItemId(
  productId: string,
  variantId: string | null,
  unitConversionId: string | null,
): string {
  const parts = [productId]
  if (variantId) parts.push(variantId)
  if (unitConversionId) parts.push(unitConversionId)
  return parts.join('-')
}

/**
 * Apply pricing results to a specific tab. Guards against:
 * - Tab mismatch (response was for a different tab than current active)
 * - Customer change (customer changed since request was fired)
 * - Manual override (item was edited by user since request)
 */
export function applyResults(
  results: ResolvedPriceItem[],
  /** Context captured at request time */
  ctx?: { tabIndex: number; customerId: string | null },
) {
  const state = useCartStore.getState()
  const { updateItemPrice } = state

  // If context provided, verify we're still on the same tab with the same customer
  if (ctx) {
    if (state.activeTab !== ctx.tabIndex) return // tab switched, discard
    const tab = state.tabs[ctx.tabIndex]
    if (tab && tab.customerId !== ctx.customerId) return // customer changed, discard
  }

  for (const r of results) {
    const id = buildCartItemId(r.productId, r.variantId ?? null, r.unitConversionId ?? null)
    updateItemPrice(id, r.price, r.source, r.sourceDetail)
  }
}

// Sequence tracker per itemId để chống race condition khi bấm nhanh +/- (M15)
const itemSeqMap = new Map<string, number>()
let autoRepriceSeq = 0

export function resetRepriceSequence(itemId?: string) {
  if (itemId) {
    itemSeqMap.delete(itemId)
  } else {
    itemSeqMap.clear()
    autoRepriceSeq = 0
  }
}

export function repriceOnAddAction(
  productId: string,
  variantId: string | null,
  unitConversionId: string | null,
  quantity: number,
) {
  const state = useCartStore.getState()
  const tabIndex = state.activeTab
  const customerId = state.tabs[tabIndex]?.customerId ?? null
  const itemId = buildCartItemId(productId, variantId, unitConversionId)
  const seq = (itemSeqMap.get(itemId) ?? 0) + 1
  itemSeqMap.set(itemId, seq)

  const input: ResolvePricesInput = {
    customerId,
    items: [{ productId, variantId, unitConversionId, quantity }],
  }
  return resolvePricesApi(input)
    .then((res) => {
      if (itemSeqMap.get(itemId) !== seq) return
      applyResults(res.data, { tabIndex, customerId })
    })
    .catch(() => {})
}

export function repriceOnQuantityAction(itemId: string, newQty: number) {
  const state = useCartStore.getState()
  const tabIndex = state.activeTab
  const tab = state.tabs[tabIndex]
  const customerId = tab?.customerId ?? null
  const item = tab?.items.find((i) => i.id === itemId)
  if (!item || item.priceOverride) return

  const seq = (itemSeqMap.get(itemId) ?? 0) + 1
  itemSeqMap.set(itemId, seq)

  const input: ResolvePricesInput = {
    customerId,
    items: [
      {
        productId: item.productId,
        variantId: item.variantId,
        unitConversionId: item.unitConversionId,
        quantity: newQty,
      },
    ],
  }
  return resolvePricesApi(input)
    .then((res) => {
      if (itemSeqMap.get(itemId) !== seq) return
      applyResults(res.data, { tabIndex, customerId })
    })
    .catch(() => {})
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
    const currentSeq = ++autoRepriceSeq
    const tabIndex = activeTab

    debounceRef.current = setTimeout(() => {
      const input: ResolvePricesInput = {
        customerId,
        items: repriceItems.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          unitConversionId: i.unitConversionId,
          quantity: i.quantity,
        })),
      }
      resolvePricesApi(input)
        .then((res) => {
          if (currentSeq !== autoRepriceSeq) return
          applyResults(res.data, { tabIndex, customerId })
        })
        .catch(() => {})
    }, 200)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, activeTab])
}

export function useRepriceOnAdd() {
  return useCallback(
    (
      productId: string,
      variantId: string | null,
      unitConversionId: string | null,
      quantity: number,
    ) => {
      repriceOnAddAction(productId, variantId, unitConversionId, quantity)
    },
    [],
  )
}

export function useRepriceOnQuantity() {
  return useCallback((itemId: string, newQty: number) => {
    repriceOnQuantityAction(itemId, newQty)
  }, [])
}

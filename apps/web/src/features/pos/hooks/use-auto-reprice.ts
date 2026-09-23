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

export function applyResults(results: ResolvedPriceItem[], targetTab?: number) {
  const { updateItemPrice } = useCartStore.getState()
  for (const r of results) {
    const id = buildCartItemId(r.productId, r.variantId ?? null, r.unitConversionId ?? null)
    updateItemPrice(id, r.price, r.source, r.sourceDetail, targetTab)
  }
}

// Sequence tracker per (targetTab:itemId) để chống race condition khi bấm nhanh +/- và chuyển tab (M15)
const itemSeqMap = new Map<string, number>()
let autoRepriceSeq = 0

export function resetRepriceSequence(itemId?: string) {
  if (itemId) {
    for (const key of Array.from(itemSeqMap.keys())) {
      if (key.endsWith(`:${itemId}`) || key === itemId) {
        itemSeqMap.delete(key)
      }
    }
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
  specifiedTab?: number,
) {
  const targetTab = specifiedTab ?? useCartStore.getState().activeTab
  const customerId = useCartStore.getState().tabs[targetTab]?.customerId ?? null
  const itemId = buildCartItemId(productId, variantId, unitConversionId)
  const key = `${targetTab}:${itemId}`
  const seq = (itemSeqMap.get(key) ?? 0) + 1
  itemSeqMap.set(key, seq)

  const input: ResolvePricesInput = {
    customerId,
    items: [{ productId, variantId, unitConversionId, quantity }],
  }
  return resolvePricesApi(input)
    .then((res) => {
      if (itemSeqMap.get(key) !== seq) return
      applyResults(res.data, targetTab)
    })
    .catch(() => {})
}

export function repriceOnQuantityAction(itemId: string, newQty: number, specifiedTab?: number) {
  const targetTab = specifiedTab ?? useCartStore.getState().activeTab
  const tab = useCartStore.getState().tabs[targetTab]
  const customerId = tab?.customerId ?? null
  const item = tab?.items.find((i) => i.id === itemId)
  if (!item || item.priceOverride) return

  const key = `${targetTab}:${itemId}`
  const seq = (itemSeqMap.get(key) ?? 0) + 1
  itemSeqMap.set(key, seq)

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
      if (itemSeqMap.get(key) !== seq) return
      applyResults(res.data, targetTab)
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
    const targetTab = activeTab

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
          applyResults(res.data, targetTab)
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
      specifiedTab?: number,
    ) => {
      repriceOnAddAction(productId, variantId, unitConversionId, quantity, specifiedTab)
    },
    [],
  )
}

export function useRepriceOnQuantity() {
  return useCallback((itemId: string, newQty: number, specifiedTab?: number) => {
    repriceOnQuantityAction(itemId, newQty, specifiedTab)
  }, [])
}

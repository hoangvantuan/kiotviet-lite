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
 * Slices requests into batches of <= 100 items to respect backend limit
 * while supporting orders up to 200 lines.
 */
export async function resolvePricesInBatches(
  input: ResolvePricesInput,
): Promise<ResolvedPriceItem[]> {
  const BATCH_SIZE = 100
  if (input.items.length <= BATCH_SIZE) {
    const res = await resolvePricesApi(input)
    return res.data
  }
  const batches: ResolvePricesInput['items'][] = []
  for (let i = 0; i < input.items.length; i += BATCH_SIZE) {
    batches.push(input.items.slice(i, i + BATCH_SIZE))
  }
  const results = await Promise.all(
    batches.map((batch) =>
      resolvePricesApi({
        customerId: input.customerId,
        ...(input.priceListId ? { priceListId: input.priceListId } : {}),
        items: batch,
      }),
    ),
  )
  return results.flatMap((r) => r.data)
}

/**
 * Apply pricing results to a specific tab. Guards against:
 * - Tab mismatch (response was for a different tab than current active)
 * - Customer change (customer changed since request was fired)
 * - Price list change (price list changed since request was fired)
 * - Manual override (item was edited by user since request)
 */
export function applyResults(
  results: ResolvedPriceItem[],
  /** Context captured at request time */
  ctx?: { tabIndex: number; customerId: string | null; priceListId?: string | null },
) {
  const state = useCartStore.getState()
  const { updateItemPrice } = state

  // If context provided, verify we're still on the same tab with the same customer and price list
  if (ctx) {
    if (state.activeTab !== ctx.tabIndex) return // tab switched, discard
    const tab = state.tabs[ctx.tabIndex]
    if (tab && tab.customerId !== ctx.customerId) return // customer changed, discard
    if (tab && (tab.priceListId ?? null) !== (ctx.priceListId ?? null)) return // price list changed, discard
  }

  for (const r of results) {
    const id = buildCartItemId(r.productId, r.variantId ?? null, r.unitConversionId ?? null)
    updateItemPrice(id, r.price, r.source, r.sourceDetail, ctx?.tabIndex, r.isFallback)
  }
}

// Sequence tracker per itemId to prevent race conditions on fast +/- (M15)
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
  const tab = state.tabs[tabIndex]
  const customerId = tab?.customerId ?? null
  const priceListId = tab?.priceListId ?? null
  const itemId = buildCartItemId(productId, variantId, unitConversionId)
  const seq = (itemSeqMap.get(itemId) ?? 0) + 1
  itemSeqMap.set(itemId, seq)

  const input: ResolvePricesInput = {
    customerId,
    ...(priceListId ? { priceListId } : {}),
    items: [{ productId, variantId, unitConversionId, quantity }],
  }
  return resolvePricesApi(input)
    .then((res) => {
      if (itemSeqMap.get(itemId) !== seq) return
      applyResults(res.data, { tabIndex, customerId, priceListId })
    })
    .catch(() => {})
}

export function repriceOnQuantityAction(itemId: string, newQty: number) {
  const state = useCartStore.getState()
  const tabIndex = state.activeTab
  const tab = state.tabs[tabIndex]
  const customerId = tab?.customerId ?? null
  const priceListId = tab?.priceListId ?? null
  const item = tab?.items.find((i) => i.id === itemId)
  if (!item || item.priceOverride) return

  const seq = (itemSeqMap.get(itemId) ?? 0) + 1
  itemSeqMap.set(itemId, seq)

  const input: ResolvePricesInput = {
    customerId,
    ...(priceListId ? { priceListId } : {}),
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
      applyResults(res.data, { tabIndex, customerId, priceListId })
    })
    .catch(() => {})
}

export function repriceTabAction(tabIndex?: number) {
  const state = useCartStore.getState()
  const targetTab = tabIndex ?? state.activeTab
  const tab = state.tabs[targetTab]
  if (!tab) return

  const customerId = tab.customerId ?? null
  const priceListId = tab.priceListId ?? null
  const repriceItems = tab.items.filter((i) => !i.priceOverride)
  if (repriceItems.length === 0) return

  const currentSeq = ++autoRepriceSeq

  const input: ResolvePricesInput = {
    customerId,
    ...(priceListId ? { priceListId } : {}),
    items: repriceItems.map((i) => ({
      productId: i.productId,
      variantId: i.variantId,
      unitConversionId: i.unitConversionId,
      quantity: i.quantity,
    })),
  }

  return resolvePricesInBatches(input)
    .then((data) => {
      if (currentSeq !== autoRepriceSeq) return
      applyResults(data, { tabIndex: targetTab, customerId, priceListId })
    })
    .catch(() => {})
}

export function useAutoReprice() {
  const activeTab = useCartStore((s) => s.activeTab)
  const customerId = useCartStore((s) => s.tabs[s.activeTab]?.customerId ?? null)
  const priceListId = useCartStore((s) => s.tabs[s.activeTab]?.priceListId ?? null)

  const prevActiveTabRef = useRef<number>(activeTab)
  const prevCustomerIdRef = useRef<string | null>(customerId)
  const prevPriceListIdRef = useRef<string | null>(priceListId)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    const prevActiveTab = prevActiveTabRef.current
    const prevCustomerId = prevCustomerIdRef.current
    const prevPriceListId = prevPriceListIdRef.current

    prevActiveTabRef.current = activeTab
    prevCustomerIdRef.current = customerId
    prevPriceListIdRef.current = priceListId

    const tabChanged = prevActiveTab !== activeTab
    const customerChanged = prevCustomerId !== customerId
    const priceListChanged = prevPriceListId !== priceListId

    if (!tabChanged && !customerChanged && !priceListChanged) return

    const currentTabState = useCartStore.getState().tabs[activeTab]
    const currentItems = currentTabState?.items ?? []
    const repriceItems = currentItems.filter((i) => !i.priceOverride)
    if (repriceItems.length === 0) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    const currentSeq = ++autoRepriceSeq
    const tabIndex = activeTab

    debounceRef.current = setTimeout(() => {
      const input: ResolvePricesInput = {
        customerId,
        ...(priceListId ? { priceListId } : {}),
        items: repriceItems.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          unitConversionId: i.unitConversionId,
          quantity: i.quantity,
        })),
      }
      resolvePricesInBatches(input)
        .then((data) => {
          if (currentSeq !== autoRepriceSeq) return
          applyResults(data, { tabIndex, customerId, priceListId })
        })
        .catch(() => {})
    }, 200)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [activeTab, customerId, priceListId])
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

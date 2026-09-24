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

export interface RepriceContext {
  tabIndex: number
  customerId: string | null
  priceListId?: string | null
  itemQuantities?: Map<string, number> | Record<string, number>
}

/**
 * Apply pricing results to a specific tab. Guards against:
 * - Customer change (customer changed since request was fired)
 * - Price list change (price list changed since request was fired)
 * - Manual override (item was edited by user since request)
 * - In-flight quantity change (item quantity changed, prevent overwriting newer volume price)
 * Does NOT discard results when tab is switched: background updates tabIndex directly.
 */
export function applyResults(
  results: ResolvedPriceItem[],
  /** Context captured at request time */
  ctx?: RepriceContext,
) {
  const state = useCartStore.getState()
  const { updateItemPrice } = state

  const targetTab = ctx?.tabIndex !== undefined ? ctx.tabIndex : state.activeTab
  const currentTab = state.tabs[targetTab]
  if (!currentTab) return

  // If context provided, verify this tab's customer and price list have not changed
  if (ctx) {
    if (currentTab.customerId !== ctx.customerId) return // customer changed on this tab, discard
    if ((currentTab.priceListId ?? null) !== (ctx.priceListId ?? null)) return // price list changed on this tab, discard
  }

  for (const r of results) {
    const id = buildCartItemId(r.productId, r.variantId ?? null, r.unitConversionId ?? null)
    const currentItem = currentTab.items.find((i) => i.id === id)
    if (!currentItem || currentItem.priceOverride) continue

    // If quantity context provided, verify quantity has not changed since request
    // This prevents older in-flight requests (e.g. qty=1) from overwriting newer tier prices (e.g. qty=20)
    if (ctx?.itemQuantities) {
      const requestedQty =
        ctx.itemQuantities instanceof Map ? ctx.itemQuantities.get(id) : ctx.itemQuantities[id]
      if (requestedQty !== undefined && currentItem.quantity !== requestedQty) {
        continue
      }
    }

    updateItemPrice(id, r.price, r.source, r.sourceDetail, targetTab, r.isFallback)
  }
}

// Sequence tracker per itemId to prevent race conditions on fast +/- (M15)
const itemSeqMap = new Map<string, number>()
// Sequence tracker per tab to prevent cross-tab invalidation and stale overwrites (#35)
const tabSeqMap = new Map<number, number>()

export function resetRepriceSequence(itemId?: string, tabIndex?: number) {
  if (itemId) {
    itemSeqMap.delete(itemId)
  } else if (tabIndex !== undefined) {
    tabSeqMap.delete(tabIndex)
  } else {
    itemSeqMap.clear()
    tabSeqMap.clear()
  }
}

export function getNextTabSeq(tabIndex: number): number {
  const next = (tabSeqMap.get(tabIndex) ?? 0) + 1
  tabSeqMap.set(tabIndex, next)
  return next
}

export function getTabSeq(tabIndex: number): number {
  return tabSeqMap.get(tabIndex) ?? 0
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
      applyResults(res.data, {
        tabIndex,
        customerId,
        priceListId,
      })
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
      applyResults(res.data, {
        tabIndex,
        customerId,
        priceListId,
      })
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

  const currentSeq = getNextTabSeq(targetTab)
  const itemQuantities = new Map(repriceItems.map((i) => [i.id, i.quantity]))

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
      if (getTabSeq(targetTab) !== currentSeq) return
      applyResults(data, { tabIndex: targetTab, customerId, priceListId, itemQuantities })
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
  const debounceTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    const prevActiveTab = prevActiveTabRef.current
    const prevCustomerId = prevCustomerIdRef.current
    const prevPriceListId = prevPriceListIdRef.current

    prevActiveTabRef.current = activeTab
    prevCustomerIdRef.current = customerId
    prevPriceListIdRef.current = priceListId

    // Only trigger if customer or price list changed on the active tab
    const isSameTab = prevActiveTab === activeTab
    const customerChanged = isSameTab && prevCustomerId !== customerId
    const priceListChanged = isSameTab && prevPriceListId !== priceListId

    if (!customerChanged && !priceListChanged) return

    const tabIndex = activeTab
    const currentTabState = useCartStore.getState().tabs[tabIndex]
    const currentItems = currentTabState?.items ?? []
    const repriceItems = currentItems.filter((i) => !i.priceOverride)
    if (repriceItems.length === 0) return

    const existingTimer = debounceTimersRef.current.get(tabIndex)
    if (existingTimer) clearTimeout(existingTimer)

    const currentSeq = getNextTabSeq(tabIndex)
    const itemQuantities = new Map(repriceItems.map((i) => [i.id, i.quantity]))

    const timer = setTimeout(() => {
      debounceTimersRef.current.delete(tabIndex)
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
          if (getTabSeq(tabIndex) !== currentSeq) return
          applyResults(data, { tabIndex, customerId, priceListId, itemQuantities })
        })
        .catch(() => {})
    }, 200)

    debounceTimersRef.current.set(tabIndex, timer)
  }, [activeTab, customerId, priceListId])

  useEffect(() => {
    const timers = debounceTimersRef.current
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer)
      }
      timers.clear()
    }
  }, [])
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

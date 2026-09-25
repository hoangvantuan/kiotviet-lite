import { create } from 'zustand'

import {
  calculateLineTotal,
  calculateOrderDiscount,
  type DiscountType,
  type PosUnitConversion,
  type PriceSource,
} from '@kiotviet-lite/shared'

export type { DiscountType }

import { MAX_CART_TABS } from '@/features/pos/constants'
import { computeUnitConversionPriceAndStock } from '@/features/pos/utils'

export interface CartItem {
  id: string
  productId: string
  variantId: string | null
  productName: string
  variantName: string | null
  sku: string
  unitPrice: number
  quantity: number
  imageUrl: string | null
  notes: string | null
  unitName: string | null
  unitConversionId: string | null
  baseUnit?: string | null
  baseUnitPrice?: number | null
  baseStockQuantity?: number | null
  unitConversions?: PosUnitConversion[]
  discountType: DiscountType | null
  discountValue: number
  discountAmount: number
  lineTotal: number
  trackInventory: boolean
  stockQuantity: number
  costPrice: number | null
  originalPrice: number | null
  priceOverride: boolean
  priceOverrideReason: string | null
  priceOverridePinUsed: boolean
  priceSource: PriceSource
  priceSourceDetail: string | null
  isFallback?: boolean
}

type CartItemInput = Omit<
  CartItem,
  | 'id'
  | 'quantity'
  | 'discountType'
  | 'discountValue'
  | 'discountAmount'
  | 'lineTotal'
  | 'trackInventory'
  | 'stockQuantity'
  | 'originalPrice'
  | 'priceOverride'
  | 'priceOverrideReason'
  | 'priceOverridePinUsed'
  | 'priceSource'
  | 'priceSourceDetail'
> & {
  discountType?: DiscountType | null
  discountValue?: number
  discountAmount?: number
  lineTotal?: number
  trackInventory?: boolean
  stockQuantity?: number
  originalPrice?: number | null
  priceOverride?: boolean
  priceOverrideReason?: string | null
  priceOverridePinUsed?: boolean
  priceSource?: PriceSource
  priceSourceDetail?: string | null
  isFallback?: boolean
  baseUnit?: string | null
  baseUnitPrice?: number | null
  baseStockQuantity?: number | null
  unitConversions?: PosUnitConversion[]
}

export interface TabState {
  items: CartItem[]
  orderDiscountType: DiscountType | null
  orderDiscountValue: number
  orderDiscountAmount: number
  customerId: string | null
  customerName: string | null
  customerGroupId: string | null
  customerGroupName: string | null
  priceListId: string | null
  priceListName: string | null
  priceOverridePin: string | null
}

interface CartState {
  tabs: Record<number, TabState>
  activeTab: number
  mode: 'quick' | 'normal'
  setActiveTab: (tab: number) => void
  addItem: (item: CartItemInput, qty?: number) => void
  removeItem: (id: string) => void
  updateQuantity: (id: string, qty: number) => void
  changeItemUnit: (id: string, unitConversionId: string | null) => void
  updateLineDiscount: (id: string, type: DiscountType | null, value: number) => void
  updateLineNotes: (id: string, notes: string | null) => void
  updateUnitPrice: (
    id: string,
    newPrice: number,
    opts?: { reason?: string | null; pinUsed?: boolean },
  ) => void
  updateOrderDiscount: (type: DiscountType | null, value: number) => void
  setCustomer: (
    customer: {
      id: string
      name: string
      groupId: string | null
      groupName: string | null
    } | null,
  ) => void
  setPriceList: (
    priceList: {
      id: string
      name: string
    } | null,
    targetTabIndex?: number,
  ) => void
  updateItemPrice: (
    id: string,
    price: number,
    source: PriceSource,
    sourceDetail: string | null,
    targetTabIndex?: number,
    isFallback?: boolean,
  ) => void
  setPriceOverridePin: (pin: string | null) => void
  clearCart: () => void
  setMode: (mode: 'quick' | 'normal') => void
}

function buildCartItemId(
  productId: string,
  variantId: string | null,
  unitConversionId: string | null,
): string {
  const parts = [productId]
  if (variantId) parts.push(variantId)
  if (unitConversionId) parts.push(unitConversionId)
  return parts.join('-')
}

function readModeFromStorage(): 'quick' | 'normal' {
  try {
    const stored = localStorage.getItem('pos-mode')
    if (stored === 'quick' || stored === 'normal') return stored
  } catch {
    // localStorage unavailable
  }
  return 'normal'
}

function recomputeLine(item: CartItem): CartItem {
  const { discountAmount, lineTotal } = calculateLineTotal({
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    discountType: item.discountType,
    discountValue: item.discountValue,
  })
  return { ...item, discountAmount, lineTotal }
}

function recomputeOrderDiscount(tab: TabState): TabState {
  const subtotal = tab.items.reduce((sum, i) => sum + i.lineTotal, 0)
  const orderDiscountAmount = calculateOrderDiscount({
    subtotal,
    discountType: tab.orderDiscountType,
    discountValue: tab.orderDiscountValue,
  })
  return { ...tab, orderDiscountAmount }
}

export function createEmptyTab(): TabState {
  return {
    items: [],
    orderDiscountType: null,
    orderDiscountValue: 0,
    orderDiscountAmount: 0,
    customerId: null,
    customerName: null,
    customerGroupId: null,
    customerGroupName: null,
    priceListId: null,
    priceListName: null,
    priceOverridePin: null,
  }
}

export function createInitialTabs(): Record<number, TabState> {
  const tabs: Record<number, TabState> = {}
  for (let i = 1; i <= MAX_CART_TABS; i++) {
    tabs[i] = createEmptyTab()
  }
  return tabs
}

function updateTab(
  state: CartState,
  tabIndex: number,
  updater: (tab: TabState) => TabState,
): Pick<CartState, 'tabs'> {
  const current = state.tabs[tabIndex] ?? createEmptyTab()
  const next = updater(current)
  return { tabs: { ...state.tabs, [tabIndex]: next } }
}

function updateActiveTab(
  state: CartState,
  updater: (tab: TabState) => TabState,
): Pick<CartState, 'tabs'> {
  return updateTab(state, state.activeTab, updater)
}

export const useCartStore = create<CartState>((set, get) => ({
  tabs: createInitialTabs(),
  activeTab: 1,
  mode: readModeFromStorage(),

  setActiveTab: (tab) => {
    if (!Number.isInteger(tab) || tab < 1 || tab > MAX_CART_TABS) return
    set({ activeTab: tab })
  },

  addItem: (input, qty = 1) => {
    if (!Number.isInteger(qty) || qty <= 0) return
    const id = buildCartItemId(input.productId, input.variantId, input.unitConversionId)
    set((state) =>
      updateActiveTab(state, (tab) => {
        const existing = tab.items.find((i) => i.id === id)
        let nextItems: CartItem[]
        if (existing) {
          nextItems = tab.items.map((i) =>
            i.id === id ? recomputeLine({ ...i, quantity: i.quantity + qty }) : i,
          )
        } else {
          const baseItem: CartItem = {
            ...input,
            id,
            quantity: qty,
            discountType: input.discountType ?? null,
            discountValue: input.discountValue ?? 0,
            discountAmount: 0,
            lineTotal: 0,
            trackInventory: input.trackInventory ?? false,
            stockQuantity: input.stockQuantity ?? 0,
            costPrice: input.costPrice,
            originalPrice: input.originalPrice ?? null,
            priceOverride: input.priceOverride ?? false,
            priceOverrideReason: input.priceOverrideReason ?? null,
            priceOverridePinUsed: input.priceOverridePinUsed ?? false,
            priceSource: input.priceSource ?? 'retail_price',
            priceSourceDetail: input.priceSourceDetail ?? null,
            isFallback: input.isFallback ?? false,
            baseUnit: input.baseUnit ?? input.unitName ?? null,
            baseUnitPrice: input.baseUnitPrice ?? input.unitPrice,
            baseStockQuantity: input.baseStockQuantity ?? input.stockQuantity ?? 0,
            unitConversions: input.unitConversions ?? [],
          }
          nextItems = [...tab.items, recomputeLine(baseItem)]
        }
        return recomputeOrderDiscount({ ...tab, items: nextItems })
      }),
    )
  },

  removeItem: (id) => {
    set((state) =>
      updateActiveTab(state, (tab) =>
        recomputeOrderDiscount({ ...tab, items: tab.items.filter((i) => i.id !== id) }),
      ),
    )
  },

  changeItemUnit: (id, unitConversionId) => {
    set((state) =>
      updateActiveTab(state, (tab) => {
        const item = tab.items.find((i) => i.id === id)
        if (!item) return tab

        if (item.unitConversionId === unitConversionId) return tab

        let newUnitName: string | null = item.baseUnit ?? item.unitName
        let newUnitPrice: number = item.baseUnitPrice ?? item.unitPrice
        let newStockQuantity: number = item.baseStockQuantity ?? item.stockQuantity

        if (unitConversionId !== null && item.unitConversions) {
          const conv = item.unitConversions.find((u) => u.id === unitConversionId)
          if (!conv) return tab
          newUnitName = conv.unit
          const computed = computeUnitConversionPriceAndStock(
            item.baseUnitPrice ?? item.unitPrice,
            item.baseStockQuantity ?? item.stockQuantity,
            conv,
          )
          newUnitPrice = computed.unitPrice
          newStockQuantity = computed.stockQuantity
        }

        const newId = buildCartItemId(item.productId, item.variantId, unitConversionId)
        const existing = tab.items.find((i) => i.id === newId && i.id !== id)
        let nextItems: CartItem[]

        if (existing) {
          nextItems = tab.items
            .filter((i) => i.id !== id)
            .map((i) =>
              i.id === newId ? recomputeLine({ ...i, quantity: i.quantity + item.quantity }) : i,
            )
        } else {
          nextItems = tab.items.map((i) => {
            if (i.id !== id) return i
            return recomputeLine({
              ...i,
              id: newId,
              unitName: newUnitName,
              unitConversionId,
              unitPrice: newUnitPrice,
              originalPrice: null,
              priceOverride: false,
              priceOverrideReason: null,
              priceOverridePinUsed: false,
              priceSource: 'retail_price',
              priceSourceDetail: null,
              stockQuantity: newStockQuantity,
            })
          })
        }

        return recomputeOrderDiscount({ ...tab, items: nextItems })
      }),
    )
  },

  updateQuantity: (id, qty) => {
    if (!Number.isInteger(qty)) return
    if (qty <= 0) {
      get().removeItem(id)
      return
    }
    set((state) =>
      updateActiveTab(state, (tab) => {
        const nextItems = tab.items.map((i) =>
          i.id === id ? recomputeLine({ ...i, quantity: qty }) : i,
        )
        return recomputeOrderDiscount({ ...tab, items: nextItems })
      }),
    )
  },

  updateLineDiscount: (id, type, value) => {
    if (!Number.isFinite(value) || value < 0) return
    const safeValue = type === 'percent' ? Math.min(Math.round(value), 100) : Math.round(value)
    set((state) =>
      updateActiveTab(state, (tab) => {
        const nextItems = tab.items.map((i) =>
          i.id === id
            ? recomputeLine({ ...i, discountType: type, discountValue: type ? safeValue : 0 })
            : i,
        )
        return recomputeOrderDiscount({ ...tab, items: nextItems })
      }),
    )
  },

  updateUnitPrice: (id, newPrice, opts) => {
    if (!Number.isFinite(newPrice) || newPrice < 1) return
    const safePrice = Math.round(newPrice)
    set((state) =>
      updateActiveTab(state, (tab) => {
        const nextItems = tab.items.map((i) => {
          if (i.id !== id) return i
          const originalPrice = i.originalPrice === null ? i.unitPrice : i.originalPrice
          return recomputeLine({
            ...i,
            unitPrice: safePrice,
            originalPrice,
            priceOverride: true,
            priceOverrideReason: opts?.reason ?? null,
            priceOverridePinUsed: opts?.pinUsed ?? false,
            priceSource: 'manual_override',
            priceSourceDetail: null,
          })
        })
        return recomputeOrderDiscount({ ...tab, items: nextItems })
      }),
    )
  },

  updateLineNotes: (id, notes) => {
    set((state) =>
      updateActiveTab(state, (tab) => ({
        ...tab,
        items: tab.items.map((i) => (i.id === id ? { ...i, notes } : i)),
      })),
    )
  },

  updateOrderDiscount: (type, value) => {
    if (!Number.isFinite(value) || value < 0) return
    const safeValue = type === 'percent' ? Math.min(Math.round(value), 100) : Math.round(value)
    set((state) =>
      updateActiveTab(state, (tab) =>
        recomputeOrderDiscount({
          ...tab,
          orderDiscountType: type,
          orderDiscountValue: type ? safeValue : 0,
        }),
      ),
    )
  },

  setCustomer: (customer) => {
    set((state) =>
      updateActiveTab(state, (tab) => ({
        ...tab,
        customerId: customer?.id ?? null,
        customerName: customer?.name ?? null,
        customerGroupId: customer?.groupId ?? null,
        customerGroupName: customer?.groupName ?? null,
      })),
    )
  },

  setPriceList: (priceList, targetTabIndex) => {
    set((state) => {
      const tabIndex = targetTabIndex !== undefined ? targetTabIndex : state.activeTab
      return updateTab(state, tabIndex, (tab) => ({
        ...tab,
        priceListId: priceList?.id ?? null,
        priceListName: priceList?.name ?? null,
      }))
    })
  },

  updateItemPrice: (id, price, source, sourceDetail, targetTabIndex, isFallback) => {
    const safePrice = Math.round(price)
    set((state) => {
      const tabIndex = targetTabIndex !== undefined ? targetTabIndex : state.activeTab
      return updateTab(state, tabIndex, (tab) => {
        const nextItems = tab.items.map((i) =>
          i.id === id && !i.priceOverride
            ? recomputeLine({
                ...i,
                unitPrice: safePrice,
                priceSource: source,
                priceSourceDetail: sourceDetail,
                isFallback: isFallback ?? false,
              })
            : i,
        )
        return recomputeOrderDiscount({ ...tab, items: nextItems })
      })
    })
  },

  setPriceOverridePin: (pin) => {
    set((state) => updateActiveTab(state, (tab) => ({ ...tab, priceOverridePin: pin })))
  },

  clearCart: () => {
    set((state) => updateActiveTab(state, () => createEmptyTab()))
  },

  setMode: (mode) => {
    try {
      localStorage.setItem('pos-mode', mode)
    } catch {
      // localStorage unavailable
    }
    set({ mode })
  },
}))

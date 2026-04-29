import { create } from 'zustand'

import { MAX_CART_TABS } from '@/features/pos/constants'

export type DiscountType = 'percent' | 'amount'

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
  discountType: DiscountType | null
  discountValue: number
  discountAmount: number
  lineTotal: number
  trackInventory: boolean
  stockQuantity: number
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
> & {
  discountType?: DiscountType | null
  discountValue?: number
  discountAmount?: number
  lineTotal?: number
  trackInventory?: boolean
  stockQuantity?: number
}

export interface TabState {
  items: CartItem[]
  orderDiscountType: DiscountType | null
  orderDiscountValue: number
  orderDiscountAmount: number
}

interface CartState {
  tabs: Record<number, TabState>
  activeTab: number
  mode: 'quick' | 'normal'
  setActiveTab: (tab: number) => void
  addItem: (item: CartItemInput, qty?: number) => void
  removeItem: (id: string) => void
  updateQuantity: (id: string, qty: number) => void
  updateLineDiscount: (id: string, type: DiscountType | null, value: number) => void
  updateLineNotes: (id: string, notes: string | null) => void
  updateOrderDiscount: (type: DiscountType | null, value: number) => void
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

function calcLineDiscount(
  unitPrice: number,
  qty: number,
  type: DiscountType | null,
  value: number,
): number {
  if (!type || value <= 0) return 0
  const gross = unitPrice * qty
  if (gross <= 0) return 0
  if (type === 'percent') return Math.min(Math.round((gross * value) / 100), gross)
  return Math.min(value, gross)
}

function calcOrderDiscount(subtotal: number, type: DiscountType | null, value: number): number {
  if (!type || value <= 0) return 0
  if (subtotal <= 0) return 0
  if (type === 'percent') return Math.min(Math.round((subtotal * value) / 100), subtotal)
  return Math.min(value, subtotal)
}

function recomputeLine(item: CartItem): CartItem {
  const discountAmount = calcLineDiscount(
    item.unitPrice,
    item.quantity,
    item.discountType,
    item.discountValue,
  )
  const lineTotal = item.unitPrice * item.quantity - discountAmount
  return { ...item, discountAmount, lineTotal }
}

function recomputeOrderDiscount(tab: TabState): TabState {
  const subtotal = tab.items.reduce((sum, i) => sum + i.lineTotal, 0)
  const orderDiscountAmount = calcOrderDiscount(
    subtotal,
    tab.orderDiscountType,
    tab.orderDiscountValue,
  )
  return { ...tab, orderDiscountAmount }
}

function createEmptyTab(): TabState {
  return {
    items: [],
    orderDiscountType: null,
    orderDiscountValue: 0,
    orderDiscountAmount: 0,
  }
}

function createInitialTabs(): Record<number, TabState> {
  const tabs: Record<number, TabState> = {}
  for (let i = 1; i <= MAX_CART_TABS; i++) {
    tabs[i] = createEmptyTab()
  }
  return tabs
}

function updateActiveTab(
  state: CartState,
  updater: (tab: TabState) => TabState,
): Pick<CartState, 'tabs'> {
  const current = state.tabs[state.activeTab] ?? createEmptyTab()
  const next = updater(current)
  return { tabs: { ...state.tabs, [state.activeTab]: next } }
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

import { create } from 'zustand'

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
}

type CartItemInput = Omit<CartItem, 'id' | 'quantity'>

interface CartState {
  items: CartItem[]
  mode: 'quick' | 'normal'
  addItem: (item: CartItemInput, qty?: number) => void
  removeItem: (id: string) => void
  updateQuantity: (id: string, qty: number) => void
  clearCart: () => void
  setMode: (mode: 'quick' | 'normal') => void
  totalItems: () => number
  totalAmount: () => number
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

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  mode: readModeFromStorage(),

  addItem: (input, qty = 1) => {
    if (qty <= 0) return
    const id = buildCartItemId(input.productId, input.variantId, input.unitConversionId)
    set((state) => {
      const existing = state.items.find((i) => i.id === id)
      if (existing) {
        return {
          items: state.items.map((i) => (i.id === id ? { ...i, quantity: i.quantity + qty } : i)),
        }
      }
      const newItem: CartItem = { ...input, id, quantity: qty }
      return { items: [...state.items, newItem] }
    })
  },

  removeItem: (id) => {
    set((state) => ({ items: state.items.filter((i) => i.id !== id) }))
  },

  updateQuantity: (id, qty) => {
    if (!Number.isInteger(qty)) return
    if (qty <= 0) {
      get().removeItem(id)
      return
    }
    set((state) => ({
      items: state.items.map((i) => (i.id === id ? { ...i, quantity: qty } : i)),
    }))
  },

  clearCart: () => {
    set({ items: [] })
  },

  setMode: (mode) => {
    try {
      localStorage.setItem('pos-mode', mode)
    } catch {
      // localStorage unavailable
    }
    set({ mode })
  },

  totalItems: () => {
    return get().items.reduce((sum, i) => sum + i.quantity, 0)
  },

  totalAmount: () => {
    return get().items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
  },
}))

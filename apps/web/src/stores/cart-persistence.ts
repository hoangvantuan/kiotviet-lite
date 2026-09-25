import type { AuthUser } from '@kiotviet-lite/shared'

import { MAX_CART_TABS } from '@/features/pos/constants'

import { useAuthStore } from './use-auth-store'
import {
  type CartItem,
  createEmptyTab,
  createInitialTabs,
  type TabState,
  useCartStore,
} from './use-cart-store'

/**
 * Lưu giỏ POS (mọi đơn đang mở) vào localStorage để tải lại trang, hay cập nhật phiên bản,
 * không làm mất đơn đang bán dở (POS-14, OFF-18).
 *
 * Mỗi người dùng của mỗi cửa hàng có một khóa riêng. Khi có người khác đăng nhập trên máy,
 * giỏ của những người trước bị xóa; khi đăng xuất, giỏ của chính người đó bị xóa.
 */
const CART_KEY_PREFIX = 'kvl:pos-cart:'
// Tăng khi đổi cấu trúc TabState/CartItem theo cách bản cũ không đọc đúng được
const CART_SCHEMA_VERSION = 1

type CartIdentity = Pick<AuthUser, 'id' | 'storeId'>

interface PersistedCart {
  version: number
  activeTab: number
  tabs: Record<number, TabState>
}

export function cartStorageKey(user: CartIdentity): string {
  return `${CART_KEY_PREFIX}${user.storeId}:${user.id}`
}

function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function isValidItem(value: unknown): value is CartItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<CartItem>
  return (
    typeof item.id === 'string' &&
    typeof item.productId === 'string' &&
    Number.isFinite(item.quantity) &&
    Number.isFinite(item.unitPrice) &&
    Number.isFinite(item.lineTotal)
  )
}

function sanitizeTab(value: unknown): TabState | null {
  if (!value || typeof value !== 'object') return null
  const tab = value as Partial<TabState>
  if (!Array.isArray(tab.items) || !tab.items.every(isValidItem)) return null
  // PIN duyệt sửa giá không bao giờ được ghi xuống đĩa, người bán nhập lại nếu cần
  return { ...createEmptyTab(), ...tab, priceOverridePin: null }
}

function saveCart(key: string, state: Pick<PersistedCart, 'tabs' | 'activeTab'>) {
  const storage = getStorage()
  if (!storage) return
  const tabs: Record<number, TabState> = {}
  for (const [index, tab] of Object.entries(state.tabs)) {
    tabs[Number(index)] = { ...tab, priceOverridePin: null }
  }
  const payload: PersistedCart = { version: CART_SCHEMA_VERSION, activeTab: state.activeTab, tabs }
  try {
    storage.setItem(key, JSON.stringify(payload))
  } catch {
    // Hết dung lượng hoặc trình duyệt chặn: giỏ vẫn chạy trong bộ nhớ như trước
  }
}

function loadCart(key: string): Pick<PersistedCart, 'tabs' | 'activeTab'> | null {
  const storage = getStorage()
  if (!storage) return null
  let parsed: Partial<PersistedCart>
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    parsed = JSON.parse(raw) as Partial<PersistedCart>
  } catch {
    return null
  }
  if (parsed.version !== CART_SCHEMA_VERSION || !parsed.tabs) return null

  const tabs = createInitialTabs()
  for (let i = 1; i <= MAX_CART_TABS; i++) {
    tabs[i] = sanitizeTab(parsed.tabs[i]) ?? createEmptyTab()
  }
  const activeTab =
    Number.isInteger(parsed.activeTab) &&
    parsed.activeTab! >= 1 &&
    parsed.activeTab! <= MAX_CART_TABS
      ? parsed.activeTab!
      : 1
  return { tabs, activeTab }
}

function removeCarts(keep: string | null) {
  const storage = getStorage()
  if (!storage) return
  try {
    const keys: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key?.startsWith(CART_KEY_PREFIX) && key !== keep) keys.push(key)
    }
    for (const key of keys) storage.removeItem(key)
  } catch {
    // localStorage unavailable
  }
}

/** Xóa giỏ đã lưu của một người dùng (khi người đó đăng xuất). */
export function removePersistedCart(user: CartIdentity) {
  getStorage()?.removeItem(cartStorageKey(user))
}

interface CartPersistenceOptions {
  /** Gọi sau khi khôi phục giỏ, với các tab còn hàng, để tính lại giá vì giá có thể đã đổi. */
  onRestore?: (tabIndexes: number[]) => void
}

/**
 * Gắn giỏ POS với người đang đăng nhập: khôi phục khi đăng nhập hoặc tải lại trang, ghi
 * lại sau mỗi thay đổi, và làm trống giỏ trong bộ nhớ khi hết phiên hay đổi người.
 * Trả về hàm hủy đăng ký.
 */
export function startCartPersistence(options: CartPersistenceOptions = {}): () => void {
  let activeKey: string | null = null

  const bindUser = (user: AuthUser | null) => {
    const nextKey = user ? cartStorageKey(user) : null
    if (nextKey === activeKey) return

    // Ngắt ghi trước khi làm trống, để không ghi đè giỏ đã lưu của ai
    activeKey = null
    useCartStore.setState({ tabs: createInitialTabs(), activeTab: 1 })
    if (!nextKey) return

    // Người khác vừa đăng nhập trên máy: giỏ của người trước không được để lại
    removeCarts(nextKey)
    const restored = loadCart(nextKey)
    activeKey = nextKey
    if (!restored) return
    useCartStore.setState(restored)
    const nonEmpty = Object.entries(restored.tabs)
      .filter(([, tab]) => tab.items.length > 0)
      .map(([index]) => Number(index))
    if (nonEmpty.length > 0) options.onRestore?.(nonEmpty)
  }

  const unsubscribeCart = useCartStore.subscribe((state, prev) => {
    if (!activeKey) return
    if (state.tabs === prev.tabs && state.activeTab === prev.activeTab) return
    saveCart(activeKey, state)
  })
  const unsubscribeAuth = useAuthStore.subscribe((state, prev) => {
    if (state.user?.id === prev.user?.id && state.user?.storeId === prev.user?.storeId) return
    bindUser(state.user)
  })
  bindUser(useAuthStore.getState().user)

  return () => {
    unsubscribeCart()
    unsubscribeAuth()
  }
}

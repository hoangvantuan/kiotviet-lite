import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthUser } from '@kiotviet-lite/shared'

/** localStorage trong bộ nhớ, sống qua các lần "tải lại trang" của test. */
function createMemoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  }
}

const USER_A: AuthUser = {
  id: '11111111-1111-4111-8111-111111111111',
  storeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Thu ngân A',
  phone: null,
  role: 'staff',
}
const USER_B: AuthUser = {
  id: '22222222-2222-4222-8222-222222222222',
  storeId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  name: 'Thu ngân B',
  phone: null,
  role: 'staff',
}

const coke = {
  productId: 'prod-coke',
  variantId: null,
  productName: 'Coca Cola',
  variantName: null,
  sku: 'COKE-001',
  unitPrice: 10_000,
  costPrice: 7_000,
  imageUrl: null,
  notes: null,
  unitName: 'Lon',
  unitConversionId: null,
  trackInventory: true,
  stockQuantity: 48,
}

/**
 * Nạp lại toàn bộ module như một lần tải trang mới: store trong bộ nhớ trống, chỉ còn
 * localStorage. Đăng nhập lại `user` (nếu có) giống bootAuth rồi bật lưu giỏ như main.tsx.
 */
async function bootPage(user: AuthUser | null) {
  vi.resetModules()
  const { useAuthStore } = await import('./use-auth-store')
  const { useCartStore } = await import('./use-cart-store')
  const { startCartPersistence } = await import('./cart-persistence')
  const { endSession } = await import('@/lib/session')
  const onRestore = vi.fn()
  const stop = startCartPersistence({ onRestore })
  if (user) useAuthStore.getState().setAuth({ user, accessToken: 'token' })
  return { useAuthStore, useCartStore, endSession, onRestore, stop }
}

describe('lưu giỏ POS bền (POS-14, OFF-18)', () => {
  let storage: Storage

  beforeEach(() => {
    storage = createMemoryStorage()
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('caches', { delete: vi.fn(async () => true) })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('tải lại trang khôi phục mọi đơn đang mở, không giữ PIN duyệt giá', async () => {
    const page1 = await bootPage(USER_A)
    const cart = page1.useCartStore.getState()
    cart.addItem(coke, 2)
    cart.setCustomer({ id: 'cus-1', name: 'Chị Lan', groupId: null, groupName: null })
    cart.setPriceOverridePin('1234')
    cart.setActiveTab(3)
    page1.useCartStore.getState().addItem(coke, 5)
    page1.stop()

    const page2 = await bootPage(USER_A)
    const restored = page2.useCartStore.getState()
    expect(restored.activeTab).toBe(3)
    expect(restored.tabs[1]!.items[0]).toMatchObject({ productId: 'prod-coke', quantity: 2 })
    expect(restored.tabs[1]!.customerName).toBe('Chị Lan')
    expect(restored.tabs[1]!.priceOverridePin).toBeNull()
    expect(restored.tabs[3]!.items[0]!.quantity).toBe(5)
    expect(restored.tabs[2]!.items).toEqual([])
    // Giá có thể đã đổi trong lúc chờ, tab còn hàng được đưa đi tính lại
    expect(page2.onRestore).toHaveBeenCalledWith([1, 3])
    expect(storage.getItem(`kvl:pos-cart:${USER_A.storeId}:${USER_A.id}`)).not.toContain('1234')
  })

  it('không ghi giá vốn xuống localStorage, khôi phục xong giá vốn ở trạng thái chưa nạp', async () => {
    const page1 = await bootPage(USER_A)
    page1.useCartStore.getState().addItem(coke, 2)
    expect(page1.useCartStore.getState().tabs[1]!.items[0]!.costPrice).toBe(7_000)
    page1.stop()

    // Quyết định nghiệp vụ số 3: nhân viên không được thấy giá vốn, kể cả đọc từ đĩa
    const raw = storage.getItem(`kvl:pos-cart:${USER_A.storeId}:${USER_A.id}`)
    expect(raw).not.toBeNull()
    expect(raw).not.toContain('costPrice')
    expect(raw).not.toContain('7000')

    const page2 = await bootPage(USER_A)
    const item = page2.useCartStore.getState().tabs[1]!.items[0]!
    expect(item.quantity).toBe(2)
    // undefined, không phải 0 hay null: 0 trông như giá vốn thật, null là "sản phẩm chưa có giá vốn"
    expect(item.costPrice).toBeUndefined()
  })

  it('dữ liệu cũ lỡ có giá vốn thì bỏ khi khôi phục và không ghi lại', async () => {
    const key = `kvl:pos-cart:${USER_A.storeId}:${USER_A.id}`
    const page1 = await bootPage(USER_A)
    page1.useCartStore.getState().addItem(coke, 1)
    page1.stop()
    const legacy = JSON.parse(storage.getItem(key)!)
    legacy.tabs[1].items[0].costPrice = 7_000
    storage.setItem(key, JSON.stringify(legacy))

    const page2 = await bootPage(USER_A)
    expect(page2.useCartStore.getState().tabs[1]!.items[0]!.costPrice).toBeUndefined()
    page2.useCartStore.getState().updateQuantity(`prod-coke`, 3)
    expect(storage.getItem(key)).not.toContain('costPrice')
  })

  it('đăng xuất xóa giỏ đã lưu, đăng nhập lại không còn đơn cũ', async () => {
    const page1 = await bootPage(USER_A)
    page1.useCartStore.getState().addItem(coke, 2)
    await page1.endSession()

    expect(page1.useCartStore.getState().tabs[1]!.items).toEqual([])
    expect(storage.length).toBe(0)
    page1.stop()

    const page2 = await bootPage(USER_A)
    expect(page2.useCartStore.getState().tabs[1]!.items).toEqual([])
    expect(page2.onRestore).not.toHaveBeenCalled()
  })

  it('đổi người (cửa hàng khác) không thấy giỏ của người trước, giỏ đó bị xóa', async () => {
    const page1 = await bootPage(USER_A)
    page1.useCartStore.getState().addItem(coke, 2)
    // Hết phiên mà không bấm đăng xuất (refresh token hỏng), người khác đăng nhập ngay
    page1.useAuthStore.getState().clearAuth()
    expect(page1.useCartStore.getState().tabs[1]!.items).toEqual([])
    page1.useAuthStore.getState().setAuth({ user: USER_B, accessToken: 'token-b' })

    expect(page1.useCartStore.getState().tabs[1]!.items).toEqual([])
    expect(storage.getItem(`kvl:pos-cart:${USER_A.storeId}:${USER_A.id}`)).toBeNull()

    page1.useCartStore.getState().addItem(coke, 1)
    page1.stop()
    const page2 = await bootPage(USER_B)
    expect(page2.useCartStore.getState().tabs[1]!.items[0]!.quantity).toBe(1)
  })

  it('hết phiên rồi chính người đó đăng nhập lại thì vẫn còn giỏ', async () => {
    const page1 = await bootPage(USER_A)
    page1.useCartStore.getState().addItem(coke, 4)
    page1.useAuthStore.getState().clearAuth()
    page1.useAuthStore.getState().setAuth({ user: USER_A, accessToken: 'token-2' })
    expect(page1.useCartStore.getState().tabs[1]!.items[0]!.quantity).toBe(4)
  })

  it('dữ liệu lưu hỏng hoặc khác phiên bản thì bỏ qua, giỏ trống', async () => {
    const key = `kvl:pos-cart:${USER_A.storeId}:${USER_A.id}`
    storage.setItem(key, '{hỏng')
    const page1 = await bootPage(USER_A)
    expect(page1.useCartStore.getState().tabs[1]!.items).toEqual([])
    page1.stop()

    storage.setItem(
      key,
      JSON.stringify({ version: 999, activeTab: 1, tabs: { 1: { items: [{}] } } }),
    )
    const page2 = await bootPage(USER_A)
    expect(page2.useCartStore.getState().tabs[1]!.items).toEqual([])
  })
})

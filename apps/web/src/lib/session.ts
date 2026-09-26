import { removePersistedCart } from '@/stores/cart-persistence'
import { useAuthStore } from '@/stores/use-auth-store'
import { createInitialTabs, useCartStore } from '@/stores/use-cart-store'
import { useCatalogSyncStore } from '@/stores/use-catalog-sync-store'

import { clearBrowserDiagnostics } from './api-client'
import { clearOfflineStoreData } from './offline-store-data'
import { forgetOfflineDataStore } from './offline-sync-runtime'
import { queryClient } from './query-client'

/** Cache mà service worker các bản cũ dùng để lưu phản hồi /api/ (C-01). */
export const LEGACY_API_CACHE = 'api-cache'

async function deleteLegacyApiCache() {
  // CacheStorage chỉ có trong ngữ cảnh an toàn (HTTPS hoặc localhost)
  if (typeof caches === 'undefined') return
  try {
    await caches.delete(LEGACY_API_CACHE)
  } catch {
    // Trình duyệt chặn CacheStorage: không có gì để xóa
  }
}

/**
 * Dọn mọi dữ liệu gắn với người vừa đăng xuất trên máy này, để người đăng nhập sau (có thể
 * ở cửa hàng khác) không thấy lại (C-01, POS-14): dữ liệu React Query trong bộ nhớ, mutation
 * đang chờ, giỏ POS đã lưu, api-cache do service worker cũ để lại, dữ liệu cửa hàng trong PGlite
 * (OFF-05) và chẩn đoán chưa gửi (OFF-22). Đơn ngoại tuyến chưa đồng bộ KHÔNG bị xóa.
 */
export async function endSession() {
  const user = useAuthStore.getState().user
  // clearAuth trước để cart-persistence ngừng ghi vào khóa của người này
  useAuthStore.getState().clearAuth()
  if (user) removePersistedCart(user)
  useCartStore.setState({ tabs: createInitialTabs(), activeTab: 1 })
  queryClient.clear()
  clearBrowserDiagnostics()
  forgetOfflineDataStore()
  useCatalogSyncStore.getState().reset()
  await deleteLegacyApiCache()
  try {
    await clearOfflineStoreData()
  } catch (error) {
    console.warn('[session] không dọn được dữ liệu ngoại tuyến', error)
  }
}

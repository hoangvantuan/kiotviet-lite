import { useEffect } from 'react'

import { reportBrowserFailure } from '@/lib/api-client'
import { loadCatalogSyncInfo, syncCatalogNow } from '@/lib/sync-engine'
import { useAuthStore } from '@/stores/use-auth-store'

/** Chu kỳ kéo thay đổi danh mục khi đang mở POS */
export const CATALOG_SYNC_INTERVAL_MS = 5 * 60_000

function syncQuietly() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  // Lỗi đã hiện trên thanh trạng thái (useCatalogSyncStore); ở đây chỉ ghi chẩn đoán
  syncCatalogNow().catch((error: unknown) => reportBrowserFailure('incremental_sync', error))
}

/**
 * GL-03, OFF-09: giữ bản sao danh mục trong PGlite luôn mới khi mở POS: tải khi vào màn, mỗi 5 phút
 * và ngay khi có mạng lại. Lần đầu tải toàn bộ theo trang, các lần sau chỉ lấy phần thay đổi.
 */
export function useCatalogSync() {
  const storeId = useAuthStore((s) => s.user?.storeId)
  useEffect(() => {
    if (!storeId) return
    void loadCatalogSyncInfo()
      .catch(() => null)
      .then(syncQuietly)
    const timer = setInterval(syncQuietly, CATALOG_SYNC_INTERVAL_MS)
    window.addEventListener('online', syncQuietly)
    return () => {
      clearInterval(timer)
      window.removeEventListener('online', syncQuietly)
    }
  }, [storeId])
}

import { useEffect } from 'react'

import { startOfflineSyncRuntime } from '@/lib/offline-sync-runtime'

/**
 * Theo dõi kết nối và chạy đồng bộ ngoại tuyến tự động cho cả ứng dụng (OFF-02). Runtime tự
 * đợi có người đăng nhập mới mở PGlite và đẩy đơn.
 */
export function useNetworkStatus() {
  useEffect(() => startOfflineSyncRuntime(), [])
}

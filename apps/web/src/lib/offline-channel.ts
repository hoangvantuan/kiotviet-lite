/**
 * Kênh báo tin giữa các tab cùng máy (OFF-02, OFF-14). Mọi tab dùng chung một PGlite qua tab
 * chủ (OFF-04), nên khi một tab ghi hay đồng bộ hàng chờ, các tab khác chỉ cần biết để đọc lại
 * số đơn và trạng thái, không tự suy đoán.
 */
import type { OfflineStatus } from '@/stores/use-offline-store'

export const OFFLINE_CHANNEL_NAME = 'kvl-offline-sync'

export type OfflineBroadcast =
  /** Hàng chờ vừa đổi (bán thêm, đồng bộ xong, xóa): tab nhận đọc lại số đơn từ PGlite */
  | { type: 'outbox-changed' }
  /** Trạng thái đồng bộ của tab đang chạy đồng bộ, để mọi tab hiện giống nhau */
  | {
      type: 'sync-state'
      status: OfflineStatus
      errorMessage: string | null
      lastSyncedAt: string | null
    }

let channel: BroadcastChannel | null | undefined

function getChannel(): BroadcastChannel | null {
  if (channel !== undefined) return channel
  channel =
    typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(OFFLINE_CHANNEL_NAME)
  return channel
}

export function broadcastOffline(message: OfflineBroadcast): void {
  try {
    getChannel()?.postMessage(message)
  } catch {
    // Kênh đã đóng khi tab đang tắt: không có tab nào cần báo nữa
  }
}

export function onOfflineBroadcast(handler: (message: OfflineBroadcast) => void): () => void {
  const ch = getChannel()
  if (!ch) return () => {}
  const listener = (event: MessageEvent<OfflineBroadcast>) => handler(event.data)
  ch.addEventListener('message', listener)
  return () => ch.removeEventListener('message', listener)
}

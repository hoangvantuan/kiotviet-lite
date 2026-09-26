import type { TabState } from '@/stores/use-cart-store'
import type { OfflineStatus } from '@/stores/use-offline-store'

/**
 * OFF-18: chỉ cho tải lại lên bản mới khi không còn giỏ đang bán dở và không đang đồng bộ.
 * Giỏ có lưu bền nhưng tải lại giữa lúc khách đứng chờ vẫn làm thu ngân mất thao tác; lượt đồng
 * bộ bị cắt ngang thì đơn quay lại hàng chờ, nhưng phải chờ lượt sau.
 */
export function updateBlocker(
  tabs: Record<number, TabState>,
  syncStatus: OfflineStatus,
): string | null {
  const openCarts = Object.values(tabs).filter((tab) => tab.items.length > 0).length
  if (openCarts > 0) {
    return `Đang có ${openCarts} đơn bán dở. Hoàn tất hoặc xóa các đơn đó rồi tải lại để cập nhật.`
  }
  if (syncStatus === 'syncing') return 'Đang đồng bộ đơn, chờ xong rồi tải lại để cập nhật.'
  return null
}

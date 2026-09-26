import { Loader2, WifiOff } from 'lucide-react'

import { formatDateTime } from '@/lib/date'
import { useCatalogSyncStore } from '@/stores/use-catalog-sync-store'

/**
 * GL-03, OFF-09: trạng thái bản sao danh mục trên POS. Ngoại tuyến thì nói rõ giá và tồn tính theo
 * lần đồng bộ nào; đang tải lần đầu thì hiện tiến độ; lỗi đồng bộ thì báo để thu ngân biết dữ liệu
 * có thể cũ.
 */
export function CatalogSyncBanner({ isOffline }: { isOffline: boolean }) {
  const { status, initial, loaded, total, syncedAt, errorMessage } = useCatalogSyncStore()

  if (isOffline) {
    return (
      <div
        data-testid="pos-offline-price-warning"
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/70 dark:text-amber-200 shrink-0"
      >
        <WifiOff className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
        <span>
          {syncedAt
            ? `Đang ngoại tuyến: giá, tồn kho và công nợ theo dữ liệu đồng bộ lúc ${formatDateTime(syncedAt)}.`
            : 'Đang ngoại tuyến: máy này chưa tải danh mục, chưa tìm được hàng và khách.'}{' '}
          Giá đang hiện trên từng dòng sẽ được giữ nguyên khi hoàn tất đơn.
        </span>
      </div>
    )
  }

  if (status === 'syncing' && initial) {
    return (
      <div
        data-testid="pos-catalog-sync-progress"
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-2 text-xs text-muted-foreground shrink-0"
      >
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        <span>
          Đang tải danh mục để bán ngoại tuyến: {loaded.toLocaleString('vi-VN')}
          {total != null ? ` / ${total.toLocaleString('vi-VN')}` : ''} dòng
        </span>
      </div>
    )
  }

  if (status === 'error' && errorMessage) {
    return (
      <div
        data-testid="pos-catalog-sync-error"
        role="status"
        className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/70 dark:text-amber-200 shrink-0"
      >
        {errorMessage}
        {syncedAt
          ? `. Dữ liệu ngoại tuyến đang theo lần đồng bộ lúc ${formatDateTime(syncedAt)}.`
          : ''}
      </div>
    )
  }

  return null
}

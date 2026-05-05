import { CloudOff, RefreshCw, WifiOff } from 'lucide-react'

import { useOfflineStore } from '@/stores/use-offline-store'

export function OfflineIndicator() {
  const status = useOfflineStore((s) => s.status)
  const pendingOrderCount = useOfflineStore((s) => s.pendingOrderCount)
  const errorMessage = useOfflineStore((s) => s.errorMessage)
  const clearError = useOfflineStore((s) => s.clearError)

  if (status === 'online') return null

  return (
    <div className="relative flex items-center gap-1">
      {status === 'offline' && (
        <WifiOff className="h-4 w-4 text-neutral-400" aria-label="Offline" />
      )}
      {status === 'syncing' && (
        <RefreshCw className="h-4 w-4 animate-spin text-primary" aria-label="Đang đồng bộ" />
      )}
      {status === 'error' && (
        <button
          type="button"
          onClick={clearError}
          title={errorMessage ?? 'Lỗi đồng bộ'}
          className="flex items-center"
        >
          <CloudOff className="h-4 w-4 text-amber-500" aria-label="Lỗi đồng bộ" />
        </button>
      )}
      {pendingOrderCount > 0 && (
        <span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
          {pendingOrderCount > 9 ? '9+' : pendingOrderCount}
        </span>
      )}
    </div>
  )
}

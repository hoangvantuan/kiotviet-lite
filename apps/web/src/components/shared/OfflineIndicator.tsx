import { useState } from 'react'
import { CloudOff, RefreshCw, WifiOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { startSyncCycle } from '@/lib/order-sync'
import { getPGliteClient } from '@/lib/pglite'
import { useAuthStore } from '@/stores/use-auth-store'
import { useOfflineStore } from '@/stores/use-offline-store'

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000'

export function OfflineIndicator() {
  const status = useOfflineStore((s) => s.status)
  const pendingOrderCount = useOfflineStore((s) => s.pendingOrderCount)
  const errorMessage = useOfflineStore((s) => s.errorMessage)
  const lastSyncedAt = useOfflineStore((s) => s.lastSyncedAt)
  const [syncing, setSyncing] = useState(false)

  if (status === 'online' && pendingOrderCount === 0) return null

  const handleManualSync = async () => {
    const pglite = getPGliteClient()
    const token = useAuthStore.getState().accessToken
    if (!pglite || !token) return

    setSyncing(true)
    try {
      await startSyncCycle(pglite, API_BASE, token, lastSyncedAt)
    } catch {
      // error handled in sync engine
    } finally {
      setSyncing(false)
    }
  }

  const icon =
    status === 'offline' ? (
      <WifiOff className="h-4 w-4 text-neutral-400" />
    ) : status === 'syncing' || syncing ? (
      <RefreshCw className="h-4 w-4 animate-spin text-primary" />
    ) : status === 'error' ? (
      <CloudOff className="h-4 w-4 text-amber-500" />
    ) : pendingOrderCount > 0 ? (
      <RefreshCw className="h-4 w-4 text-primary" />
    ) : null

  if (!icon) return null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="relative flex items-center gap-1">
          {icon}
          {pendingOrderCount > 0 && (
            <span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
              {pendingOrderCount > 9 ? '9+' : pendingOrderCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <div className="space-y-2 text-sm">
          <div className="font-medium">
            {status === 'offline' ? 'Đang offline' : status === 'error' ? 'Lỗi đồng bộ' : 'Đồng bộ'}
          </div>
          {pendingOrderCount > 0 && (
            <div className="text-muted-foreground">{pendingOrderCount} đơn chờ đồng bộ</div>
          )}
          {errorMessage && <div className="text-destructive text-xs">{errorMessage}</div>}
          {lastSyncedAt && (
            <div className="text-muted-foreground text-xs">
              Đồng bộ lần cuối: {new Date(lastSyncedAt).toLocaleString('vi-VN')}
            </div>
          )}
          {navigator.onLine && pendingOrderCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={syncing}
              onClick={handleManualSync}
            >
              {syncing ? 'Đang đồng bộ...' : 'Đồng bộ ngay'}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

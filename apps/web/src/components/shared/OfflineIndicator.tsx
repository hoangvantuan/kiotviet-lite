import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CloudOff, RefreshCw, RotateCcw, WifiOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatVndWithSuffix } from '@/lib/currency'
import { getErrorOrders, type OfflineOrder } from '@/lib/offline-orders'
import { retryErrorOrders, retrySingleOrder, startSyncCycle } from '@/lib/order-sync'
import { getPGliteClient } from '@/lib/pglite'
import { useOfflineStore } from '@/stores/use-offline-store'

export function OfflineIndicator() {
  const status = useOfflineStore((s) => s.status)
  const pendingOrderCount = useOfflineStore((s) => s.pendingOrderCount)
  const errorMessage = useOfflineStore((s) => s.errorMessage)
  const lastSyncedAt = useOfflineStore((s) => s.lastSyncedAt)
  const [syncing, setSyncing] = useState(false)
  const [errorOrders, setErrorOrders] = useState<OfflineOrder[]>([])
  const [retryingClientId, setRetryingClientId] = useState<string | null>(null)

  const loadErrorOrders = useCallback(async () => {
    const pglite = getPGliteClient()
    if (!pglite) return
    try {
      const list = await getErrorOrders(pglite)
      setErrorOrders(list)
    } catch {
      // Bỏ qua lỗi truy vấn PGlite cục bộ
    }
  }, [])

  useEffect(() => {
    loadErrorOrders()
  }, [status, pendingOrderCount, loadErrorOrders])

  if (status === 'online' && pendingOrderCount === 0 && errorOrders.length === 0) return null

  const handleManualSync = async () => {
    const pglite = getPGliteClient()
    if (!pglite) return

    setSyncing(true)
    try {
      await startSyncCycle(pglite, undefined, undefined, lastSyncedAt)
    } catch {
      // error handled in sync engine
    } finally {
      await loadErrorOrders()
      setSyncing(false)
    }
  }

  const handleRetryAllErrors = async () => {
    const pglite = getPGliteClient()
    if (!pglite) return

    setSyncing(true)
    try {
      await retryErrorOrders(pglite)
    } catch {
      // error handled in sync engine
    } finally {
      await loadErrorOrders()
      setSyncing(false)
    }
  }

  const handleRetrySingle = async (clientId: string) => {
    const pglite = getPGliteClient()
    if (!pglite) return

    setRetryingClientId(clientId)
    try {
      await retrySingleOrder(pglite, clientId)
    } catch {
      // error handled in sync engine
    } finally {
      await loadErrorOrders()
      setRetryingClientId(null)
    }
  }

  const totalBadge = pendingOrderCount + errorOrders.length

  const icon =
    status === 'offline' ? (
      <WifiOff className="h-4 w-4 text-neutral-400" />
    ) : status === 'syncing' || syncing ? (
      <RefreshCw className="h-4 w-4 animate-spin text-primary" />
    ) : status === 'error' || errorOrders.length > 0 ? (
      <CloudOff className="h-4 w-4 text-amber-500" />
    ) : pendingOrderCount > 0 ? (
      <RefreshCw className="h-4 w-4 text-primary" />
    ) : null

  if (!icon) return null

  return (
    <Popover onOpenChange={(open) => open && loadErrorOrders()}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex items-center gap-1 p-1 rounded hover:bg-accent focus:outline-none"
        >
          {icon}
          {totalBadge > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
              {totalBadge > 9 ? '9+' : totalBadge}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-foreground">
              {status === 'offline'
                ? 'Đang ngoại tuyến'
                : status === 'error'
                  ? 'Lỗi đồng bộ'
                  : 'Đồng bộ dữ liệu'}
            </div>
            {lastSyncedAt && (
              <span className="text-[11px] text-muted-foreground">
                {new Date(lastSyncedAt).toLocaleTimeString('vi-VN')}
              </span>
            )}
          </div>

          {pendingOrderCount > 0 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/50 p-2 rounded">
              <span>Đơn chờ đồng bộ:</span>
              <span className="font-medium text-foreground">{pendingOrderCount}</span>
            </div>
          )}

          {errorMessage && (
            <div className="flex items-start gap-1.5 text-xs text-destructive bg-destructive/10 p-2 rounded">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {errorOrders.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-destructive">
                  Đơn hàng lỗi ({errorOrders.length}):
                </span>
                {navigator.onLine && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs text-primary hover:text-primary/80"
                    disabled={syncing}
                    onClick={handleRetryAllErrors}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Thử lại tất cả
                  </Button>
                )}
              </div>

              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                {errorOrders.map((order) => (
                  <div
                    key={order.clientId}
                    className="flex flex-col gap-1 border border-border rounded p-2 text-xs bg-card"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-muted-foreground">
                        #{order.clientId.slice(0, 8).toUpperCase()}
                      </span>
                      <span className="font-semibold text-foreground">
                        {formatVndWithSuffix(order.orderData.total)}
                      </span>
                    </div>
                    {order.errorMessage && (
                      <span className="text-destructive text-[11px] line-clamp-2">
                        {order.errorMessage}
                      </span>
                    )}
                    {navigator.onLine && (
                      <div className="flex justify-end pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[11px]"
                          disabled={retryingClientId === order.clientId || syncing}
                          onClick={() => handleRetrySingle(order.clientId)}
                        >
                          {retryingClientId === order.clientId ? (
                            <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <RotateCcw className="h-3 w-3 mr-1" />
                          )}
                          Thử lại
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {navigator.onLine && pendingOrderCount > 0 && (
            <Button
              size="sm"
              variant="default"
              className="w-full text-xs"
              disabled={syncing}
              onClick={handleManualSync}
            >
              {syncing ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Đang đồng bộ...
                </>
              ) : (
                'Đồng bộ ngay'
              )}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { AlertCircle, CloudOff, RefreshCw, RotateCcw, ShieldAlert, WifiOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatVndWithSuffix } from '@/lib/currency'
import {
  getErrorOrders,
  type OfflineOrder,
  offlineOrderNumber,
  resetErrorOrders,
  resetSingleErrorOrder,
} from '@/lib/offline-orders'
import { requestSync } from '@/lib/offline-sync-runtime'
import { reportSyncCycleFailure } from '@/lib/order-sync'
import { getPGliteClient } from '@/lib/pglite'
import { useAuthStore } from '@/stores/use-auth-store'
import { type Connectivity, type OfflineStatus, useOfflineStore } from '@/stores/use-offline-store'

/** Câu giải thích cho người bán (OFF-20, UAT 7.1 bước 2) */
export function describeOfflineState(
  connectivity: Connectivity,
  status: OfflineStatus,
): { title: string; explanation: string | null } {
  if (connectivity === 'offline') {
    return {
      title: 'Đang ngoại tuyến',
      explanation:
        'Ứng dụng đang hoạt động ở chế độ ngoại tuyến. Dữ liệu sẽ được lưu cục bộ và tự động đồng bộ khi có mạng.',
    }
  }
  if (connectivity === 'unreachable') {
    return {
      title: 'Không kết nối được máy chủ',
      explanation:
        'Máy vẫn có mạng nhưng không gọi được máy chủ. Đơn bán lúc này được lưu trên máy và tự đồng bộ khi máy chủ trả lời lại.',
    }
  }
  if (status === 'error') return { title: 'Lỗi đồng bộ', explanation: null }
  return { title: 'Đồng bộ dữ liệu', explanation: null }
}

/** Nhãn đọc màn hình cho nút chỉ báo: nói rõ trạng thái và số đơn */
export function indicatorAriaLabel(input: {
  connectivity: Connectivity
  status: OfflineStatus
  pending: number
  errors: number
}): string {
  const parts = [describeOfflineState(input.connectivity, input.status).title]
  if (input.status === 'syncing') parts.push('đang đồng bộ')
  if (input.pending > 0) parts.push(`${input.pending} đơn ngoại tuyến chưa đồng bộ`)
  if (input.errors > 0) parts.push(`${input.errors} đơn lỗi`)
  return parts.join(', ')
}

function badgeText(count: number): string {
  return count > 9 ? '9+' : String(count)
}

export function OfflineIndicator() {
  const status = useOfflineStore((s) => s.status)
  const connectivity = useOfflineStore((s) => s.connectivity)
  const errorOrderCount = useOfflineStore((s) => s.errorOrderCount)
  const otherStoreOrderCount = useOfflineStore((s) => s.otherStoreOrderCount)
  const storeId = useAuthStore((s) => s.user?.storeId ?? null)
  const pendingOrderCount = useOfflineStore((s) => s.pendingOrderCount)
  const errorMessage = useOfflineStore((s) => s.errorMessage)
  const lastSyncedAt = useOfflineStore((s) => s.lastSyncedAt)
  const reviewPendingOrders = useOfflineStore((s) => s.reviewPendingOrders)
  const dismissReviewPending = useOfflineStore((s) => s.dismissReviewPending)
  const [syncing, setSyncing] = useState(false)
  const [errorOrders, setErrorOrders] = useState<OfflineOrder[]>([])
  const [retryingClientId, setRetryingClientId] = useState<string | null>(null)

  const loadErrorOrders = useCallback(async () => {
    const pglite = getPGliteClient()
    if (!pglite || !storeId) {
      setErrorOrders([])
      return
    }
    try {
      const list = await getErrorOrders(pglite, storeId)
      setErrorOrders(list)
    } catch {
      // Bỏ qua lỗi truy vấn PGlite cục bộ
    }
  }, [storeId])

  useEffect(() => {
    loadErrorOrders()
  }, [status, pendingOrderCount, errorOrderCount, loadErrorOrders])

  const online = connectivity === 'online'

  if (
    status === 'online' &&
    online &&
    pendingOrderCount === 0 &&
    errorOrders.length === 0 &&
    otherStoreOrderCount === 0 &&
    reviewPendingOrders.length === 0
  )
    return null

  // Mọi lượt đẩy đi qua runtime để giữ khóa giữa các tab (OFF-02, OFF-04)
  const handleManualSync = async () => {
    setSyncing(true)
    try {
      await requestSync('manual')
    } catch (error) {
      reportSyncCycleFailure(error, 'manual_sync')
    } finally {
      await loadErrorOrders()
      setSyncing(false)
    }
  }

  const handleRetryAllErrors = async () => {
    const pglite = getPGliteClient()
    if (!pglite || !storeId) return

    setSyncing(true)
    try {
      await resetErrorOrders(pglite, storeId)
      await requestSync('manual')
    } catch (error) {
      reportSyncCycleFailure(error, 'manual_sync')
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
      await resetSingleErrorOrder(pglite, clientId)
      await requestSync('manual')
    } catch (error) {
      reportSyncCycleFailure(error, 'manual_sync')
    } finally {
      await loadErrorOrders()
      setRetryingClientId(null)
    }
  }

  const errorCount = Math.max(errorOrderCount, errorOrders.length)
  const { title, explanation } = describeOfflineState(connectivity, status)
  const ariaLabel = indicatorAriaLabel({
    connectivity,
    status: syncing ? 'syncing' : status,
    pending: pendingOrderCount,
    errors: errorCount,
  })

  const icon =
    connectivity === 'offline' ? (
      <WifiOff className="h-4 w-4 text-neutral-400" />
    ) : connectivity === 'unreachable' ? (
      <CloudOff className="h-4 w-4 text-neutral-400" />
    ) : status === 'syncing' || syncing ? (
      <RefreshCw className="h-4 w-4 animate-spin text-primary" />
    ) : status === 'error' || errorCount > 0 ? (
      <CloudOff className="h-4 w-4 text-amber-500" />
    ) : pendingOrderCount > 0 ? (
      <RefreshCw className="h-4 w-4 text-primary" />
    ) : reviewPendingOrders.length > 0 ? (
      <ShieldAlert className="h-4 w-4 text-orange-500" />
    ) : otherStoreOrderCount > 0 ? (
      <AlertCircle className="h-4 w-4 text-amber-500" />
    ) : null

  if (!icon) return null

  return (
    <Popover onOpenChange={(open) => open && loadErrorOrders()}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          title={ariaLabel}
          data-testid="offline-indicator"
          className="relative flex items-center gap-1 p-1 rounded hover:bg-accent focus:outline-none"
        >
          {icon}
          {/* Huy hiệu tách riêng (OFF-20): xanh là đơn đang chờ, đỏ là đơn lỗi cần xử lý */}
          {pendingOrderCount > 0 && (
            <span
              aria-hidden="true"
              data-testid="offline-pending-badge"
              className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-0.5 text-[10px] text-primary-foreground"
            >
              {badgeText(pendingOrderCount)}
            </span>
          )}
          {errorCount > 0 && (
            <span
              aria-hidden="true"
              data-testid="offline-error-badge"
              className="absolute -bottom-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] text-white"
            >
              {badgeText(errorCount)}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-foreground">{title}</div>
            {lastSyncedAt && (
              <span className="text-[11px] text-muted-foreground">
                {new Date(lastSyncedAt).toLocaleTimeString('vi-VN')}
              </span>
            )}
          </div>

          {explanation && <p className="text-xs text-muted-foreground">{explanation}</p>}

          {pendingOrderCount > 0 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/50 p-2 rounded">
              <span>Đơn ngoại tuyến chưa đồng bộ:</span>
              <span className="font-medium text-foreground">{pendingOrderCount}</span>
            </div>
          )}

          {reviewPendingOrders.length > 0 && (
            <div className="space-y-1.5 rounded border border-orange-200 bg-orange-50 p-2 text-xs text-orange-900">
              <div className="flex items-center justify-between">
                <span className="font-semibold">
                  Đơn chờ chủ duyệt ({reviewPendingOrders.length})
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px]"
                  onClick={dismissReviewPending}
                >
                  Đã hiểu
                </Button>
              </div>
              <p>
                Các đơn bán ngoại tuyến này vi phạm chính sách (giá, chiết khấu hoặc hạn mức nợ).
                Đơn đã được ghi nhận và đang chờ chủ cửa hàng duyệt.
              </p>
              <ul className="max-h-32 space-y-1 overflow-y-auto">
                {reviewPendingOrders.map((o) => (
                  <li key={o.clientId} className="flex items-center justify-between">
                    <Link
                      to="/orders/$orderId"
                      params={{ orderId: o.serverId }}
                      className="font-mono underline underline-offset-2"
                    >
                      {o.orderNumber ?? offlineOrderNumber(o.clientId)}
                    </Link>
                    <span className="font-medium">{formatVndWithSuffix(o.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {otherStoreOrderCount > 0 && (
            <div className="flex items-start gap-1.5 rounded bg-amber-50 p-2 text-xs text-amber-900">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Máy này còn {otherStoreOrderCount} đơn chưa đồng bộ của cửa hàng khác. Đơn đó chỉ
                được đồng bộ khi người của cửa hàng đó đăng nhập trên máy này.
              </span>
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
                  Đơn hàng lỗi ({errorCount}):
                </span>
                {online && (
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
                        {offlineOrderNumber(order.clientId)}
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
                    {online && (
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

          {connectivity !== 'offline' && pendingOrderCount > 0 && (
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

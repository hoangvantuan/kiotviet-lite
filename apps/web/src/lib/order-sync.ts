import type { PGliteInterface } from '@electric-sql/pglite'

import { SYNC_PUSH_MAX_BATCH } from '@kiotviet-lite/shared'

import { useAuthStore } from '@/stores/use-auth-store'
import { type ReviewPendingOrder, useOfflineStore } from '@/stores/use-offline-store'

import { ApiClientError, apiFetch, reportBrowserFailure } from './api-client'
import { broadcastOffline } from './offline-channel'
import {
  getPendingOrders,
  markOrderFailed,
  markOrderSynced,
  notifyOutboxChanged,
  type OfflineOrder,
  type OrderFailure,
  resetErrorOrders,
  resetSingleErrorOrder,
  scheduleOrderRetry,
} from './offline-orders'
import { runIncrementalSync } from './sync-engine'
import { showWarning } from './toast'

interface SyncPushResult {
  clientId: string
  serverId?: string
  orderNumber?: string
  status: 'synced' | 'error' | 'duplicate'
  error?: { code: string; message: string; reason?: string }
  reviewStatus?: 'none' | 'pending_review' | 'approved' | 'rejected'
}

interface SyncPushResponse {
  data: {
    results: SyncPushResult[]
    syncedAt: string
  }
}

/**
 * Lỗi tạm thời (OFF-14): đơn giữ `pending`, tự thử lại theo lịch lùi dần. Mọi mã khác là lỗi
 * nghiệp vụ, thử lại cũng ra đúng lỗi đó, nên dừng lại và báo người dùng.
 */
const TRANSIENT_CODES = new Set(['INTERNAL_ERROR', 'CONFLICT', 'LOCKED', 'RATE_LIMITED'])

export function isTransientSyncError(code: string): boolean {
  return TRANSIENT_CODES.has(code)
}

/** Câu tiếng Việt kèm hướng dẫn theo mã lỗi (OFF-14) */
const ERROR_GUIDANCE: Record<string, string> = {
  VALIDATION_ERROR:
    'Máy chủ không nhận dữ liệu đơn này. Mở đơn kiểm tra hàng hóa và số tiền, hoặc báo chủ cửa hàng.',
  NOT_FOUND:
    'Hàng hóa, khách hàng hoặc bảng giá trong đơn không còn trên hệ thống (có thể đã bị xóa). Báo chủ cửa hàng để lập lại đơn.',
  FORBIDDEN: 'Tài khoản này không được đồng bộ đơn này. Báo chủ cửa hàng kiểm tra quyền.',
  BUSINESS_RULE_VIOLATION: 'Đơn vi phạm quy định của cửa hàng. Báo chủ cửa hàng xử lý.',
  UNAUTHORIZED: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để đồng bộ, đơn vẫn nằm chờ trên máy.',
}

const REASON_GUIDANCE: Record<string, string> = {
  seller_not_in_store:
    'Người bán của đơn không thuộc cửa hàng này, đơn không được đẩy vào cửa hàng đang đăng nhập.',
}

export function describeSyncError(error: {
  code: string
  message?: string
  reason?: string
}): string {
  const guidance =
    (error.reason ? REASON_GUIDANCE[error.reason] : undefined) ?? ERROR_GUIDANCE[error.code]
  const detail = error.message?.trim()
  if (!guidance) return detail || 'Đồng bộ đơn không thành công, hệ thống sẽ tự thử lại.'
  return detail && !guidance.includes(detail) ? `${guidance} Chi tiết: ${detail}` : guidance
}

const NETWORK_FAILURE: OrderFailure = {
  code: 'NETWORK_ERROR',
  message: 'Chưa gửi được lên máy chủ, hệ thống sẽ tự thử lại khi có mạng.',
}

export interface PushOutcome {
  synced: number
  /** Đơn chuyển sang lỗi nghiệp vụ, cần người dùng xử lý */
  errors: number
  /** Đơn gặp lỗi tạm thời, vẫn chờ và sẽ tự thử lại */
  retrying: number
  /** Lỗi của cả lượt đồng bộ (mạng, phiên, quyền); đơn vẫn nằm chờ */
  blocked: OrderFailure | null
}

/**
 * Đẩy đơn chờ của cửa hàng đang đăng nhập lên máy chủ theo lô tối đa SYNC_PUSH_MAX_BATCH đơn
 * (OFF-10), lặp tới khi hết. Đơn của cửa hàng khác không bao giờ được gửi (OFF-05). Mỗi đơn
 * mang người bán gốc; máy chủ kiểm người bán thuộc cửa hàng và còn hoạt động.
 */
export async function pushPendingOrders(
  pglite: PGliteInterface,
  options: { ignoreBackoff?: boolean } = {},
): Promise<PushOutcome> {
  const outcome: PushOutcome = { synced: 0, errors: 0, retrying: 0, blocked: null }
  const auth = useAuthStore.getState()
  const storeId = auth.user?.storeId
  // Phiên ngoại tuyến (OFF-03) chưa có token: chờ làm mới phiên xong mới đẩy
  if (!storeId || !auth.accessToken) return outcome

  const processed = new Set<string>()
  const reviewPending: ReviewPendingOrder[] = []
  const store = useOfflineStore.getState()
  let touched = false

  try {
    for (;;) {
      const batch = (
        await getPendingOrders(pglite, storeId, {
          ignoreBackoff: options.ignoreBackoff,
          limit: SYNC_PUSH_MAX_BATCH + processed.size,
        })
      )
        .filter((o) => !processed.has(o.clientId))
        .slice(0, SYNC_PUSH_MAX_BATCH)
      if (batch.length === 0) break
      // Người dùng đổi phiên giữa chừng: dừng, lượt sau chạy với cửa hàng mới
      if (useAuthStore.getState().user?.storeId !== storeId) break

      if (!touched) {
        touched = true
        store.setStatus('syncing')
        broadcastSyncState()
      }
      for (const o of batch) processed.add(o.clientId)

      let json: SyncPushResponse
      try {
        json = await apiFetch<SyncPushResponse>('/api/v1/sync/push', {
          method: 'POST',
          body: { orders: batch.map(toPushPayload) },
        })
      } catch (err) {
        outcome.blocked = await handleBatchFailure(pglite, batch, err)
        break
      }

      const byClientId = new Map(batch.map((o) => [o.clientId, o]))
      for (const result of json.data.results) {
        const order = byClientId.get(result.clientId)
        if (!order) continue
        byClientId.delete(result.clientId)
        if (result.status === 'synced' || result.status === 'duplicate') {
          await markOrderSynced(pglite, result.clientId, {
            serverId: result.serverId ?? '',
            orderNumber: result.orderNumber,
          })
          outcome.synced++
          if (result.reviewStatus === 'pending_review' && result.serverId) {
            reviewPending.push({
              clientId: result.clientId,
              serverId: result.serverId,
              orderNumber: result.orderNumber ?? null,
              total: order.orderData.total,
            })
          }
          continue
        }
        const code = result.error?.code ?? 'INTERNAL_ERROR'
        const failure = { code, message: describeSyncError({ code, ...result.error }) }
        if (isTransientSyncError(code)) {
          await scheduleOrderRetry(pglite, [result.clientId], failure)
          outcome.retrying++
        } else {
          await markOrderFailed(pglite, result.clientId, failure)
          outcome.errors++
        }
      }
      // Máy chủ không trả kết quả cho đơn nào đó: coi như chưa gửi được, thử lại sau
      if (byClientId.size > 0) {
        await scheduleOrderRetry(pglite, [...byClientId.keys()], {
          code: 'INTERNAL_ERROR',
          message: 'Máy chủ chưa xác nhận đơn này, hệ thống sẽ tự thử lại.',
        })
        outcome.retrying += byClientId.size
      }
      store.setLastSynced(json.data.syncedAt)
      await notifyOutboxChanged(pglite)
    }
  } finally {
    if (touched) {
      if (reviewPending.length > 0) {
        // ADR-0009: đơn đã được nhận nhưng vi phạm chính sách, người bán phải biết đơn đang chờ duyệt
        store.addReviewPending(reviewPending)
        showWarning(
          `${reviewPending.length} đơn ngoại tuyến vi phạm chính sách (giá, chiết khấu, hạn mức nợ hoặc giờ bán) đã được ghi nhận và đang chờ chủ duyệt`,
        )
      }
      await notifyOutboxChanged(pglite)
      applySyncStatus(outcome, useOfflineStore.getState().errorOrderCount)
    }
  }

  return outcome
}

function toPushPayload(o: OfflineOrder) {
  return {
    clientId: o.clientId,
    createdAt: o.createdAt,
    ...(o.userId ? { sellerUserId: o.userId } : {}),
    orderData: o.orderData,
  }
}

async function handleBatchFailure(
  pglite: PGliteInterface,
  batch: OfflineOrder[],
  err: unknown,
): Promise<OrderFailure> {
  const apiError = err instanceof ApiClientError ? err : null
  if (apiError?.status === 401) {
    // Phiên hết hạn và không làm mới được: đơn vẫn chờ, không tăng số lần thử
    return { code: 'UNAUTHORIZED', message: ERROR_GUIDANCE.UNAUTHORIZED! }
  }
  if (apiError?.status === 403) {
    return {
      code: 'FORBIDDEN',
      message:
        'Tài khoản đang đăng nhập không có quyền bán hàng nên không đồng bộ được đơn chờ. Đăng nhập tài khoản có quyền bán hàng.',
    }
  }
  const failure =
    !apiError || apiError.status === 0 || apiError.code === 'NETWORK_ERROR'
      ? NETWORK_FAILURE
      : {
          code: apiError.code,
          message: describeSyncError({ code: apiError.code, message: apiError.message }),
        }
  reportBrowserFailure('order_sync', err, batch.length === 1 ? batch[0]!.clientId : undefined)
  await scheduleOrderRetry(
    pglite,
    batch.map((o) => o.clientId),
    failure,
  )
  return failure
}

function applySyncStatus(outcome: PushOutcome, errorOrderCount: number): void {
  const store = useOfflineStore.getState()
  if (outcome.blocked && outcome.blocked.code !== 'NETWORK_ERROR') {
    store.setError(outcome.blocked.message)
  } else if (errorOrderCount > 0) {
    store.setError(`${errorOrderCount} đơn đồng bộ lỗi, mở danh sách để xem cách xử lý`)
  } else {
    store.setStatus(store.connectivity === 'online' ? 'online' : 'offline')
  }
  broadcastSyncState()
}

export function broadcastSyncState(): void {
  const { status, errorMessage, lastSyncedAt } = useOfflineStore.getState()
  broadcastOffline({ type: 'sync-state', status, errorMessage, lastSyncedAt })
}

export async function retryErrorOrders(pglite: PGliteInterface): Promise<PushOutcome> {
  const storeId = useAuthStore.getState().user?.storeId
  if (storeId) await resetErrorOrders(pglite, storeId)
  return pushPendingOrders(pglite, { ignoreBackoff: true })
}

export async function retrySingleOrder(
  pglite: PGliteInterface,
  clientId: string,
): Promise<PushOutcome> {
  await resetSingleErrorOrder(pglite, clientId)
  return pushPendingOrders(pglite, { ignoreBackoff: true })
}

export async function startSyncCycle(
  pglite: PGliteInterface,
  _apiBase?: string,
  _token?: string,
  lastSyncedAt?: string | null,
): Promise<string> {
  const pushResult = await pushPendingOrders(pglite, { ignoreBackoff: true })

  let newWatermark = lastSyncedAt ?? new Date(0).toISOString()
  let incrementalFailureId: string | null = null
  if (lastSyncedAt) {
    try {
      newWatermark = await runIncrementalSync(pglite, lastSyncedAt)
    } catch (error) {
      // Keep the previous watermark so a later cycle can retry the pull.
      incrementalFailureId = reportBrowserFailure('incremental_sync', error)
    }
  }

  const store = useOfflineStore.getState()
  store.setLastSynced(newWatermark)

  if (incrementalFailureId && pushResult.errors === 0) {
    store.setError(`Đồng bộ dữ liệu mới thất bại (Mã lỗi: ${incrementalFailureId})`)
  }
  return newWatermark
}

export function reportSyncCycleFailure(error: unknown, event: 'auto_sync' | 'manual_sync'): void {
  const requestId = reportBrowserFailure(event, error)
  useOfflineStore
    .getState()
    .setError(`Không thể đồng bộ dữ liệu (Mã lỗi: ${requestId}). Vui lòng thử lại.`)
}

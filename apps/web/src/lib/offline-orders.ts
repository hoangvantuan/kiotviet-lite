import type { PGliteInterface } from '@electric-sql/pglite'

import {
  type CreateOrderInput,
  createOrderSchema,
  OFFLINE_ORDER_NUMBER_PREFIX,
} from '@kiotviet-lite/shared'

import { useAuthStore } from '@/stores/use-auth-store'
import { type OutboxCounts, useOfflineStore } from '@/stores/use-offline-store'

import { broadcastOffline } from './offline-channel'

export interface OfflineOrder {
  id: string
  storeId: string
  /** Người bán gốc (OFF-05). Đơn lưu bởi bản cũ không có, máy chủ khi đó ghi cho người đồng bộ. */
  userId: string | null
  clientId: string
  syncStatus: string
  orderData: CreateOrderInput
  /** Giờ bán trên máy (OFF-11), máy chủ dùng làm giờ của đơn trong giới hạn cho phép */
  createdAt: string
  syncedAt: string | null
  serverId: string | null
  /** Mã đơn máy chủ cấp sau khi đồng bộ (OFF-17), thay mã tạm khi in lại */
  serverOrderNumber: string | null
  errorCode: string | null
  errorMessage: string | null
  retryCount: number
  lastRetryAt: string | null
  nextRetryAt: string | null
}

export interface OfflineOrderOwner {
  storeId: string
  userId: string
}

/** Mã tạm của đơn bán ngoại tuyến, đổi sang mã máy chủ sau khi đồng bộ (OFF-17) */
export function offlineOrderNumber(clientId: string): string {
  return `${OFFLINE_ORDER_NUMBER_PREFIX}${clientId.slice(0, 8).toUpperCase()}`
}

/** Lỗi tạm thời thử lại theo lịch lùi dần: 5 giây, 10, 20, ... tối đa 5 phút */
export const RETRY_BASE_SECONDS = 5
export const RETRY_MAX_SECONDS = 300

export function retryDelaySeconds(retryCount: number): number {
  return Math.min(RETRY_MAX_SECONDS, RETRY_BASE_SECONDS * 2 ** Math.min(retryCount, 10))
}

/** Đơn đã đồng bộ giữ lại trên máy để in lại, quá hạn này thì dọn (OFF-14) */
export const SYNCED_ORDER_RETENTION_DAYS = 7

/**
 * OFF-13: mã PIN duyệt không bao giờ được ghi xuống cơ sở dữ liệu trình duyệt (ADR-0002). Bỏ PIN
 * thì máy chủ xử lý đơn theo nhánh "không có PIN": vẫn nhận đơn, đưa vào hàng chờ chủ duyệt
 * (ADR-0009). Cờ vượt hạn mức phải tắt theo vì lược đồ đòi có PIN khi cờ bật.
 */
export function stripOfflineSecrets(orderData: CreateOrderInput): CreateOrderInput {
  const rest = { ...orderData } as CreateOrderInput & {
    debtLimitOverridePin?: string
    priceOverridePin?: string
  }
  delete rest.debtLimitOverridePin
  delete rest.priceOverridePin
  return { ...rest, debtLimitOverridden: false }
}

/**
 * Lưu đơn vào hàng chờ ngoại tuyến. `clientId` do nơi gọi cấp và PHẢI trùng với clientId đã gửi
 * trong lần bán trực tuyến trước đó (nếu có): lần gửi đó có thể đã được máy chủ lưu mà mất phản
 * hồi, khi đồng bộ máy chủ nhận ra cùng clientId và không tạo đơn thứ hai (R4, OFF-07).
 * Gọi lại với cùng clientId không thêm dòng mới.
 *
 * OFF-04: tab chủ đóng đúng lúc đang ghi thì PGliteWorker báo lỗi "Leader changed" và không rõ
 * lệnh đã ghi hay chưa. Vì gọi lại an toàn theo clientId, ở đây tự thử lại qua tab chủ mới.
 */
export async function saveOfflineOrder(
  pglite: PGliteInterface,
  owner: OfflineOrderOwner,
  orderData: CreateOrderInput,
  clientId: string,
): Promise<string> {
  const safeData = stripOfflineSecrets(createOrderSchema.parse(orderData))

  for (let attempt = 1; ; attempt++) {
    try {
      await insertOutboxRow(pglite, owner, safeData, clientId)
      break
    } catch (error) {
      if (!isLeaderChanged(error) || attempt >= MAX_LEADER_CHANGE_RETRIES) throw error
    }
  }

  // Đơn đã lưu; đếm lại hỏng vì đổi tab chủ thì lượt đồng bộ sau đếm lại, không báo lỗi bán hàng
  await notifyOutboxChanged(pglite).catch((error: unknown) => {
    if (!isLeaderChanged(error)) throw error
  })
  return clientId
}

const MAX_LEADER_CHANGE_RETRIES = 3

/** Lỗi PGliteWorker (LeaderChangedError) khi tab chủ đổi giữa chừng một lệnh */
export function isLeaderChanged(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('Leader changed')
}

async function insertOutboxRow(
  pglite: PGliteInterface,
  owner: OfflineOrderOwner,
  safeData: CreateOrderInput,
  clientId: string,
): Promise<void> {
  const existing = await pglite.query<{ client_id: string }>(
    `SELECT client_id FROM offline_orders WHERE client_id = $1 LIMIT 1`,
    [clientId],
  )
  if (existing.rows.length > 0) return

  await pglite.query(
    `INSERT INTO offline_orders (id, store_id, user_id, client_id, sync_status, order_data, created_at)
     VALUES ($1, $2, $3, $4, 'pending', $5, $6)`,
    [
      crypto.randomUUID(),
      owner.storeId,
      owner.userId,
      clientId,
      JSON.stringify(safeData),
      new Date().toISOString(),
    ],
  )
}

interface OfflineOrderRow {
  id: string
  store_id: string
  user_id: string | null
  client_id: string
  sync_status: string
  order_data: string | CreateOrderInput
  created_at: string | Date
  synced_at: string | Date | null
  server_id: string | null
  server_order_number: string | null
  error_code: string | null
  error_message: string | null
  retry_count: number | null
  last_retry_at: string | Date | null
  next_retry_at: string | Date | null
}

/**
 * Đơn ngoại tuyến chưa đồng bộ của một cửa hàng, cũ nhất trước. Mặc định bỏ qua đơn đang chờ tới lượt thử
 * lại (`next_retry_at` chưa tới); `ignoreBackoff` dùng khi vừa có mạng lại hay người dùng bấm
 * đồng bộ, lúc đó thử ngay.
 */
export async function getPendingOrders(
  pglite: PGliteInterface,
  storeId: string,
  options: { limit?: number; now?: Date; ignoreBackoff?: boolean } = {},
): Promise<OfflineOrder[]> {
  const now = (options.now ?? new Date()).toISOString()
  const result = await pglite.query<OfflineOrderRow>(
    `SELECT * FROM offline_orders
     WHERE sync_status = 'pending' AND store_id = $1
       AND ($2::boolean OR next_retry_at IS NULL OR next_retry_at <= $3::timestamptz)
     ORDER BY created_at ASC, client_id ASC
     LIMIT $4`,
    [storeId, options.ignoreBackoff ?? false, now, options.limit ?? 10_000],
  )
  return result.rows.map(mapRow)
}

export async function getErrorOrders(
  pglite: PGliteInterface,
  storeId: string,
): Promise<OfflineOrder[]> {
  const result = await pglite.query<OfflineOrderRow>(
    `SELECT * FROM offline_orders WHERE sync_status = 'error' AND store_id = $1
     ORDER BY created_at ASC`,
    [storeId],
  )
  return result.rows.map(mapRow)
}

export async function getOfflineOrder(
  pglite: PGliteInterface,
  clientId: string,
): Promise<OfflineOrder | null> {
  const result = await pglite.query<OfflineOrderRow>(
    `SELECT * FROM offline_orders WHERE client_id = $1 LIMIT 1`,
    [clientId],
  )
  const row = result.rows[0]
  return row ? mapRow(row) : null
}

/** Máy chủ đã có đơn: luôn thắng mọi trạng thái khác, kể cả khi tab khác vừa đánh lỗi */
export async function markOrderSynced(
  pglite: PGliteInterface,
  clientId: string,
  server: { serverId: string; orderNumber?: string | null },
): Promise<void> {
  await pglite.query(
    `UPDATE offline_orders SET sync_status = 'synced', server_id = $1,
       server_order_number = COALESCE($2, server_order_number), synced_at = $3,
       error_code = NULL, error_message = NULL, next_retry_at = NULL
     WHERE client_id = $4`,
    [server.serverId, server.orderNumber ?? null, new Date().toISOString(), clientId],
  )
}

export interface OrderFailure {
  code: string
  message: string
}

/**
 * Lỗi nghiệp vụ không tự hết (OFF-14): chuyển sang `error`, chờ người dùng xử lý. Chỉ đổi dòng
 * còn `pending`, để tab chậm hơn không ghi đè đơn tab khác vừa đồng bộ xong.
 */
export async function markOrderFailed(
  pglite: PGliteInterface,
  clientId: string,
  failure: OrderFailure,
): Promise<void> {
  await pglite.query(
    `UPDATE offline_orders SET sync_status = 'error', error_code = $1, error_message = $2,
       retry_count = COALESCE(retry_count, 0) + 1, last_retry_at = $3, next_retry_at = NULL
     WHERE client_id = $4 AND sync_status = 'pending'`,
    [failure.code, failure.message, new Date().toISOString(), clientId],
  )
}

/**
 * Lỗi tạm thời (mạng, máy chủ bận): đơn vẫn `pending`, hẹn giờ thử lại theo lịch lùi dần. Người
 * dùng không phải làm gì.
 */
export async function scheduleOrderRetry(
  pglite: PGliteInterface,
  clientIds: string[],
  failure: OrderFailure,
  now: Date = new Date(),
): Promise<void> {
  if (clientIds.length === 0) return
  await pglite.query(
    `UPDATE offline_orders SET error_code = $1, error_message = $2,
       retry_count = COALESCE(retry_count, 0) + 1, last_retry_at = $3::timestamptz,
       next_retry_at = $3::timestamptz + make_interval(secs => LEAST(${RETRY_MAX_SECONDS},
         ${RETRY_BASE_SECONDS} * power(2, LEAST(COALESCE(retry_count, 0), 10))))
     WHERE client_id = ANY($4::text[]) AND sync_status = 'pending'`,
    [failure.code, failure.message, now.toISOString(), clientIds],
  )
}

/** Người dùng bấm thử lại: đơn lỗi của cửa hàng này về hàng chờ, thử ngay */
export async function resetErrorOrders(pglite: PGliteInterface, storeId: string): Promise<number> {
  const result = await pglite.query(
    `UPDATE offline_orders SET sync_status = 'pending', error_code = NULL, error_message = NULL,
       next_retry_at = NULL
     WHERE sync_status = 'error' AND store_id = $1`,
    [storeId],
  )
  await notifyOutboxChanged(pglite)
  return result.affectedRows ?? 0
}

export async function resetSingleErrorOrder(
  pglite: PGliteInterface,
  clientId: string,
): Promise<boolean> {
  const result = await pglite.query(
    `UPDATE offline_orders SET sync_status = 'pending', error_code = NULL, error_message = NULL,
       next_retry_at = NULL
     WHERE client_id = $1 AND sync_status = 'error'`,
    [clientId],
  )
  await notifyOutboxChanged(pglite)
  return (result.affectedRows ?? 0) > 0
}

/** Dọn đơn đã đồng bộ quá hạn giữ (OFF-14): máy chủ đã có, máy không cần giữ mãi */
export async function purgeSyncedOrders(
  pglite: PGliteInterface,
  olderThanDays = SYNCED_ORDER_RETENTION_DAYS,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString()
  const result = await pglite.query(
    `DELETE FROM offline_orders WHERE sync_status = 'synced' AND synced_at < $1::timestamptz`,
    [cutoff],
  )
  return result.affectedRows ?? 0
}

/**
 * Đếm đơn theo cửa hàng. `otherStores` là đơn chờ hoặc lỗi của cửa hàng khác trên cùng máy
 * (người trước đăng xuất khi còn đơn): chỉ để cảnh báo, không bao giờ đẩy vào cửa hàng hiện tại.
 */
export async function getOrderCounts(
  pglite: PGliteInterface,
  storeId: string | null,
): Promise<OutboxCounts & { synced: number }> {
  const result = await pglite.query<{ mine: boolean; sync_status: string; count: string }>(
    `SELECT (store_id = $1) AS mine, sync_status, COUNT(*)::text AS count
     FROM offline_orders GROUP BY 1, 2`,
    [storeId ?? ''],
  )
  const counts = { pending: 0, error: 0, synced: 0, otherStores: 0 }
  for (const row of result.rows) {
    const c = parseInt(row.count, 10)
    if (!row.mine) {
      if (row.sync_status !== 'synced') counts.otherStores += c
    } else if (row.sync_status === 'pending') counts.pending = c
    else if (row.sync_status === 'synced') counts.synced = c
    else if (row.sync_status === 'error') counts.error = c
  }
  return counts
}

/** Đọc lại số đơn của cửa hàng đang đăng nhập vào store của tab này */
export async function refreshOutboxCounts(pglite: PGliteInterface): Promise<OutboxCounts> {
  const storeId = useAuthStore.getState().user?.storeId ?? null
  const counts = await getOrderCounts(pglite, storeId)
  useOfflineStore.getState().setOutboxCounts(counts)
  return counts
}

/** Hàng chờ vừa đổi: cập nhật tab này và báo các tab khác đọc lại (OFF-14) */
export async function notifyOutboxChanged(pglite: PGliteInterface): Promise<void> {
  await refreshOutboxCounts(pglite)
  broadcastOffline({ type: 'outbox-changed' })
}

function iso(value: string | Date | null): string | null {
  if (value === null) return null
  return value instanceof Date ? value.toISOString() : value
}

function mapRow(row: OfflineOrderRow): OfflineOrder {
  return {
    id: row.id,
    storeId: row.store_id,
    userId: row.user_id ?? null,
    clientId: row.client_id,
    syncStatus: row.sync_status,
    orderData: typeof row.order_data === 'string' ? JSON.parse(row.order_data) : row.order_data,
    createdAt: iso(row.created_at)!,
    syncedAt: iso(row.synced_at),
    serverId: row.server_id,
    serverOrderNumber: row.server_order_number ?? null,
    errorCode: row.error_code ?? null,
    errorMessage: row.error_message,
    retryCount: row.retry_count ?? 0,
    lastRetryAt: iso(row.last_retry_at),
    nextRetryAt: iso(row.next_retry_at),
  }
}

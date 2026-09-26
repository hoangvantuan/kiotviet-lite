import {
  SYNC_PULL_ENTITIES,
  type SyncCursor,
  type SyncPullEntity,
  type SyncPullResponse,
} from '../schema/sync-management.js'
import {
  applyPullPage,
  clearCatalogStoreData,
  getCatalogSyncMeta,
  getCursor,
  type OfflineDb,
  setCatalogSyncMeta,
} from './catalog-store.js'

export interface PullPageRequest {
  entity: SyncPullEntity
  cursor: SyncCursor | null
  /** Trang đầu của lượt gia tăng: thời điểm bắt đầu lượt trước, để máy chủ đọc lại dòng commit muộn */
  since: string | null
}

export interface CatalogSyncProgress {
  entity: SyncPullEntity
  /** Số dòng đã nạp trong lượt này (mọi loại dữ liệu) */
  loaded: number
  /** Tổng số dòng cần nạp, chỉ biết ở lần đồng bộ từ đầu */
  total: number | null
}

export interface CatalogSyncResult {
  full: boolean
  loaded: number
  syncedAt: string
}

/** Chuỗi query của GET /api/v1/sync/pull cho một yêu cầu trang */
export function pullPageQuery(req: PullPageRequest): string {
  const params = new URLSearchParams({ entity: req.entity })
  if (req.cursor) {
    params.set('after', req.cursor.t)
    params.set('afterId', req.cursor.id)
    if (req.since) params.set('since', req.since)
  }
  return params.toString()
}

/**
 * GL-03: một lượt đồng bộ danh mục. Lần đầu tải từng trang theo con trỏ (không cắt ở 500 dòng,
 * không kéo cả danh mục một lần), mỗi trang nạp trong một transaction kèm con trỏ, nên bị ngắt
 * giữa chừng thì lần sau đọc tiếp. Các lần sau chỉ kéo dòng đổi sau con trỏ, kèm dấu xóa.
 *
 * Quyền xem giá vốn khác với lúc tải (đổi người dùng, đổi vai trò) thì xóa sạch và tải lại, để
 * thiết bị của nhân viên không giữ giá vốn đã tải bởi chủ (BC-13).
 */
export async function syncCatalog({
  db,
  storeId,
  canViewCost,
  fetchPage,
  onProgress,
}: {
  db: OfflineDb
  storeId: string
  canViewCost: boolean
  fetchPage: (req: PullPageRequest) => Promise<SyncPullResponse>
  onProgress?: (progress: CatalogSyncProgress) => void
}): Promise<CatalogSyncResult> {
  let meta = await getCatalogSyncMeta(db, storeId)
  if (meta && meta.withCost !== canViewCost) {
    await clearCatalogStoreData(db, storeId)
    meta = null
  }
  if (!meta) {
    meta = { withCost: canViewCost, syncedAt: null }
    await setCatalogSyncMeta(db, storeId, meta)
  }
  const full = meta.syncedAt === null

  let loaded = 0
  let total: number | null = full ? 0 : null
  let roundStartedAt: string | null = null

  for (let index = 0; index < SYNC_PULL_ENTITIES.length; index++) {
    const entity = SYNC_PULL_ENTITIES[index]!
    let cursor = await getCursor(db, storeId, entity)
    let since = cursor !== null ? meta.syncedAt : null
    for (;;) {
      const page = await fetchPage({ entity, cursor, since })
      roundStartedAt ??= page.meta.serverTime
      if (page.meta.resetRequired) {
        // Máy khách vắng mặt lâu hơn hạn lưu dấu xóa: không biết dòng nào đã mất, tải lại từ đầu
        await clearCatalogStoreData(db, storeId)
        await setCatalogSyncMeta(db, storeId, { withCost: canViewCost, syncedAt: null })
        return syncCatalog({ db, storeId, canViewCost, fetchPage, onProgress })
      }
      await applyPullPage(db, storeId, page)
      loaded += page.data.rows.length + page.data.deleted.length
      if (total !== null && page.meta.total !== undefined) total += page.meta.total
      onProgress?.({ entity, loaded, total })
      if (!page.meta.hasMore) break
      cursor = page.meta.nextCursor
      since = null
    }
  }

  const syncedAt = roundStartedAt ?? new Date().toISOString()
  await setCatalogSyncMeta(db, storeId, { withCost: canViewCost, syncedAt })
  return { full, loaded, syncedAt }
}

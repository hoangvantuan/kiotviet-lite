import {
  SYNC_PULL_ENTITIES,
  type SyncCursor,
  type SyncPullEntity,
  type SyncPullResponse,
} from '../schema/sync-management.js'
import {
  applyPullPage,
  type CatalogEntity,
  type CatalogSyncMeta,
  clearCatalogStoreData,
  finishCatalogReload,
  getCatalogSyncMeta,
  getCursor,
  type OfflineDb,
  purgeCatalogCostIfForbidden,
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
 * Phải tải lại khi đã có bản sao (máy vắng mặt quá hạn lưu dấu xóa, hoặc người dùng mới xem được
 * giá vốn mà bản sao không có) thì giữ bản sao cũ để POS vẫn bán ngoại tuyến được, tải đè lên rồi
 * mới dọn dòng không còn ({@link finishCatalogReload}). Người dùng không có quyền xem giá vốn thì
 * giá vốn bị xóa khỏi máy trước khi làm gì khác (BC-13).
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
  await purgeCatalogCostIfForbidden(db, storeId, canViewCost)
  let meta = await getCatalogSyncMeta(db, storeId)
  if (meta && meta.syncedAt === null && meta.withCost !== canViewCost) {
    // Lượt đầu dở dang với quyền khác: chưa có gì để bán, bỏ đi tải lại cho đúng quyền
    await clearCatalogStoreData(db, storeId)
    meta = null
  }
  if (!meta) {
    meta = { withCost: canViewCost, syncedAt: null }
    await setCatalogSyncMeta(db, storeId, meta)
  }
  // Bản sao đang dùng mà thiếu giá vốn người dùng được xem: tải lại, giữ bản cũ tới khi xong
  const reload = meta.syncedAt !== null && meta.withCost !== canViewCost
  return runSync({ db, storeId, canViewCost, fetchPage, onProgress }, meta, reload)
}

async function runSync(
  {
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
  },
  meta: CatalogSyncMeta,
  reload: boolean,
): Promise<CatalogSyncResult> {
  const full = reload || meta.syncedAt === null
  let loaded = 0
  let total: number | null = full ? 0 : null
  let roundStartedAt: string | null = null
  // Chỉ dùng khi tải lại: dòng còn sống và con trỏ cuối của từng loại, ghi một lần lúc xong
  const seen = new Map<CatalogEntity, string[]>()
  const cursors = new Map<SyncPullEntity, SyncCursor>()
  const pulledAt = new Map<SyncPullEntity, string>()

  for (let index = 0; index < SYNC_PULL_ENTITIES.length; index++) {
    const entity = SYNC_PULL_ENTITIES[index]!
    let cursor = reload ? null : await getCursor(db, storeId, entity)
    let since = cursor !== null ? meta.syncedAt : null
    for (;;) {
      const page = await fetchPage({ entity, cursor, since })
      roundStartedAt ??= page.meta.serverTime
      if (page.meta.resetRequired) {
        // Máy vắng mặt lâu hơn hạn lưu dấu xóa: không biết dòng nào đã mất, tải lại từ đầu
        if (meta.syncedAt !== null && !reload) {
          return runSync({ db, storeId, canViewCost, fetchPage, onProgress }, meta, true)
        }
        // Chưa có bản sao dùng được (lượt đầu dở dang quá lâu): bỏ phần đã tải, tải lại
        await clearCatalogStoreData(db, storeId)
        const fresh = { withCost: canViewCost, syncedAt: null }
        await setCatalogSyncMeta(db, storeId, fresh)
        return runSync({ db, storeId, canViewCost, fetchPage, onProgress }, fresh, false)
      }
      await applyPullPage(db, storeId, page, { saveCursor: !reload })
      if (reload) {
        if (page.meta.nextCursor) cursors.set(entity, page.meta.nextCursor)
        if (!page.meta.hasMore) pulledAt.set(entity, page.meta.serverTime)
        if (entity !== 'tombstones') {
          const ids = seen.get(entity) ?? []
          for (const row of page.data.rows as Array<{ id: string }>) ids.push(row.id)
          seen.set(entity, ids)
        }
      }
      loaded += page.data.rows.length + page.data.deleted.length
      if (total !== null && page.meta.total !== undefined) total += page.meta.total
      onProgress?.({ entity, loaded, total })
      if (!page.meta.hasMore) break
      cursor = page.meta.nextCursor
      since = null
    }
  }

  const syncedAt = roundStartedAt ?? new Date().toISOString()
  const done = { withCost: canViewCost, syncedAt }
  if (reload) await finishCatalogReload(db, storeId, { seen, cursors, pulledAt, meta: done })
  else await setCatalogSyncMeta(db, storeId, done)
  return { full, loaded, syncedAt }
}

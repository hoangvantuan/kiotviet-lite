import type { PGliteInterface as PGlite } from '@electric-sql/pglite'

import { hasPermission, type SyncPullResponse } from '@kiotviet-lite/shared'
import {
  type CatalogSyncResult,
  clearCatalogStoreData,
  clearOtherStoresCatalog,
  getCatalogSyncMeta,
  type OfflineDb,
  pullPageQuery,
  syncCatalog,
} from '@kiotviet-lite/shared/offline'

import { useAuthStore } from '@/stores/use-auth-store'
import { useCatalogSyncStore } from '@/stores/use-catalog-sync-store'

import { apiFetch } from './api-client'
import { getOfflineDB } from './pglite'

interface SchemaVersionResponse {
  data: { version: number }
}

/** Mỗi trang tối đa 1000 dòng; chờ lâu hơn request thường vì máy chủ phải quét và máy phải nạp */
const PAGE_TIMEOUT_MS = 30_000

let inFlight: Promise<CatalogSyncResult | null> | null = null

async function openCatalogDb(pglite?: PGlite): Promise<OfflineDb> {
  if (pglite) return pglite as unknown as OfflineDb
  return (await getOfflineDB()) as unknown as OfflineDb
}

function syncErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? `Đồng bộ danh mục thất bại: ${error.message}`
    : 'Đồng bộ danh mục thất bại'
}

/**
 * GL-03: đồng bộ danh mục về PGlite (lần đầu từ đầu, sau đó gia tăng). Chỉ chạy một lượt tại một
 * thời điểm; gọi trong lúc đang chạy thì nhận chung kết quả của lượt đó. Chưa đăng nhập thì bỏ qua.
 */
export function syncCatalogNow(pglite?: PGlite): Promise<CatalogSyncResult | null> {
  const user = useAuthStore.getState().user
  if (!user) return Promise.resolve(null)

  inFlight ??= (async () => {
    const store = useCatalogSyncStore.getState()
    const db = await openCatalogDb(pglite)
    // Máy chỉ giữ danh mục của cửa hàng đang đăng nhập
    await clearOtherStoresCatalog(db, user.storeId)
    const meta = await getCatalogSyncMeta(db, user.storeId)
    store.start(!meta?.syncedAt)
    try {
      const result = await syncCatalog({
        db,
        storeId: user.storeId,
        canViewCost: hasPermission(user.role, 'products.viewCost'),
        fetchPage: (req) =>
          apiFetch<SyncPullResponse>(`/api/v1/sync/pull?${pullPageQuery(req)}`, {
            timeoutMs: PAGE_TIMEOUT_MS,
          }),
        onProgress: ({ loaded, total }) => useCatalogSyncStore.getState().progress(loaded, total),
      })
      useCatalogSyncStore.getState().finish(result.syncedAt)
      return result
    } catch (error) {
      useCatalogSyncStore.getState().fail(syncErrorMessage(error))
      throw error
    }
  })().finally(() => {
    inFlight = null
  })
  return inFlight
}

/** Đọc thời điểm đồng bộ gần nhất đã lưu trong PGlite vào store (khi mở POS) */
export async function loadCatalogSyncInfo(pglite?: PGlite): Promise<string | null> {
  const user = useAuthStore.getState().user
  if (!user) return null
  const db = await openCatalogDb(pglite)
  const meta = await getCatalogSyncMeta(db, user.storeId)
  const syncedAt = meta?.syncedAt ?? null
  useCatalogSyncStore.getState().setSyncedAt(syncedAt)
  return syncedAt
}

/** Xóa bản sao danh mục của một cửa hàng (đăng xuất, đổi cửa hàng) */
export async function clearCatalogData(pglite: PGlite, storeId: string): Promise<void> {
  await clearCatalogStoreData(pglite as unknown as OfflineDb, storeId)
  useCatalogSyncStore.getState().reset()
}

/**
 * Giữ chữ ký cũ cho chu kỳ đồng bộ đơn (order-sync): kéo danh mục mới rồi trả về mốc đồng bộ.
 * Mốc cũ không còn dùng để lọc (con trỏ nằm trong PGlite), chỉ trả lại khi không có phiên.
 */
export async function runIncrementalSync(pglite: PGlite, lastSyncedAt: string): Promise<string> {
  const result = await syncCatalogNow(pglite)
  return result?.syncedAt ?? lastSyncedAt
}

export async function checkSchemaVersion(): Promise<{ version: number }> {
  const json = await apiFetch<SchemaVersionResponse>('/api/v1/sync/schema-version')
  return json.data
}

/**
 * OFF-04, chuyển tiếp từ bản cũ: bản trước mở PGlite thẳng trên tab, không qua worker và không giữ
 * khóa bầu tab chủ, nên worker chủ của bản mới không thấy tab đó. Hai bên cùng mở
 * `idb://kiotviet-lite` thì ghi đè hệ thống tệp của nhau, mất đơn chờ.
 *
 * Dấu hiệu nhận ra: PGlite (IDBFS của Emscripten) giữ một kết nối IndexedDB mở suốt đời tab và
 * không nghe `versionchange`. Worker chủ xin mở với phiên bản cao hơn: còn kết nối khác thì trình
 * duyệt báo `blocked`, worker chờ tới khi tab đó đóng hoặc tải lại. Không còn ai thì hủy bước nâng
 * cấp ngay, phiên bản và dữ liệu giữ nguyên.
 *
 * Module này không import PGlite hay drizzle để worker nhẹ.
 */

/** Kênh worker chủ báo trạng thái mở cơ sở dữ liệu cho mọi tab */
export const OFFLINE_DB_STATUS_CHANNEL = 'kvl-offline-db-status'

export type OfflineDBStatus = { type: 'legacy-tab-open' } | { type: 'opened' }

/** Phiên bản IndexedDB mà IDBFS của PGlite dùng, khi trình duyệt không liệt kê được cơ sở dữ liệu */
const IDBFS_DB_VERSION = 21

/** Tên cơ sở dữ liệu IndexedDB mà PGlite dùng cho `idb://<tên>`, null nếu không phải idb */
export function pgliteIndexedDBName(dataDir: string | undefined): string | null {
  return dataDir?.startsWith('idb://') ? `/pglite/${dataDir.slice('idb://'.length)}` : null
}

/**
 * Chờ tới khi không còn kết nối nào khác vào cơ sở dữ liệu IndexedDB `name`. Gọi `onBlocked` khi
 * phát hiện có kết nối khác (tab bản cũ đang mở). Không bao giờ ném lỗi và không đổi dữ liệu.
 */
export async function waitForOtherConnectionsClosed(
  factory: IDBFactory,
  name: string,
  onBlocked: () => void,
): Promise<void> {
  let version = IDBFS_DB_VERSION
  if (typeof factory.databases === 'function') {
    try {
      const found = (await factory.databases()).find((db) => db.name === name)
      // Chưa có cơ sở dữ liệu thì không ai đang mở nó
      if (!found) return
      version = found.version ?? version
    } catch {
      // Không liệt kê được: thử với phiên bản mặc định của IDBFS
    }
  }
  await new Promise<void>((resolve) => {
    let request: IDBOpenDBRequest
    try {
      request = factory.open(name, version + 1)
    } catch {
      resolve()
      return
    }
    request.onblocked = () => onBlocked()
    // Không còn kết nối khác: hủy nâng cấp để giữ nguyên phiên bản và không tạo cơ sở dữ liệu mới
    request.onupgradeneeded = () => request.transaction?.abort()
    request.onsuccess = () => {
      request.result.close()
      resolve()
    }
    request.onerror = (event) => {
      event.preventDefault()
      resolve()
    }
  })
}

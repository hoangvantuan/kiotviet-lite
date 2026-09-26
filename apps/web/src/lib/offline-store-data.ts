import type { PGliteInterface } from '@electric-sql/pglite'

import { CATALOG_STORE_TABLES } from '@kiotviet-lite/shared/offline'

import { notifyOutboxChanged } from './offline-orders'
import { getPGliteClient } from './pglite'

/**
 * OFF-05: danh sách bảng PGlite chứa dữ liệu của MỘT cửa hàng (danh mục hàng, khách, bảng giá,
 * bản sao tìm kiếm, bộ nhớ đệm...). Đổi cửa hàng hay đăng xuất thì các bảng này bị xóa sạch để
 * người sau không thấy dữ liệu của cửa hàng trước.
 *
 * Luồng nào thêm bảng dữ liệu cửa hàng vào PGlite PHẢI đăng ký tên bảng ở đây (sửa mảng hoặc gọi
 * `registerOfflineStoreTable`). Hàng chờ đơn `offline_orders` KHÔNG thuộc danh sách này: đơn chờ
 * là tiền đã thu, chỉ đơn đã đồng bộ mới được xóa.
 */
export const OFFLINE_STORE_TABLES: string[] = []

const TABLE_NAME = /^[a-z_][a-z0-9_]*$/

export function registerOfflineStoreTable(table: string): void {
  if (!TABLE_NAME.test(table)) throw new Error(`Tên bảng không hợp lệ: ${table}`)
  if (!OFFLINE_STORE_TABLES.includes(table)) OFFLINE_STORE_TABLES.push(table)
}

// GL-03, OFF-09: bản sao danh mục (hàng, khách, giá vốn, công nợ) và con trỏ đồng bộ. Đăng ký ngay
// khi nạp module để đăng xuất luôn dọn, kể cả khi phiên này chưa từng mở POS.
for (const table of CATALOG_STORE_TABLES) registerOfflineStoreTable(table)

/** Mốc đồng bộ danh mục (sync-engine lưu ở schema_version phiên bản -1) */
const SYNC_WATERMARK_VERSION = -1

/**
 * Xóa dữ liệu cửa hàng trong PGlite: mọi bảng đã đăng ký, mốc đồng bộ danh mục, và đơn ĐÃ đồng
 * bộ. Đơn chờ và đơn lỗi được giữ nguyên, kèm cửa hàng và người bán, để đồng bộ khi người của
 * đúng cửa hàng đó đăng nhập lại (không bao giờ đẩy sang cửa hàng khác).
 *
 * PGlite chưa mở (chưa từng vào POS trên máy này) thì không có gì để xóa.
 */
export async function clearOfflineStoreData(
  pglite: PGliteInterface | null = getPGliteClient(),
): Promise<void> {
  if (!pglite) return
  await pglite.transaction(async (tx) => {
    for (const table of OFFLINE_STORE_TABLES) {
      if (!TABLE_NAME.test(table)) continue
      const exists = await tx.query<{ found: string | null }>(
        'SELECT to_regclass($1)::text AS found',
        [table],
      )
      if (exists.rows[0]?.found) await tx.exec(`DELETE FROM ${table}`)
    }
    await tx.query('DELETE FROM schema_version WHERE version = $1', [SYNC_WATERMARK_VERSION])
    await tx.exec(`DELETE FROM offline_orders WHERE sync_status = 'synced'`)
  })
  await notifyOutboxChanged(pglite)
}

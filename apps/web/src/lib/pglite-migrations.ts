import type { PGliteInterface } from '@electric-sql/pglite'

import type { PGliteMigration } from '@kiotviet-lite/shared/migrations/pglite'

/** Máy cũ hơn bản mới nhất quá số bước này: dữ liệu danh mục nên tải lại toàn bộ. */
export const RESYNC_VERSION_GAP = 3

export async function getCurrentVersion(pglite: PGliteInterface): Promise<number> {
  try {
    const result = await pglite.query<{ version: number }>(
      'SELECT COALESCE(MAX(version), 0) as version FROM schema_version',
    )
    return result.rows[0]?.version ?? 0
  } catch {
    return 0
  }
}

/**
 * Chạy mọi migration còn thiếu theo thứ tự, mỗi bước trong một giao dịch cùng dòng
 * schema_version, để một bước lỗi giữa chừng không để lại bảng nửa vời.
 *
 * Bản cũ bỏ qua toàn bộ migration khi cách biệt phiên bản lớn hơn 3, nên máy mới cài (phiên bản
 * 0) sẽ không có bảng nào ngay khi có migration thứ 4. Cách biệt lớn chỉ còn là tín hiệu
 * `needsResync` cho dữ liệu danh mục; hàng chờ đơn (offline_orders) luôn được nâng cấp tại chỗ,
 * không bao giờ bị xóa.
 */
export async function runPGliteMigrations(
  pglite: PGliteInterface,
  migrations: PGliteMigration[],
): Promise<{ success: boolean; needsResync: boolean }> {
  const currentVersion = await getCurrentVersion(pglite)
  const pending = migrations
    .filter((m) => m.version > currentVersion)
    .sort((a, b) => a.version - b.version)

  if (pending.length === 0) return { success: true, needsResync: false }

  const latestAvailable = pending[pending.length - 1]!.version
  const needsResync = currentVersion > 0 && latestAvailable - currentVersion > RESYNC_VERSION_GAP

  for (const migration of pending) {
    await pglite.transaction(async (tx) => {
      await tx.exec(migration.sql)
      await tx.query('INSERT INTO schema_version (version, description) VALUES ($1, $2)', [
        migration.version,
        migration.name,
      ])
    })
  }

  return { success: true, needsResync }
}

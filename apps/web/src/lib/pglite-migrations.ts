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

async function getAppliedVersions(pglite: PGliteInterface): Promise<Set<number>> {
  try {
    const result = await pglite.query<{ version: number }>('SELECT version FROM schema_version')
    return new Set(result.rows.map((r) => Number(r.version)))
  } catch {
    return new Set()
  }
}

/**
 * Chạy mọi migration còn thiếu theo thứ tự, mỗi bước trong một giao dịch cùng dòng
 * schema_version, để một bước lỗi giữa chừng không để lại bảng nửa vời.
 *
 * "Còn thiếu" là chưa có dòng trong schema_version, không phải lớn hơn phiên bản cao nhất: hai
 * nhánh thêm migration song song có thể lên máy theo thứ tự khác số (v004 trước v003), so với số
 * lớn nhất thì bước số nhỏ sẽ không bao giờ chạy.
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
  const applied = await getAppliedVersions(pglite)
  const pending = migrations
    .filter((m) => !applied.has(m.version))
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

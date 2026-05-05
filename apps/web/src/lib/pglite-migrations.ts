import type { PGlite } from '@electric-sql/pglite'

import type { PGliteMigration } from '@kiotviet-lite/shared/migrations/pglite'

export async function getCurrentVersion(pglite: PGlite): Promise<number> {
  try {
    const result = await pglite.query<{ version: number }>(
      'SELECT COALESCE(MAX(version), 0) as version FROM schema_version',
    )
    return result.rows[0]?.version ?? 0
  } catch {
    return 0
  }
}

export async function runPGliteMigrations(
  pglite: PGlite,
  migrations: PGliteMigration[],
): Promise<{ success: boolean; needsResync: boolean }> {
  const currentVersion = await getCurrentVersion(pglite)
  const pending = migrations.filter((m) => m.version > currentVersion)

  if (pending.length === 0) return { success: true, needsResync: false }

  const latestAvailable = migrations[migrations.length - 1]!.version
  if (latestAvailable - currentVersion > 3) {
    return { success: false, needsResync: true }
  }

  for (const migration of pending) {
    await pglite.exec(migration.sql)
    await pglite.query('INSERT INTO schema_version (version, description) VALUES ($1, $2)', [
      migration.version,
      migration.name,
    ])
  }

  return { success: true, needsResync: false }
}

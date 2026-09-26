import { sql } from 'drizzle-orm'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from 'vitest'

import type { Db } from '../../db/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Các câu kiểm của scripts/invariants.sql (GL-14), bỏ phần psql chỉ chạy được ngoài PGlite */
const INVARIANT_INSERTS = readFileSync(
  resolve(__dirname, '../../../scripts/invariants.sql'),
  'utf8',
)
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')
  .split(';')
  .map((stmt) => stmt.trim())
  .filter((stmt) => stmt.startsWith('INSERT INTO invariant_violations'))

async function rows<T>(db: Db, query: ReturnType<typeof sql>): Promise<T[]> {
  const result = (await db.execute(query)) as unknown as { rows?: T[] } | T[]
  return Array.isArray(result) ? result : (result.rows ?? [])
}

/** Chạy bộ bất biến GL-14 trên PGlite, trả về các dòng vi phạm */
export async function invariantViolations(db: Db) {
  await db.execute(sql`
    CREATE TEMP TABLE IF NOT EXISTS invariant_violations (
      check_name text NOT NULL, store_id uuid, entity text NOT NULL, detail text NOT NULL
    )`)
  await db.execute(sql`DELETE FROM invariant_violations`)
  expect(INVARIANT_INSERTS.length).toBeGreaterThanOrEqual(9)
  for (const stmt of INVARIANT_INSERTS) await db.execute(sql.raw(stmt))
  return rows<{ check_name: string; entity: string; detail: string }>(
    db,
    sql`SELECT check_name, entity, detail FROM invariant_violations`,
  )
}

export async function expectInvariantsClean(db: Db) {
  expect(await invariantViolations(db)).toEqual([])
}

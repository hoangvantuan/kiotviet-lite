import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'

import * as schema from '@kiotviet-lite/shared/schema'

export function createPGliteClient(dataDir?: string) {
  const pglite = new PGlite(dataDir ?? 'idb://kiotviet-lite')

  const db = drizzle(pglite, {
    schema,
    casing: 'snake_case',
  })

  return { pglite, db }
}

export async function initPGliteSchema(pglite: PGlite, migrationSQL: string) {
  await pglite.exec(migrationSQL)
}

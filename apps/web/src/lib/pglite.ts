import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'

import { pgliteMigrations } from '@kiotviet-lite/shared/migrations/pglite'
import * as schema from '@kiotviet-lite/shared/schema'

import { runPGliteMigrations } from './pglite-migrations'

export type PGliteDB = ReturnType<typeof drizzle<typeof schema>>

let instance: { pglite: PGlite; db: PGliteDB } | null = null

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

export async function initializeOfflineDB(): Promise<PGliteDB> {
  if (instance) return instance.db

  const { pglite, db } = createPGliteClient('idb://kiotviet-lite')

  const { needsResync } = await runPGliteMigrations(pglite, pgliteMigrations)
  if (needsResync) {
    console.warn('[PGlite] Schema gap > 3, needs full re-sync')
  }

  instance = { pglite, db }
  return db
}

export function getPGliteDB(): PGliteDB {
  if (!instance) throw new Error('PGlite not initialized. Call initializeOfflineDB() first.')
  return instance.db
}

export function getPGliteRaw(): PGlite {
  if (!instance) throw new Error('PGlite not initialized. Call initializeOfflineDB() first.')
  return instance.pglite
}

export function getPGliteClient(): PGlite | null {
  return instance?.pglite ?? null
}

export async function closePGlite(): Promise<void> {
  if (instance) {
    await instance.pglite.close()
    instance = null
  }
}

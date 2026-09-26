import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { PGliteMigration } from '@kiotviet-lite/shared/migrations/pglite'

import { runPGliteMigrations } from './pglite-migrations'

const migration = (version: number, table: string): PGliteMigration => ({
  version,
  name: `v${version}`,
  sql: `CREATE TABLE IF NOT EXISTS ${table} (id int);`,
})

const V1: PGliteMigration = {
  version: 1,
  name: 'v1',
  sql: `CREATE TABLE IF NOT EXISTS schema_version (
          version integer PRIMARY KEY,
          description text,
          applied_at timestamptz DEFAULT now()
        );`,
}

describe('runPGliteMigrations: chạy mọi bước chưa có trong schema_version', () => {
  let pglite: PGlite

  beforeEach(() => {
    pglite = new PGlite()
  })

  afterEach(async () => {
    await pglite.close()
  })

  async function applied(): Promise<number[]> {
    const { rows } = await pglite.query<{ version: number }>(
      'SELECT version FROM schema_version ORDER BY version',
    )
    return rows.map((r) => r.version)
  }

  it('máy đã chạy v4 (nhánh này lên trước) vẫn chạy v3 khi v3 tới sau', async () => {
    await runPGliteMigrations(pglite, [V1, migration(2, 't2'), migration(4, 't4')])
    expect(await applied()).toEqual([1, 2, 4])

    await runPGliteMigrations(pglite, [
      V1,
      migration(2, 't2'),
      migration(3, 't3'),
      migration(4, 't4'),
    ])

    expect(await applied()).toEqual([1, 2, 3, 4])
    await expect(pglite.query('SELECT * FROM t3')).resolves.toBeDefined()
  })

  it('chạy lại khi không còn bước nào thì không làm gì', async () => {
    const all = [V1, migration(2, 't2')]
    await runPGliteMigrations(pglite, all)
    await expect(runPGliteMigrations(pglite, all)).resolves.toEqual({
      success: true,
      needsResync: false,
    })
    expect(await applied()).toEqual([1, 2])
  })
})

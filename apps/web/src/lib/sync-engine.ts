import type { PGlite } from '@electric-sql/pglite'

import { apiFetch } from './api-client'

interface SyncData {
  products: unknown[]
  variants: unknown[]
  categories: unknown[]
  customers: unknown[]
  customerGroups: unknown[]
  priceLists: unknown[]
  priceListItems: unknown[]
  printSettings: unknown[]
  units: unknown[]
}

const TABLE_MAP: Record<string, string> = {
  products: 'products',
  variants: 'product_variants',
  categories: 'categories',
  customers: 'customers',
  customerGroups: 'customer_groups',
  priceLists: 'price_lists',
  priceListItems: 'price_list_items',
  printSettings: 'print_settings',
  units: 'product_unit_conversions',
}

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (m, offset) => (offset > 0 ? '_' : '') + m.toLowerCase())
}

interface SyncResponse {
  data: SyncData
  meta: { syncedAt: string }
}

interface SchemaVersionResponse {
  data: { version: number }
}

export async function runInitialSync(
  pglite: PGlite,
  apiBaseOrOnProgress?: string | ((percent: number) => void),
  _token?: string,
  onProgressCb?: (percent: number) => void,
): Promise<string> {
  const onProgress = typeof apiBaseOrOnProgress === 'function' ? apiBaseOrOnProgress : onProgressCb
  onProgress?.(10)
  const json = await apiFetch<SyncResponse>('/api/v1/sync/initial')
  onProgress?.(60)

  const { data } = json
  for (const [key, rows] of Object.entries(data)) {
    const tableName = TABLE_MAP[key]
    if (!tableName || !Array.isArray(rows) || rows.length === 0) continue

    const cols = Object.keys(rows[0])
    const snakeCols = cols.map(camelToSnake)
    const placeholders = rows
      .map((_, i) => `(${cols.map((_, j) => `$${i * cols.length + j + 1}`).join(',')})`)
      .join(',')
    const values = rows.flatMap((row: Record<string, unknown>) =>
      cols.map((col) => {
        const v = row[col]
        return v instanceof Date
          ? v.toISOString()
          : typeof v === 'object' && v !== null
            ? JSON.stringify(v)
            : v
      }),
    )
    await pglite.query(
      `INSERT INTO ${tableName} (${snakeCols.join(',')}) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
      values as unknown[],
    )
  }

  onProgress?.(90)
  const syncedAt = json.meta.syncedAt
  await pglite.query(
    `INSERT INTO schema_version (version, description) VALUES (-1, $1) ON CONFLICT (version) DO UPDATE SET description = $1`,
    [syncedAt],
  )
  onProgress?.(100)
  return syncedAt
}

export async function runIncrementalSync(
  pglite: PGlite,
  apiBaseOrLastSyncedAt: string,
  _tokenOrLastSyncedAt?: string,
  explicitLastSyncedAt?: string,
): Promise<string> {
  const lastSyncedAt = explicitLastSyncedAt ?? _tokenOrLastSyncedAt ?? apiBaseOrLastSyncedAt
  const json = await apiFetch<SyncResponse>(
    `/api/v1/sync/incremental?since=${encodeURIComponent(lastSyncedAt)}`,
  )
  const { data } = json

  for (const [key, rows] of Object.entries(data)) {
    const tableName = TABLE_MAP[key]
    if (!tableName || !Array.isArray(rows) || rows.length === 0) continue

    for (const row of rows as Record<string, unknown>[]) {
      const cols = Object.keys(row)
      const snakeCols = cols.map(camelToSnake)
      const values = cols.map((col) => {
        const v = row[col]
        return v instanceof Date
          ? v.toISOString()
          : typeof v === 'object' && v !== null
            ? JSON.stringify(v)
            : v
      })
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(',')
      const updates = snakeCols
        .filter((c) => c !== 'id')
        .map((c) => {
          const idx = snakeCols.indexOf(c)
          return `${c} = $${idx + 1}`
        })
        .join(',')

      await pglite.query(
        `INSERT INTO ${tableName} (${snakeCols.join(',')}) VALUES (${placeholders}) ON CONFLICT (id) DO UPDATE SET ${updates}`,
        values as unknown[],
      )
    }
  }

  return json.meta.syncedAt
}

export async function checkSchemaVersion(): Promise<{ version: number }> {
  const json = await apiFetch<SchemaVersionResponse>('/api/v1/sync/schema-version')
  return json.data
}

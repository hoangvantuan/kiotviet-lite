import type { SyncCursor, SyncPullEntity, SyncPullResponse } from '../schema/sync-management.js'

/**
 * Giao diện SQL tối thiểu mà PGlite thỏa mãn (`query`, `transaction`). Mã danh mục ngoại tuyến chỉ
 * phụ thuộc vào giao diện này, nên chạy được cả trong trình duyệt lẫn trong test của API.
 */
export interface OfflineSqlExecutor {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
}
export interface OfflineDb extends OfflineSqlExecutor {
  transaction<T>(fn: (tx: OfflineSqlExecutor) => Promise<T>): Promise<T>
}

export type CatalogEntity = Exclude<SyncPullEntity, 'tombstones'>

interface TableSpec {
  table: string
  /**
   * [khóa JSON từ /sync/pull, cột cục bộ, kiểu SQL, giá trị khi thiếu]. Giá trị khi thiếu cho cột
   * mới NOT NULL mà máy chủ bản cũ chưa gửi.
   */
  columns: Array<[string, string, string] | [string, string, string, string]>
  /** Khóa duy nhất trên máy chủ ngoài id (khóa JSON); `lower:` so không phân biệt hoa thường */
  naturalKey?: string[]
}

export const CATALOG_TABLES: Record<CatalogEntity, TableSpec> = {
  products: {
    table: 'catalog_products',
    columns: [
      ['id', 'id', 'uuid'],
      ['name', 'name', 'text'],
      ['sku', 'sku', 'text'],
      ['barcode', 'barcode', 'text'],
      ['categoryId', 'category_id', 'uuid'],
      ['sellingPrice', 'selling_price', 'bigint'],
      ['costPrice', 'cost_price', 'bigint'],
      ['unit', 'unit', 'text'],
      ['imageUrl', 'image_url', 'text'],
      ['hasVariants', 'has_variants', 'boolean'],
      ['trackInventory', 'track_inventory', 'boolean'],
      ['currentStock', 'current_stock', 'numeric'],
      ['allowDecimalQuantity', 'allow_decimal_quantity', 'boolean', 'false'],
      ['status', 'status', 'text'],
    ],
  },
  variants: {
    table: 'catalog_variants',
    columns: [
      ['id', 'id', 'uuid'],
      ['productId', 'product_id', 'uuid'],
      ['sku', 'sku', 'text'],
      ['barcode', 'barcode', 'text'],
      ['attribute1Name', 'attribute1_name', 'text'],
      ['attribute1Value', 'attribute1_value', 'text'],
      ['attribute2Name', 'attribute2_name', 'text'],
      ['attribute2Value', 'attribute2_value', 'text'],
      ['sellingPrice', 'selling_price', 'bigint'],
      ['costPrice', 'cost_price', 'bigint'],
      ['stockQuantity', 'stock_quantity', 'numeric'],
      ['status', 'status', 'text'],
      ['createdAt', 'created_at', 'timestamptz'],
    ],
  },
  unit_conversions: {
    table: 'catalog_unit_conversions',
    naturalKey: ['productId', 'lower:unit'],
    columns: [
      ['id', 'id', 'uuid'],
      ['productId', 'product_id', 'uuid'],
      ['unit', 'unit', 'text'],
      ['conversionFactor', 'conversion_factor', 'integer'],
      ['sellingPrice', 'selling_price', 'bigint'],
      ['allowDecimalQuantity', 'allow_decimal_quantity', 'boolean', 'false'],
      ['sortOrder', 'sort_order', 'integer'],
      ['createdAt', 'created_at', 'timestamptz'],
    ],
  },
  customers: {
    table: 'catalog_customers',
    columns: [
      ['id', 'id', 'uuid'],
      ['name', 'name', 'text'],
      ['code', 'code', 'text'],
      ['phone', 'phone', 'text'],
      ['groupId', 'group_id', 'uuid'],
      ['debtLimit', 'debt_limit', 'bigint'],
      ['debtUnlimited', 'debt_unlimited', 'boolean'],
      ['currentDebt', 'current_debt', 'bigint'],
    ],
  },
  customer_groups: {
    table: 'catalog_customer_groups',
    columns: [
      ['id', 'id', 'uuid'],
      ['name', 'name', 'text'],
      ['defaultPriceListId', 'default_price_list_id', 'uuid'],
      ['debtLimit', 'debt_limit', 'bigint'],
    ],
  },
  price_lists: {
    table: 'catalog_price_lists',
    columns: [
      ['id', 'id', 'uuid'],
      ['name', 'name', 'text'],
      ['isActive', 'is_active', 'boolean'],
      ['effectiveFrom', 'effective_from', 'text'],
      ['effectiveTo', 'effective_to', 'text'],
    ],
  },
  price_list_items: {
    table: 'catalog_price_list_items',
    naturalKey: ['priceListId', 'productId', 'variantId'],
    columns: [
      ['id', 'id', 'uuid'],
      ['priceListId', 'price_list_id', 'uuid'],
      ['productId', 'product_id', 'uuid'],
      ['variantId', 'variant_id', 'uuid'],
      ['price', 'price', 'bigint'],
    ],
  },
  customer_prices: {
    table: 'catalog_customer_prices',
    naturalKey: ['customerId', 'productId', 'variantId'],
    columns: [
      ['id', 'id', 'uuid'],
      ['customerId', 'customer_id', 'uuid'],
      ['productId', 'product_id', 'uuid'],
      ['variantId', 'variant_id', 'uuid'],
      ['price', 'price', 'bigint'],
    ],
  },
  volume_prices: {
    table: 'catalog_volume_prices',
    naturalKey: ['productId', 'variantId', 'minQty'],
    columns: [
      ['id', 'id', 'uuid'],
      ['productId', 'product_id', 'uuid'],
      ['variantId', 'variant_id', 'uuid'],
      ['minQty', 'min_qty', 'numeric'],
      ['price', 'price', 'bigint'],
    ],
  },
  category_discounts: {
    table: 'catalog_category_discounts',
    columns: [
      ['id', 'id', 'uuid'],
      ['categoryId', 'category_id', 'uuid'],
      ['customerId', 'customer_id', 'uuid'],
      ['customerGroupId', 'customer_group_id', 'uuid'],
      ['discountType', 'discount_type', 'text'],
      ['discountValue', 'discount_value', 'bigint'],
      ['minQty', 'min_qty', 'numeric'],
      ['effectiveFrom', 'effective_from', 'text'],
      ['effectiveTo', 'effective_to', 'text'],
      ['isActive', 'is_active', 'boolean'],
    ],
  },
}

/** Bảng nguồn trên máy chủ (tên trong sync_tombstones) ứng với loại dữ liệu cục bộ */
const TOMBSTONE_ENTITY: Record<string, CatalogEntity> = {
  products: 'products',
  product_variants: 'variants',
  product_unit_conversions: 'unit_conversions',
  customers: 'customers',
  customer_groups: 'customer_groups',
  price_lists: 'price_lists',
  price_list_items: 'price_list_items',
  customer_prices: 'customer_prices',
  volume_prices: 'volume_prices',
  category_discounts: 'category_discounts',
}

/** Mọi bảng danh mục cục bộ, đều có store_id: dùng khi dọn dữ liệu cửa hàng lúc đăng xuất */
export const CATALOG_STORE_TABLES = [
  ...Object.values(CATALOG_TABLES).map((spec) => spec.table),
  'catalog_sync_state',
  'catalog_sync_meta',
]

const upsertSqlCache = new Map<CatalogEntity, string>()

/**
 * Xóa dòng cục bộ trùng khóa duy nhất với dòng sắp nạp nhưng khác id: dòng bị xóa rồi tạo lại trên
 * máy chủ (id mới) có thể về trước dấu xóa của dòng cũ, khi đó bản sao có hai giá cho một cặp.
 */
const dedupeSqlCache = new Map<CatalogEntity, string | null>()
function dedupeSql(entity: CatalogEntity): string | null {
  if (dedupeSqlCache.has(entity)) return dedupeSqlCache.get(entity)!
  const spec = CATALOG_TABLES[entity]
  let sql: string | null = null
  if (spec.naturalKey) {
    const typeOf = new Map(spec.columns.map(([key, col, type]) => [key, { col, type }]))
    const keys = spec.naturalKey.map((k) => ({
      lower: k.startsWith('lower:'),
      key: k.replace(/^lower:/, ''),
    }))
    const recordType = ['"id" uuid', ...keys.map(({ key }) => `"${key}" ${typeOf.get(key)!.type}`)]
    const match = keys.map(({ key, lower }) => {
      const col = `t.${typeOf.get(key)!.col}`
      // Khóa có cột null được (variant_id, POS-08): máy chủ coi hai null là trùng (NULLS NOT DISTINCT)
      return lower ? `LOWER(${col}) = LOWER(r."${key}")` : `${col} IS NOT DISTINCT FROM r."${key}"`
    })
    sql =
      `DELETE FROM ${spec.table} AS t USING jsonb_to_recordset($2::jsonb) AS r(${recordType.join(', ')}) ` +
      `WHERE t.store_id = $1 AND ${match.join(' AND ')} AND t.id <> r."id"`
  }
  dedupeSqlCache.set(entity, sql)
  return sql
}

/** Một câu INSERT ... SELECT FROM jsonb_to_recordset cho cả trang: nhanh hơn chèn từng dòng nhiều lần */
function upsertSql(entity: CatalogEntity): string {
  const cached = upsertSqlCache.get(entity)
  if (cached) return cached
  const spec = CATALOG_TABLES[entity]
  const recordType = spec.columns.map(([key, , type]) => `"${key}" ${type}`).join(', ')
  const targetCols = spec.columns.map(([, col]) => col).join(', ')
  const selectCols = spec.columns
    .map(([key, , , fallback]) =>
      fallback === undefined ? `r."${key}"` : `COALESCE(r."${key}", ${fallback})`,
    )
    .join(', ')
  const updates = spec.columns
    .filter(([, col]) => col !== 'id')
    .map(([, col]) => `${col} = EXCLUDED.${col}`)
    .join(', ')
  const sql =
    `INSERT INTO ${spec.table} (store_id, ${targetCols}) ` +
    `SELECT $1::uuid, ${selectCols} FROM jsonb_to_recordset($2::jsonb) AS r(${recordType}) ` +
    `ON CONFLICT (store_id, id) DO UPDATE SET ${updates}`
  upsertSqlCache.set(entity, sql)
  return sql
}

async function deleteRows(
  tx: OfflineSqlExecutor,
  storeId: string,
  entity: CatalogEntity,
  ids: string[],
  cascade: boolean,
): Promise<void> {
  if (ids.length === 0) return
  const { table } = CATALOG_TABLES[entity]
  await tx.query(`DELETE FROM ${table} WHERE store_id = $1 AND id = ANY($2::uuid[])`, [
    storeId,
    ids,
  ])
  if (!cascade) return
  // Xóa cứng trên máy chủ kéo theo dòng con (khóa ngoại cascade); dòng con đó không có dấu xóa
  // riêng khi cha mất trước, nên xóa theo ở đây. Xóa mềm thì không: khôi phục cha sẽ cần lại con.
  const children: Array<[string, string]> =
    entity === 'products'
      ? [
          ['catalog_variants', 'product_id'],
          ['catalog_unit_conversions', 'product_id'],
          ['catalog_price_list_items', 'product_id'],
          ['catalog_customer_prices', 'product_id'],
          ['catalog_volume_prices', 'product_id'],
        ]
      : entity === 'variants'
        ? [
            ['catalog_price_list_items', 'variant_id'],
            ['catalog_customer_prices', 'variant_id'],
            ['catalog_volume_prices', 'variant_id'],
          ]
        : entity === 'price_lists'
          ? [['catalog_price_list_items', 'price_list_id']]
          : entity === 'customers'
            ? [['catalog_customer_prices', 'customer_id']]
            : []
  for (const [childTable, fk] of children) {
    await tx.query(`DELETE FROM ${childTable} WHERE store_id = $1 AND ${fk} = ANY($2::uuid[])`, [
      storeId,
      ids,
    ])
  }
}

/**
 * Nạp một trang /sync/pull và lưu con trỏ trong CÙNG transaction: dừng giữa chừng vẫn đọc tiếp đúng
 * chỗ. Khi tải lại trên bản sao đang dùng (`saveCursor: false`), con trỏ chỉ lưu lúc xong cả lượt.
 */
export async function applyPullPage(
  db: OfflineDb,
  storeId: string,
  page: SyncPullResponse,
  { saveCursor: persistCursor = true }: { saveCursor?: boolean } = {},
): Promise<void> {
  const { entity, rows, deleted } = page.data
  await db.transaction(async (tx) => {
    if (entity === 'tombstones') {
      const byEntity = new Map<CatalogEntity, string[]>()
      for (const row of rows as Array<{ entity: string; entityId: string }>) {
        const target = TOMBSTONE_ENTITY[row.entity]
        if (!target) continue
        const list = byEntity.get(target) ?? []
        list.push(row.entityId)
        byEntity.set(target, list)
      }
      for (const [target, ids] of byEntity) await deleteRows(tx, storeId, target, ids, true)
    } else {
      if (rows.length > 0) {
        const json = JSON.stringify(rows)
        const dedupe = dedupeSql(entity)
        if (dedupe) await tx.query(dedupe, [storeId, json])
        await tx.query(upsertSql(entity), [storeId, json])
      }
      await deleteRows(tx, storeId, entity, deleted, false)
    }
    if (persistCursor) {
      const pulledAt = page.meta.hasMore ? null : page.meta.serverTime
      if (page.meta.nextCursor || pulledAt) {
        await saveCursor(tx, storeId, entity, page.meta.nextCursor, pulledAt)
      }
    }
  })
}

/**
 * Kết thúc một lượt tải lại trên bản sao đang dùng, trong một transaction: xóa dòng máy chủ không
 * còn trả về (bị xóa khi dấu xóa đã hết hạn), thay con trỏ, ghi thời điểm đồng bộ. Tới lúc này POS
 * vẫn bán bằng bản sao cũ; bị ngắt trước đó thì con trỏ cũ còn nguyên và lượt sau tải lại từ đầu.
 */
export async function finishCatalogReload(
  db: OfflineDb,
  storeId: string,
  {
    seen,
    cursors,
    pulledAt,
    meta,
  }: {
    seen: Map<CatalogEntity, string[]>
    cursors: Map<SyncPullEntity, SyncCursor>
    pulledAt: Map<SyncPullEntity, string>
    meta: CatalogSyncMeta
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const [entity, spec] of Object.entries(CATALOG_TABLES) as Array<
      [CatalogEntity, TableSpec]
    >) {
      await tx.query(
        `DELETE FROM ${spec.table} WHERE store_id = $1 AND NOT (id = ANY($2::uuid[]))`,
        [storeId, seen.get(entity) ?? []],
      )
    }
    await tx.query('DELETE FROM catalog_sync_state WHERE store_id = $1', [storeId])
    const entities = new Set<SyncPullEntity>([...cursors.keys(), ...pulledAt.keys()])
    for (const entity of entities) {
      await saveCursor(
        tx,
        storeId,
        entity,
        cursors.get(entity) ?? null,
        pulledAt.get(entity) ?? null,
      )
    }
    await setCatalogSyncMeta(tx, storeId, meta)
  })
}

/**
 * BC-13, quyết định 3: bản sao tải bởi người xem được giá vốn mà người dùng hiện tại không có quyền
 * thì xóa giá vốn ngay trên máy, không đợi tới được máy chủ. Trả về true nếu đã xóa.
 */
export async function purgeCatalogCostIfForbidden(
  db: OfflineDb,
  storeId: string,
  canViewCost: boolean,
): Promise<boolean> {
  if (canViewCost) return false
  const meta = await getCatalogSyncMeta(db, storeId)
  if (!meta?.withCost) return false
  await db.transaction(async (tx) => {
    await tx.query('UPDATE catalog_products SET cost_price = NULL WHERE store_id = $1', [storeId])
    await tx.query('UPDATE catalog_variants SET cost_price = NULL WHERE store_id = $1', [storeId])
    await setCatalogSyncMeta(tx, storeId, { ...meta, withCost: false })
  })
  return true
}

/** Lưu con trỏ và/hoặc mốc đọc hết của một loại dữ liệu; giá trị null giữ nguyên giá trị cũ */
async function saveCursor(
  tx: OfflineSqlExecutor,
  storeId: string,
  entity: SyncPullEntity,
  cursor: SyncCursor | null,
  pulledAt: string | null,
): Promise<void> {
  await tx.query(
    `INSERT INTO catalog_sync_state (store_id, entity, cursor_t, cursor_id, pulled_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (store_id, entity) DO UPDATE SET
       cursor_t = COALESCE(EXCLUDED.cursor_t, catalog_sync_state.cursor_t),
       cursor_id = COALESCE(EXCLUDED.cursor_id, catalog_sync_state.cursor_id),
       pulled_at = COALESCE(EXCLUDED.pulled_at, catalog_sync_state.pulled_at)`,
    [storeId, entity, cursor?.t ?? null, cursor?.id ?? null, pulledAt],
  )
}

/** Thời điểm máy chủ của lần gần nhất đọc hết một loại dữ liệu, null khi chưa có */
export async function getCatalogPulledAt(
  db: OfflineSqlExecutor,
  storeId: string,
  entity: SyncPullEntity,
): Promise<string | null> {
  const { rows } = await db.query<{ pulled_at: string | Date | null }>(
    'SELECT pulled_at FROM catalog_sync_state WHERE store_id = $1 AND entity = $2',
    [storeId, entity],
  )
  const value = rows[0]?.pulled_at
  if (value == null) return null
  return (value instanceof Date ? value : new Date(value)).toISOString()
}

export async function getCursor(
  db: OfflineSqlExecutor,
  storeId: string,
  entity: SyncPullEntity,
): Promise<SyncCursor | null> {
  const { rows } = await db.query<{ cursor_t: string | null; cursor_id: string | null }>(
    'SELECT cursor_t, cursor_id FROM catalog_sync_state WHERE store_id = $1 AND entity = $2',
    [storeId, entity],
  )
  const row = rows[0]
  return row?.cursor_t && row.cursor_id ? { t: row.cursor_t, id: row.cursor_id } : null
}

export interface CatalogSyncMeta {
  withCost: boolean
  /** Thời điểm máy chủ của lượt đồng bộ trọn vẹn gần nhất, null khi chưa xong lượt đầu */
  syncedAt: string | null
}

export async function getCatalogSyncMeta(
  db: OfflineSqlExecutor,
  storeId: string,
): Promise<CatalogSyncMeta | null> {
  const { rows } = await db.query<{ with_cost: boolean; synced_at: string | Date | null }>(
    'SELECT with_cost, synced_at FROM catalog_sync_meta WHERE store_id = $1',
    [storeId],
  )
  const row = rows[0]
  if (!row) return null
  const syncedAt =
    row.synced_at === null
      ? null
      : row.synced_at instanceof Date
        ? row.synced_at.toISOString()
        : new Date(row.synced_at).toISOString()
  return { withCost: row.with_cost, syncedAt }
}

export async function setCatalogSyncMeta(
  db: OfflineSqlExecutor,
  storeId: string,
  meta: CatalogSyncMeta,
): Promise<void> {
  await db.query(
    `INSERT INTO catalog_sync_meta (store_id, with_cost, synced_at) VALUES ($1, $2, $3)
     ON CONFLICT (store_id) DO UPDATE SET with_cost = EXCLUDED.with_cost, synced_at = EXCLUDED.synced_at`,
    [storeId, meta.withCost, meta.syncedAt],
  )
}

/** Xóa toàn bộ bản sao danh mục của một cửa hàng (đăng xuất, đổi quyền xem giá vốn, đồng bộ lại) */
export async function clearCatalogStoreData(db: OfflineDb, storeId: string): Promise<void> {
  await db.transaction(async (tx) => {
    for (const table of CATALOG_STORE_TABLES) {
      await tx.query(`DELETE FROM ${table} WHERE store_id = $1`, [storeId])
    }
  })
}

/** Xóa bản sao danh mục của mọi cửa hàng khác `storeId` (máy vừa đổi sang cửa hàng khác) */
export async function clearOtherStoresCatalog(db: OfflineDb, storeId: string): Promise<void> {
  await db.transaction(async (tx) => {
    for (const table of CATALOG_STORE_TABLES) {
      await tx.query(`DELETE FROM ${table} WHERE store_id <> $1`, [storeId])
    }
  })
}

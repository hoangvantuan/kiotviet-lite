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

type CatalogEntity = Exclude<SyncPullEntity, 'tombstones'>

interface TableSpec {
  table: string
  /** [khóa JSON từ /sync/pull, cột cục bộ, kiểu SQL] */
  columns: Array<[string, string, string]>
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
      ['currentStock', 'current_stock', 'integer'],
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
      ['stockQuantity', 'stock_quantity', 'integer'],
      ['status', 'status', 'text'],
      ['createdAt', 'created_at', 'timestamptz'],
    ],
  },
  unit_conversions: {
    table: 'catalog_unit_conversions',
    columns: [
      ['id', 'id', 'uuid'],
      ['productId', 'product_id', 'uuid'],
      ['unit', 'unit', 'text'],
      ['conversionFactor', 'conversion_factor', 'integer'],
      ['sellingPrice', 'selling_price', 'bigint'],
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
    columns: [
      ['id', 'id', 'uuid'],
      ['priceListId', 'price_list_id', 'uuid'],
      ['productId', 'product_id', 'uuid'],
      ['price', 'price', 'bigint'],
    ],
  },
  customer_prices: {
    table: 'catalog_customer_prices',
    columns: [
      ['id', 'id', 'uuid'],
      ['customerId', 'customer_id', 'uuid'],
      ['productId', 'product_id', 'uuid'],
      ['price', 'price', 'bigint'],
    ],
  },
  volume_prices: {
    table: 'catalog_volume_prices',
    columns: [
      ['id', 'id', 'uuid'],
      ['productId', 'product_id', 'uuid'],
      ['minQty', 'min_qty', 'integer'],
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
      ['minQty', 'min_qty', 'integer'],
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

/** Một câu INSERT ... SELECT FROM jsonb_to_recordset cho cả trang: nhanh hơn chèn từng dòng nhiều lần */
function upsertSql(entity: CatalogEntity): string {
  const cached = upsertSqlCache.get(entity)
  if (cached) return cached
  const spec = CATALOG_TABLES[entity]
  const recordType = spec.columns.map(([key, , type]) => `"${key}" ${type}`).join(', ')
  const targetCols = spec.columns.map(([, col]) => col).join(', ')
  const selectCols = spec.columns.map(([key]) => `r."${key}"`).join(', ')
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

/** Nạp một trang /sync/pull và lưu con trỏ trong CÙNG transaction: dừng giữa chừng vẫn đọc tiếp đúng chỗ */
export async function applyPullPage(
  db: OfflineDb,
  storeId: string,
  page: SyncPullResponse,
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
      if (rows.length > 0) await tx.query(upsertSql(entity), [storeId, JSON.stringify(rows)])
      await deleteRows(tx, storeId, entity, deleted, false)
    }
    if (page.meta.nextCursor) await saveCursor(tx, storeId, entity, page.meta.nextCursor)
  })
}

async function saveCursor(
  tx: OfflineSqlExecutor,
  storeId: string,
  entity: SyncPullEntity,
  cursor: SyncCursor,
): Promise<void> {
  await tx.query(
    `INSERT INTO catalog_sync_state (store_id, entity, cursor_t, cursor_id) VALUES ($1, $2, $3, $4)
     ON CONFLICT (store_id, entity) DO UPDATE SET cursor_t = EXCLUDED.cursor_t, cursor_id = EXCLUDED.cursor_id`,
    [storeId, entity, cursor.t, cursor.id],
  )
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

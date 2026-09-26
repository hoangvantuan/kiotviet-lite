import { and, asc, eq, lt, type SQL, sql } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'

import {
  categoryDiscounts,
  customerGroups,
  customerPrices,
  customers,
  priceListItems,
  priceLists,
  products,
  productUnitConversions,
  productVariants,
  type SyncCursor,
  type SyncPullEntity,
  type SyncPullQuery,
  type SyncPullResponse,
  syncTombstones,
  volumePrices,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'

/**
 * GL-03: đồng bộ danh mục về máy bán hàng theo từng loại dữ liệu, phân trang keyset theo
 * (updated_at, id). Con trỏ giữ `updated_at` dạng text đủ micro giây, không qua Date của JS:
 * cắt về mili giây thì cả trang cùng mốc thời gian sẽ bị đọc lại mãi.
 *
 * Mỗi loại dữ liệu có danh sách cột trả về cố định; giá vốn chỉ có khi người đồng bộ có quyền
 * products.viewCost (BC-13, quyết định 3). Dòng đã xóa mềm vẫn được quét để máy khách biết mà
 * xóa (trả trong `deleted`); dòng ngừng bán được gửi kèm status. Dòng bị xóa cứng đi qua loại `tombstones`.
 */

/** Dấu xóa được giữ chừng này; con trỏ cũ hơn thì máy khách phải đồng bộ lại từ đầu. */
export const SYNC_TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
/** Mỗi lượt gia tăng đọc lùi lại để không sót dòng của transaction commit muộn hơn mốc của nó. */
const INCREMENTAL_LOOKBACK = '5 minutes'
const INCREMENTAL_LOOKBACK_MS = 5 * 60 * 1000
const ZERO_UUID = '00000000-0000-0000-0000-000000000000'

type ColumnMap = Record<string, PgColumn | SQL>

interface EntitySpec {
  table: PgTable
  id: PgColumn
  updatedAt: PgColumn
  columns: ColumnMap
  /** Cột chỉ trả khi có quyền xem giá vốn */
  costColumns?: ColumnMap
  storeFilter: (storeId: string) => SQL
  /** Biểu thức true khi dòng không còn dùng được trên máy bán hàng */
  gone?: SQL
  join?: (q: JoinableQuery) => JoinableQuery
}

// Kiểu tối thiểu để gắn join cho price_list_items mà không kéo theo kiểu builder của drizzle
type JoinableQuery = { innerJoin: (table: PgTable, on: SQL) => JoinableQuery }

const ENTITY_SPECS: Record<Exclude<SyncPullEntity, 'tombstones'>, EntitySpec> = {
  products: {
    table: products,
    id: products.id,
    updatedAt: products.updatedAt,
    columns: {
      id: products.id,
      name: products.name,
      sku: products.sku,
      barcode: products.barcode,
      categoryId: products.categoryId,
      sellingPrice: products.sellingPrice,
      unit: products.unit,
      imageUrl: products.imageUrl,
      hasVariants: products.hasVariants,
      trackInventory: products.trackInventory,
      currentStock: products.currentStock,
      // Hàng ngừng bán vẫn gửi (có status) để giá của dòng đã có trong giỏ tính như máy chủ;
      // tìm hàng ngoại tuyến tự lọc status
      status: products.status,
    },
    costColumns: { costPrice: products.costPrice },
    storeFilter: (storeId) => eq(products.storeId, storeId),
    gone: sql`${products.deletedAt} IS NOT NULL`,
  },
  variants: {
    table: productVariants,
    id: productVariants.id,
    updatedAt: productVariants.updatedAt,
    // Biến thể ngừng bán vẫn được gửi (có status): tồn kho của hàng có biến thể cộng cả chúng,
    // giống tìm hàng POS phía máy chủ
    columns: {
      id: productVariants.id,
      productId: productVariants.productId,
      sku: productVariants.sku,
      barcode: productVariants.barcode,
      attribute1Name: productVariants.attribute1Name,
      attribute1Value: productVariants.attribute1Value,
      attribute2Name: productVariants.attribute2Name,
      attribute2Value: productVariants.attribute2Value,
      sellingPrice: productVariants.sellingPrice,
      stockQuantity: productVariants.stockQuantity,
      status: productVariants.status,
      createdAt: productVariants.createdAt,
    },
    costColumns: { costPrice: productVariants.costPrice },
    storeFilter: (storeId) => eq(productVariants.storeId, storeId),
    gone: sql`${productVariants.deletedAt} IS NOT NULL`,
  },
  unit_conversions: {
    table: productUnitConversions,
    id: productUnitConversions.id,
    updatedAt: productUnitConversions.updatedAt,
    columns: {
      id: productUnitConversions.id,
      productId: productUnitConversions.productId,
      unit: productUnitConversions.unit,
      conversionFactor: productUnitConversions.conversionFactor,
      sellingPrice: productUnitConversions.sellingPrice,
      sortOrder: productUnitConversions.sortOrder,
      createdAt: productUnitConversions.createdAt,
    },
    storeFilter: (storeId) => eq(productUnitConversions.storeId, storeId),
  },
  customers: {
    table: customers,
    id: customers.id,
    updatedAt: customers.updatedAt,
    columns: {
      id: customers.id,
      name: customers.name,
      code: customers.code,
      phone: customers.phone,
      groupId: customers.groupId,
      debtLimit: customers.debtLimit,
      debtUnlimited: customers.debtUnlimited,
      currentDebt: customers.currentDebt,
    },
    storeFilter: (storeId) => eq(customers.storeId, storeId),
    gone: sql`${customers.deletedAt} IS NOT NULL`,
  },
  customer_groups: {
    table: customerGroups,
    id: customerGroups.id,
    updatedAt: customerGroups.updatedAt,
    columns: {
      id: customerGroups.id,
      name: customerGroups.name,
      defaultPriceListId: customerGroups.defaultPriceListId,
      debtLimit: customerGroups.debtLimit,
    },
    storeFilter: (storeId) => eq(customerGroups.storeId, storeId),
    gone: sql`${customerGroups.deletedAt} IS NOT NULL`,
  },
  price_lists: {
    table: priceLists,
    id: priceLists.id,
    updatedAt: priceLists.updatedAt,
    columns: {
      id: priceLists.id,
      name: priceLists.name,
      isActive: priceLists.isActive,
      effectiveFrom: priceLists.effectiveFrom,
      effectiveTo: priceLists.effectiveTo,
    },
    storeFilter: (storeId) => eq(priceLists.storeId, storeId),
    gone: sql`${priceLists.deletedAt} IS NOT NULL`,
  },
  price_list_items: {
    table: priceListItems,
    id: priceListItems.id,
    updatedAt: priceListItems.updatedAt,
    columns: {
      id: priceListItems.id,
      priceListId: priceListItems.priceListId,
      productId: priceListItems.productId,
      variantId: priceListItems.variantId,
      price: priceListItems.price,
    },
    // Bảng này không có store_id: lọc theo cửa hàng của bảng giá cha
    storeFilter: (storeId) => eq(priceLists.storeId, storeId),
    join: (q) => q.innerJoin(priceLists, eq(priceLists.id, priceListItems.priceListId)),
  },
  customer_prices: {
    table: customerPrices,
    id: customerPrices.id,
    updatedAt: customerPrices.updatedAt,
    columns: {
      id: customerPrices.id,
      customerId: customerPrices.customerId,
      productId: customerPrices.productId,
      variantId: customerPrices.variantId,
      price: customerPrices.price,
    },
    storeFilter: (storeId) => eq(customerPrices.storeId, storeId),
  },
  volume_prices: {
    table: volumePrices,
    id: volumePrices.id,
    updatedAt: volumePrices.updatedAt,
    columns: {
      id: volumePrices.id,
      productId: volumePrices.productId,
      variantId: volumePrices.variantId,
      minQty: volumePrices.minQty,
      price: volumePrices.price,
    },
    storeFilter: (storeId) => eq(volumePrices.storeId, storeId),
  },
  category_discounts: {
    table: categoryDiscounts,
    id: categoryDiscounts.id,
    updatedAt: categoryDiscounts.updatedAt,
    columns: {
      id: categoryDiscounts.id,
      categoryId: categoryDiscounts.categoryId,
      customerId: categoryDiscounts.customerId,
      customerGroupId: categoryDiscounts.customerGroupId,
      discountType: categoryDiscounts.discountType,
      discountValue: categoryDiscounts.discountValue,
      minQty: categoryDiscounts.minQty,
      effectiveFrom: categoryDiscounts.effectiveFrom,
      effectiveTo: categoryDiscounts.effectiveTo,
      isActive: categoryDiscounts.isActive,
    },
    storeFilter: (storeId) => eq(categoryDiscounts.storeId, storeId),
  },
}

/**
 * Dòng sau con trỏ. Trang đầu của lượt gia tăng (`since`) đọc thêm mọi dòng đổi từ vài phút trước
 * lúc bắt đầu lượt trước: transaction đang chạy khi đó ghi updated_at sớm hơn lúc commit, có thể
 * nằm sau con trỏ mà lượt trước không thấy. Neo vào `since` chứ không vào con trỏ: sau một lần nhập
 * lô, mọi dòng cùng mốc, neo vào con trỏ sẽ bắt mỗi lượt tải lại cả lô.
 */
function afterCursor(t: PgColumn, id: PgColumn, cursor: SyncCursor, since: string | null): SQL {
  const keyset = sql`(${t}, ${id}) > (${cursor.t}::timestamptz, ${cursor.id}::uuid)`
  if (!since) return keyset
  return sql`(${keyset} OR ${t} > (${since}::timestamptz - ${INCREMENTAL_LOOKBACK}::interval))`
}

/** Mốc thời gian dạng ISO UTC giữ đủ micro giây, đọc lại được bằng `::timestamptz` và Date.parse */
function cursorText(col: PgColumn): SQL<string> {
  return sql<string>`to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
}

async function pullTombstones(
  db: Db,
  storeId: string,
  query: SyncPullQuery,
): Promise<SyncPullResponse> {
  const serverTime = new Date().toISOString()
  // Lần đầu: chỉ lấy mốc hiện tại. Dòng nào bị xóa trước mốc này thì lượt đồng bộ đầu vốn không
  // tải về, nên không cần dấu xóa của nó.
  if (!query.cursor) {
    return {
      data: { entity: 'tombstones', rows: [], deleted: [] },
      meta: { hasMore: false, nextCursor: { t: serverTime, id: ZERO_UUID }, serverTime },
    }
  }

  const cursor = query.cursor
  const expired = Date.parse(cursor.t) < Date.now() - SYNC_TOMBSTONE_RETENTION_MS
  if (expired) {
    return {
      data: { entity: 'tombstones', rows: [], deleted: [] },
      meta: { hasMore: false, nextCursor: null, serverTime, resetRequired: true },
    }
  }

  const rows = await db
    .select({
      id: syncTombstones.id,
      entity: syncTombstones.entity,
      entityId: syncTombstones.entityId,
      t: cursorText(syncTombstones.deletedAt),
    })
    .from(syncTombstones)
    .where(
      and(
        eq(syncTombstones.storeId, storeId),
        afterCursor(syncTombstones.deletedAt, syncTombstones.id, cursor, query.since),
      ),
    )
    .orderBy(asc(syncTombstones.deletedAt), asc(syncTombstones.id))
    .limit(query.limit + 1)

  const hasMore = rows.length > query.limit
  const page = hasMore ? rows.slice(0, query.limit) : rows
  const last = page.at(-1)
  let nextCursor: SyncCursor | null = last ? { t: last.t, id: last.id } : null
  if (!hasMore) {
    // Đọc hết: con trỏ tiến tới gần hiện tại dù không có dấu xóa mới, để cửa hàng ít xóa cứng
    // không bị coi là vắng mặt quá hạn lưu giữ (resetRequired). Lùi một cửa sổ đọc lại để dấu xóa
    // của transaction commit muộn vẫn được thấy; đọc lại dấu xóa cũ vô hại (xóa lại không sao).
    const floor = new Date(Date.parse(serverTime) - INCREMENTAL_LOOKBACK_MS).toISOString()
    const reached = last?.t ?? cursor.t
    if (Date.parse(reached) < Date.parse(floor)) nextCursor = { t: floor, id: ZERO_UUID }
  }
  return {
    data: {
      entity: 'tombstones',
      rows: page.map((r) => ({ entity: r.entity, entityId: r.entityId })),
      deleted: [],
    },
    meta: { hasMore, nextCursor, serverTime },
  }
}

export async function pullSyncPage({
  db,
  storeId,
  canViewCost,
  query,
}: {
  db: Db
  storeId: string
  canViewCost: boolean
  query: SyncPullQuery
}): Promise<SyncPullResponse> {
  if (query.entity === 'tombstones') return pullTombstones(db, storeId, query)

  const spec = ENTITY_SPECS[query.entity]
  const serverTime = new Date().toISOString()
  const selection: ColumnMap = {
    ...spec.columns,
    ...(canViewCost ? spec.costColumns : {}),
    _t: cursorText(spec.updatedAt),
    _gone: spec.gone ?? sql<boolean>`false`,
  }

  const conds: SQL[] = [spec.storeFilter(storeId)]
  if (query.cursor) conds.push(afterCursor(spec.updatedAt, spec.id, query.cursor, query.since))

  let q = db.select(selection).from(spec.table) as unknown as JoinableQuery
  if (spec.join) q = spec.join(q)
  const rows = (await (
    q as unknown as {
      where: (w: SQL) => {
        orderBy: (...o: SQL[]) => { limit: (n: number) => Promise<Record<string, unknown>[]> }
      }
    }
  )
    .where(and(...conds)!)
    .orderBy(asc(spec.updatedAt), asc(spec.id))
    .limit(query.limit + 1)) as Array<Record<string, unknown> & { _t: string; _gone: boolean }>

  const hasMore = rows.length > query.limit
  const page = hasMore ? rows.slice(0, query.limit) : rows

  let total: number | undefined
  if (!query.cursor) {
    let countQ = db
      .select({ n: sql<number>`count(*)::int` })
      .from(spec.table) as unknown as JoinableQuery
    if (spec.join) countQ = spec.join(countQ)
    const [countRow] = await (
      countQ as unknown as { where: (w: SQL) => Promise<Array<{ n: number }>> }
    ).where(spec.storeFilter(storeId))
    total = countRow?.n ?? 0
  }

  const live: Record<string, unknown>[] = []
  const deleted: string[] = []
  for (const row of page) {
    const rest: Record<string, unknown> = { ...row }
    delete rest._t
    delete rest._gone
    if (row._gone) deleted.push(row.id as string)
    else live.push(rest)
  }
  const last = page.at(-1)

  return {
    data: { entity: query.entity, rows: live, deleted },
    meta: {
      hasMore,
      nextCursor: last ? { t: last._t, id: last.id as string } : null,
      serverTime,
      ...(total !== undefined ? { total } : {}),
    },
  }
}

/** Xóa dấu xóa quá hạn lưu giữ. Trả về số dòng đã xóa. */
export async function purgeExpiredSyncTombstones({
  db,
  now = new Date(),
}: {
  db: Db
  now?: Date
}): Promise<number> {
  const cutoff = new Date(now.getTime() - SYNC_TOMBSTONE_RETENTION_MS)
  const deleted = await db
    .delete(syncTombstones)
    .where(lt(syncTombstones.deletedAt, cutoff))
    .returning({ id: syncTombstones.id })
  return deleted.length
}

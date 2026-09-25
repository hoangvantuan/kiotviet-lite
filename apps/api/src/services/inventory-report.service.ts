import { and, eq, gt, isNull, type SQL, sql } from 'drizzle-orm'

import {
  categories,
  type InventoryCurrentResponse,
  type InventoryReorderResponse,
  type InventorySlowResponse,
  orderItems,
  orders,
  products,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { effectiveStockSql, effectiveStockValueSql } from '../lib/effective-stock.js'
import { revenueStatusFilter } from '../lib/order-status.js'
import { daysBetweenDateKeys, localDateKey, localDateSql } from '../lib/timezone.js'

const stockExpr = effectiveStockSql()
const stockValueExpr = effectiveStockValueSql()

export interface InventoryReportOptions {
  page?: number
  pageSize?: number
  /** uuid nhóm hàng (tính cả nhóm con) hoặc 'none' cho hàng chưa phân nhóm */
  categoryId?: string
}

// Nhóm hàng có 2 cấp: chọn nhóm cha thì lấy luôn hàng thuộc các nhóm con, giống bộ lọc danh sách
// sản phẩm. Ràng buộc store_id để nhóm của cửa hàng khác không lọc ra được gì (KHO-12)
function categoryCondition(storeId: string, categoryId: string | undefined): SQL | undefined {
  if (categoryId === undefined) return undefined
  if (categoryId === 'none') return isNull(products.categoryId)
  return sql`${products.categoryId} IN (
    SELECT ${categories.id} FROM ${categories}
    WHERE ${categories.storeId} = ${storeId}
      AND (${categories.id} = ${categoryId} OR ${categories.parentId} = ${categoryId})
  )`
}

export async function getInventoryCurrent(
  db: Db,
  storeId: string,
  { page, pageSize, categoryId }: InventoryReportOptions = {},
): Promise<InventoryCurrentResponse> {
  const isPaged = page !== undefined && pageSize !== undefined
  const offset = isPaged ? (page - 1) * pageSize : 0
  const whereCondition = and(
    eq(products.storeId, storeId),
    eq(products.trackInventory, true),
    isNull(products.deletedAt),
    categoryCondition(storeId, categoryId),
  )

  const query = db
    .select({
      productId: products.id,
      productName: products.name,
      sku: products.sku,
      currentStock: sql<number>`${stockExpr}`.as('current_stock'),
      stockValue: sql<number>`${stockValueExpr}`.as('stock_value'),
      costPrice: sql<number>`coalesce(${products.costPrice}, 0)`.as('cost_price'),
      hasVariants: products.hasVariants,
    })
    .from(products)
    .where(whereCondition)
    .orderBy(sql`stock_value DESC`)

  const [result, summaryResult] = await Promise.all([
    isPaged ? query.limit(pageSize).offset(offset) : query,
    db
      .select({
        totalProducts: sql<number>`count(*)::int`,
        totalQuantity: sql<number>`coalesce(sum(${stockExpr}), 0)::bigint`,
        totalStockValue: sql<number>`coalesce(sum(${stockValueExpr}), 0)::bigint`,
      })
      .from(products)
      .where(whereCondition),
  ])

  const total = Number(summaryResult[0]?.totalProducts ?? 0)
  const totalQuantity = Number(summaryResult[0]?.totalQuantity ?? 0)
  const totalStockValue = Number(summaryResult[0]?.totalStockValue ?? 0)

  const rows = result.map((r) => ({
    productId: r.productId,
    productName: r.productName,
    sku: r.sku,
    currentStock: Number(r.currentStock),
    // Có biến thể: giá vốn hiển thị là bình quân theo giá trị tồn để tồn × giá vốn khớp giá trị tồn
    costPrice:
      r.hasVariants && Number(r.currentStock) > 0
        ? Math.round(Number(r.stockValue) / Number(r.currentStock))
        : Number(r.costPrice),
    stockValue: Number(r.stockValue),
  }))

  return {
    rows,
    summary: { totalProducts: total, totalQuantity, totalStockValue },
    pagination: {
      page: isPaged ? page : 1,
      pageSize: isPaged ? pageSize : total,
      total,
      totalPages: isPaged ? Math.max(1, Math.ceil(total / pageSize)) : 1,
    },
  }
}

export async function getInventoryReorder(
  db: Db,
  storeId: string,
  { page, pageSize, categoryId }: InventoryReportOptions = {},
): Promise<InventoryReorderResponse> {
  const isPaged = page !== undefined && pageSize !== undefined
  const offset = isPaged ? (page - 1) * pageSize : 0
  const whereCondition = and(
    eq(products.storeId, storeId),
    isNull(products.deletedAt),
    gt(products.minStock, 0),
    sql`${stockExpr} <= ${products.minStock}`,
    categoryCondition(storeId, categoryId),
  )

  const query = db
    .select({
      productId: products.id,
      productName: products.name,
      sku: products.sku,
      currentStock: sql<number>`${stockExpr}`.as('current_stock'),
      minStock: products.minStock,
    })
    .from(products)
    .where(whereCondition)
    .orderBy(sql`current_stock - ${products.minStock} ASC`)

  const [result, countResult] = await Promise.all([
    isPaged ? query.limit(pageSize).offset(offset) : query,
    db
      .select({
        total: sql<number>`count(*)::int`,
      })
      .from(products)
      .where(whereCondition),
  ])

  const total = Number(countResult[0]?.total ?? 0)

  const rows = result.map((r) => ({
    productId: r.productId,
    productName: r.productName,
    sku: r.sku,
    currentStock: Number(r.currentStock),
    minStock: r.minStock,
    reorderQuantity: r.minStock - Number(r.currentStock),
  }))

  return {
    rows,
    pagination: {
      page: isPaged ? page : 1,
      pageSize: isPaged ? pageSize : total,
      total,
      totalPages: isPaged ? Math.max(1, Math.ceil(total / pageSize)) : 1,
    },
  }
}

export async function getInventorySlow(
  db: Db,
  storeId: string,
  { page, pageSize, categoryId }: InventoryReportOptions = {},
): Promise<InventorySlowResponse> {
  const isPaged = page !== undefined && pageSize !== undefined
  const offset = isPaged ? (page - 1) * pageSize : 0
  // Mốc 30 ngày và "ngày bán cuối" theo lịch cửa hàng (BC-14), không theo ngày UTC
  const today = localDateKey()
  const thirtyDaysAgo = localDateKey(new Date(Date.parse(`${today}T12:00:00Z`) - 30 * 86_400_000))

  const lastSoldSubquery = db
    .select({
      productId: orderItems.productId,
      lastSoldDate: sql<string>`max(${localDateSql(orderItems.createdAt)})::text`.as(
        'last_sold_date',
      ),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(eq(orders.storeId, storeId), revenueStatusFilter()))
    .groupBy(orderItems.productId)
    .as('last_sold')

  const whereCondition = and(
    eq(products.storeId, storeId),
    isNull(products.deletedAt),
    sql`${stockExpr} > 0`,
    sql`(${lastSoldSubquery.lastSoldDate} IS NULL OR ${lastSoldSubquery.lastSoldDate} < ${thirtyDaysAgo})`,
    categoryCondition(storeId, categoryId),
  )

  const query = db
    .select({
      productId: products.id,
      productName: products.name,
      sku: products.sku,
      currentStock: sql<number>`${stockExpr}`.as('current_stock'),
      lastSoldDate: lastSoldSubquery.lastSoldDate,
    })
    .from(products)
    .leftJoin(lastSoldSubquery, eq(products.id, lastSoldSubquery.productId))
    .where(whereCondition)
    .orderBy(sql`${lastSoldSubquery.lastSoldDate} ASC NULLS FIRST`)

  const [result, countResult] = await Promise.all([
    isPaged ? query.limit(pageSize).offset(offset) : query,
    db
      .select({
        total: sql<number>`count(*)::int`,
      })
      .from(products)
      .leftJoin(lastSoldSubquery, eq(products.id, lastSoldSubquery.productId))
      .where(whereCondition),
  ])

  const total = Number(countResult[0]?.total ?? 0)
  const rows = result.map((r) => {
    const lastSold = r.lastSoldDate ? String(r.lastSoldDate).slice(0, 10) : null
    const daysSince = lastSold ? daysBetweenDateKeys(lastSold, today) : 9999
    return {
      productId: r.productId,
      productName: r.productName,
      sku: r.sku,
      currentStock: Number(r.currentStock),
      lastSoldDate: lastSold,
      daysSinceLastSold: daysSince,
    }
  })

  return {
    rows,
    pagination: {
      page: isPaged ? page : 1,
      pageSize: isPaged ? pageSize : total,
      total,
      totalPages: isPaged ? Math.max(1, Math.ceil(total / pageSize)) : 1,
    },
  }
}

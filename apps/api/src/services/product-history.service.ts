import { and, desc, eq, isNull, sql } from 'drizzle-orm'

import {
  type ProductHistoryQuery,
  type ProductPurchaseHistoryItem,
  products,
  type ProductStockCheckHistoryItem,
  purchaseOrderItems,
  purchaseOrders,
  stockCheckItems,
  stockCheckLogs,
  stockChecks,
  suppliers,
  users,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'

async function ensureProductInStore({
  db,
  storeId,
  productId,
}: {
  db: Db
  storeId: string
  productId: string
}): Promise<void> {
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(
      and(eq(products.id, productId), eq(products.storeId, storeId), isNull(products.deletedAt)),
    )
    .limit(1)
  if (!rows[0]) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy sản phẩm')
  }
}

export interface ProductHistoryDeps {
  db: Db
  storeId: string
  productId: string
  query: ProductHistoryQuery
}

export interface PurchaseHistoryResult {
  items: ProductPurchaseHistoryItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export async function listProductPurchaseHistory({
  db,
  storeId,
  productId,
  query,
}: ProductHistoryDeps): Promise<PurchaseHistoryResult> {
  await ensureProductInStore({ db, storeId, productId })

  const { page, pageSize, variantId } = query
  const offset = (page - 1) * pageSize

  const conditions = [
    eq(purchaseOrderItems.productId, productId),
    eq(purchaseOrders.storeId, storeId),
  ]
  if (variantId) {
    conditions.push(eq(purchaseOrderItems.variantId, variantId))
  }
  const whereClause = and(...conditions)

  const rows = await db
    .select({
      itemId: purchaseOrderItems.id,
      purchaseOrderId: purchaseOrderItems.purchaseOrderId,
      purchaseOrderCode: purchaseOrders.code,
      purchaseDate: purchaseOrders.purchaseDate,
      supplierId: purchaseOrders.supplierId,
      supplierName: suppliers.name,
      variantId: purchaseOrderItems.variantId,
      variantLabelSnapshot: purchaseOrderItems.variantLabelSnapshot,
      quantity: purchaseOrderItems.quantity,
      unitPrice: purchaseOrderItems.unitPrice,
      discountAmount: purchaseOrderItems.discountAmount,
      lineTotal: purchaseOrderItems.lineTotal,
      costAfter: purchaseOrderItems.costAfter,
      stockAfter: purchaseOrderItems.stockAfter,
    })
    .from(purchaseOrderItems)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderItems.purchaseOrderId))
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .where(whereClause)
    .orderBy(desc(purchaseOrders.purchaseDate), desc(purchaseOrderItems.createdAt))
    .limit(pageSize)
    .offset(offset)

  const totalRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(purchaseOrderItems)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderItems.purchaseOrderId))
    .where(whereClause)
  const total = totalRows[0]?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const items: ProductPurchaseHistoryItem[] = rows.map((r) => ({
    purchaseOrderId: r.purchaseOrderId,
    purchaseOrderItemId: r.itemId,
    purchaseOrderCode: r.purchaseOrderCode,
    purchaseDate: r.purchaseDate.toISOString(),
    supplierId: r.supplierId,
    supplierName: r.supplierName,
    variantId: r.variantId,
    variantLabelSnapshot: r.variantLabelSnapshot,
    quantity: r.quantity,
    unitPrice: Number(r.unitPrice),
    discountAmount: Number(r.discountAmount),
    lineTotal: Number(r.lineTotal),
    costAfter: r.costAfter === null ? null : Number(r.costAfter),
    stockAfter: r.stockAfter,
  }))

  return { items, total, page, pageSize, totalPages }
}

export interface StockCheckHistoryResult {
  items: ProductStockCheckHistoryItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export async function listProductStockCheckHistory({
  db,
  storeId,
  productId,
  query,
}: ProductHistoryDeps): Promise<StockCheckHistoryResult> {
  await ensureProductInStore({ db, storeId, productId })

  const { page, pageSize, variantId } = query
  const offset = (page - 1) * pageSize

  const conditions = [eq(stockCheckLogs.productId, productId), eq(stockCheckLogs.storeId, storeId)]
  if (variantId) {
    conditions.push(eq(stockCheckLogs.variantId, variantId))
  }
  const whereClause = and(...conditions)

  // Subquery để lấy variantLabelSnapshot và note dòng từ stock_check_items
  const variantLabelSql = sql<string | null>`(
    SELECT ${stockCheckItems.variantLabelSnapshot}
    FROM ${stockCheckItems}
    WHERE ${stockCheckItems.stockCheckId} = ${stockCheckLogs.stockCheckId}
      AND ${stockCheckItems.productId} = ${stockCheckLogs.productId}
      AND ${stockCheckItems.variantId} IS NOT DISTINCT FROM ${stockCheckLogs.variantId}
    LIMIT 1
  )`
  const noteSql = sql<string | null>`(
    SELECT ${stockCheckItems.note}
    FROM ${stockCheckItems}
    WHERE ${stockCheckItems.stockCheckId} = ${stockCheckLogs.stockCheckId}
      AND ${stockCheckItems.productId} = ${stockCheckLogs.productId}
      AND ${stockCheckItems.variantId} IS NOT DISTINCT FROM ${stockCheckLogs.variantId}
    LIMIT 1
  )`

  const rows = await db
    .select({
      logId: stockCheckLogs.id,
      stockCheckId: stockCheckLogs.stockCheckId,
      stockCheckCode: stockChecks.code,
      adjustedAt: stockCheckLogs.adjustedAt,
      adjustedBy: stockCheckLogs.adjustedBy,
      adjustedByName: users.name,
      variantId: stockCheckLogs.variantId,
      variantLabelSnapshot: variantLabelSql,
      systemQty: stockCheckLogs.systemQty,
      actualQty: stockCheckLogs.actualQty,
      diff: stockCheckLogs.diff,
      note: noteSql,
    })
    .from(stockCheckLogs)
    .innerJoin(stockChecks, eq(stockChecks.id, stockCheckLogs.stockCheckId))
    .leftJoin(users, eq(users.id, stockCheckLogs.adjustedBy))
    .where(whereClause)
    .orderBy(desc(stockCheckLogs.adjustedAt))
    .limit(pageSize)
    .offset(offset)

  const totalRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(stockCheckLogs)
    .where(whereClause)
  const total = totalRows[0]?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const items: ProductStockCheckHistoryItem[] = rows.map((r) => ({
    stockCheckLogId: r.logId,
    stockCheckId: r.stockCheckId,
    stockCheckCode: r.stockCheckCode,
    adjustedAt: r.adjustedAt.toISOString(),
    adjustedBy: r.adjustedBy,
    adjustedByName: r.adjustedByName ?? null,
    variantId: r.variantId,
    variantLabelSnapshot: r.variantLabelSnapshot ?? null,
    systemQty: r.systemQty,
    actualQty: r.actualQty,
    diff: r.diff,
    note: r.note ?? null,
  }))

  return { items, total, page, pageSize, totalPages }
}

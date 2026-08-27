import { subDays } from 'date-fns'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'

import {
  type InventoryCurrentResponse,
  type InventoryReorderResponse,
  type InventorySlowResponse,
  orderItems,
  orders,
  products,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'

export async function getInventoryCurrent(
  db: Db,
  storeId: string,
  page?: number,
  pageSize?: number,
): Promise<InventoryCurrentResponse> {
  const isPaged = page !== undefined && pageSize !== undefined
  const offset = isPaged ? (page - 1) * pageSize : 0
  const whereCondition = and(
    eq(products.storeId, storeId),
    eq(products.trackInventory, true),
    isNull(products.deletedAt),
  )

  const query = db
    .select({
      productId: products.id,
      productName: products.name,
      sku: products.sku,
      currentStock: products.currentStock,
      costPrice: sql<number>`coalesce(${products.costPrice}, 0)`.as('cost_price'),
      stockValue: sql<number>`${products.currentStock} * coalesce(${products.costPrice}, 0)`.as(
        'stock_value',
      ),
    })
    .from(products)
    .where(whereCondition)
    .orderBy(sql`stock_value DESC`)

  const [result, summaryResult] = await Promise.all([
    isPaged ? query.limit(pageSize).offset(offset) : query,
    db
      .select({
        totalProducts: sql<number>`count(*)::int`,
        totalStockValue: sql<number>`coalesce(sum(${products.currentStock} * coalesce(${products.costPrice}, 0)), 0)::bigint`,
      })
      .from(products)
      .where(whereCondition),
  ])

  const total = Number(summaryResult[0]?.totalProducts ?? 0)
  const totalStockValue = Number(summaryResult[0]?.totalStockValue ?? 0)

  const rows = result.map((r) => ({
    productId: r.productId,
    productName: r.productName,
    sku: r.sku,
    currentStock: Number(r.currentStock),
    costPrice: Number(r.costPrice),
    stockValue: Number(r.stockValue),
  }))

  return {
    rows,
    summary: { totalProducts: total, totalStockValue },
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
  page?: number,
  pageSize?: number,
): Promise<InventoryReorderResponse> {
  const isPaged = page !== undefined && pageSize !== undefined
  const offset = isPaged ? (page - 1) * pageSize : 0
  const whereCondition = and(
    eq(products.storeId, storeId),
    isNull(products.deletedAt),
    gt(products.minStock, 0),
    sql`${products.currentStock} <= ${products.minStock}`,
  )

  const query = db
    .select({
      productId: products.id,
      productName: products.name,
      sku: products.sku,
      currentStock: products.currentStock,
      minStock: products.minStock,
    })
    .from(products)
    .where(whereCondition)
    .orderBy(sql`${products.currentStock} - ${products.minStock} ASC`)

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
    currentStock: r.currentStock,
    minStock: r.minStock,
    reorderQuantity: r.minStock - r.currentStock,
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
  page?: number,
  pageSize?: number,
): Promise<InventorySlowResponse> {
  const isPaged = page !== undefined && pageSize !== undefined
  const offset = isPaged ? (page - 1) * pageSize : 0
  const thirtyDaysAgo = subDays(new Date(), 30)

  const lastSoldSubquery = db
    .select({
      productId: orderItems.productId,
      lastSoldDate: sql<string>`max(${orderItems.createdAt})::date`.as('last_sold_date'),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(eq(orders.storeId, storeId), eq(orders.status, 'completed')))
    .groupBy(orderItems.productId)
    .as('last_sold')

  const whereCondition = and(
    eq(products.storeId, storeId),
    isNull(products.deletedAt),
    gt(products.currentStock, 0),
    sql`(${lastSoldSubquery.lastSoldDate} IS NULL OR ${lastSoldSubquery.lastSoldDate} < ${thirtyDaysAgo.toISOString().slice(0, 10)})`,
  )

  const query = db
    .select({
      productId: products.id,
      productName: products.name,
      sku: products.sku,
      currentStock: products.currentStock,
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
  const now = new Date()
  const rows = result.map((r) => {
    const lastSold = r.lastSoldDate ? String(r.lastSoldDate) : null
    const daysSince = lastSold
      ? Math.floor((now.getTime() - new Date(lastSold).getTime()) / (1000 * 60 * 60 * 24))
      : 9999
    return {
      productId: r.productId,
      productName: r.productName,
      sku: r.sku,
      currentStock: r.currentStock,
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

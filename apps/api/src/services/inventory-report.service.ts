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
): Promise<InventoryCurrentResponse> {
  const result = await db
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
    .where(
      and(
        eq(products.storeId, storeId),
        eq(products.trackInventory, true),
        isNull(products.deletedAt),
      ),
    )
    .orderBy(sql`stock_value DESC`)

  const rows = result.map((r) => ({
    productId: r.productId,
    productName: r.productName,
    sku: r.sku,
    currentStock: Number(r.currentStock),
    costPrice: Number(r.costPrice),
    stockValue: Number(r.stockValue),
  }))

  const totalStockValue = rows.reduce((sum, r) => sum + r.stockValue, 0)

  return { rows, summary: { totalProducts: rows.length, totalStockValue } }
}

export async function getInventoryReorder(
  db: Db,
  storeId: string,
): Promise<InventoryReorderResponse> {
  const result = await db
    .select({
      productId: products.id,
      productName: products.name,
      sku: products.sku,
      currentStock: products.currentStock,
      minStock: products.minStock,
    })
    .from(products)
    .where(
      and(
        eq(products.storeId, storeId),
        isNull(products.deletedAt),
        gt(products.minStock, 0),
        sql`${products.currentStock} <= ${products.minStock}`,
      ),
    )
    .orderBy(sql`${products.currentStock} - ${products.minStock} ASC`)

  const rows = result.map((r) => ({
    productId: r.productId,
    productName: r.productName,
    sku: r.sku,
    currentStock: r.currentStock,
    minStock: r.minStock,
    reorderQuantity: r.minStock - r.currentStock,
  }))

  return { rows }
}

export async function getInventorySlow(db: Db, storeId: string): Promise<InventorySlowResponse> {
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

  const result = await db
    .select({
      productId: products.id,
      productName: products.name,
      sku: products.sku,
      currentStock: products.currentStock,
      lastSoldDate: lastSoldSubquery.lastSoldDate,
    })
    .from(products)
    .leftJoin(lastSoldSubquery, eq(products.id, lastSoldSubquery.productId))
    .where(
      and(
        eq(products.storeId, storeId),
        isNull(products.deletedAt),
        gt(products.currentStock, 0),
        sql`(${lastSoldSubquery.lastSoldDate} IS NULL OR ${lastSoldSubquery.lastSoldDate} < ${thirtyDaysAgo.toISOString().slice(0, 10)})`,
      ),
    )
    .orderBy(sql`${lastSoldSubquery.lastSoldDate} ASC NULLS FIRST`)

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

  return { rows }
}

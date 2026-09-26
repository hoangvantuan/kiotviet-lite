import { and, eq, gte, lte, sql } from 'drizzle-orm'

import {
  orderItems,
  orders,
  parseQuantity,
  products,
  type ProfitReportResponse,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import {
  orderItemCogsExpr,
  orderItemNetQuantityExpr,
  orderItemNetRevenueExpr,
  revenueStatusFilter,
} from '../lib/order-status.js'
import { parseDateRangeLocal } from '../lib/timezone.js'

export async function getProfitReport(
  db: Db,
  storeId: string,
  from: string | undefined,
  to: string | undefined,
): Promise<ProfitReportResponse> {
  const { start, end } = parseDateRangeLocal(from, to)

  const result = await db
    .select({
      productId: orderItems.productId,
      productName: sql<string>`max(${orderItems.productName})`.as('product_name'),
      sku: sql<string>`max(${products.sku})`.as('sku'),
      quantity: sql<number>`sum(${orderItemNetQuantityExpr()})`.as('quantity'),
      revenue: sql<number>`sum(${orderItemNetRevenueExpr()})`.as('revenue'),
      cogs: sql<number>`sum(${orderItemCogsExpr()})`.as('cogs'),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(
      and(
        eq(orders.storeId, storeId),
        revenueStatusFilter(),
        gte(orders.createdAt, start),
        lte(orders.createdAt, end),
      ),
    )
    .groupBy(orderItems.productId)
    .orderBy(sql`(sum(${orderItemNetRevenueExpr()}) - sum(${orderItemCogsExpr()})) DESC`)

  const rows = result.map((r) => {
    const revenue = Number(r.revenue)
    const cogs = Number(r.cogs)
    const profit = revenue - cogs
    const marginPercent = revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0
    return {
      productId: r.productId,
      productName: r.productName,
      sku: r.sku,
      quantity: parseQuantity(r.quantity),
      revenue,
      cogs,
      profit,
      marginPercent,
      isLoss: profit < 0,
    }
  })

  const totalRevenue = rows.reduce((sum, r) => sum + r.revenue, 0)
  const totalCogs = rows.reduce((sum, r) => sum + r.cogs, 0)
  const grossProfit = totalRevenue - totalCogs
  const marginPercent = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 1000) / 10 : 0

  return {
    summary: { totalRevenue, totalCogs, grossProfit, marginPercent },
    rows,
  }
}

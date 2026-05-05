import { subDays } from 'date-fns'
import { and, eq, gte, lte, sql } from 'drizzle-orm'

import { orderItems, orders, products, type ProfitReportResponse } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'

function parseDateRange(from?: string, to?: string) {
  const now = new Date()
  return {
    start: from ? new Date(from + 'T00:00:00Z') : subDays(now, 30),
    end: to ? new Date(to + 'T23:59:59.999Z') : now,
  }
}

export async function getProfitReport(
  db: Db,
  storeId: string,
  from: string | undefined,
  to: string | undefined,
): Promise<ProfitReportResponse> {
  const { start, end } = parseDateRange(from, to)

  const result = await db
    .select({
      productId: orderItems.productId,
      productName: sql<string>`max(${orderItems.productName})`.as('product_name'),
      sku: sql<string>`max(${products.sku})`.as('sku'),
      quantity: sql<number>`sum(${orderItems.quantity})`.as('quantity'),
      revenue: sql<number>`sum(${orderItems.lineTotal})`.as('revenue'),
      cogs: sql<number>`sum(coalesce(${products.costPrice}, 0) * ${orderItems.quantity})`.as(
        'cogs',
      ),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(
      and(
        eq(orders.storeId, storeId),
        eq(orders.status, 'completed'),
        gte(orders.createdAt, start),
        lte(orders.createdAt, end),
      ),
    )
    .groupBy(orderItems.productId)
    .orderBy(
      sql`(sum(${orderItems.lineTotal}) - sum(coalesce(${products.costPrice}, 0) * ${orderItems.quantity})) DESC`,
    )

  const rows = result.map((r) => {
    const revenue = Number(r.revenue)
    const cogs = Number(r.cogs)
    const profit = revenue - cogs
    const marginPercent = revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0
    return {
      productId: r.productId,
      productName: r.productName,
      sku: r.sku,
      quantity: Number(r.quantity),
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

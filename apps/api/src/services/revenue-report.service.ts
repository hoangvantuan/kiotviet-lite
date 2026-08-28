import { and, eq, gt, gte, lte, sql } from 'drizzle-orm'

import {
  customers,
  debts,
  orderItems,
  orders,
  products,
  type RevenueByCustomerResponse,
  type RevenueByEmployeeResponse,
  type RevenueByProductResponse,
  type RevenueByTimeResponse,
  type RevenueGroupBy,
  users,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import {
  orderItemNetQuantityExpr,
  orderItemNetRevenueExpr,
  orderNetRevenueExpr,
  revenueStatusFilter,
} from '../lib/order-status.js'
import { dateTruncLocal, parseDateRangeLocal } from '../lib/timezone.js'

export async function getRevenueByTime(
  db: Db,
  storeId: string,
  from: string | undefined,
  to: string | undefined,
  groupBy: RevenueGroupBy,
): Promise<RevenueByTimeResponse> {
  const { start, end } = parseDateRangeLocal(from, to)
  const periodLength = end.getTime() - start.getTime()
  const prevEnd = new Date(start.getTime() - 1)
  const prevStart = new Date(prevEnd.getTime() - periodLength)

  const truncExpr = dateTruncLocal(groupBy)

  const [result, prevResult] = await Promise.all([
    db
      .select({
        date: truncExpr.as('date'),
        orderCount: sql<number>`count(${orders.id})`.as('order_count'),
        revenue: sql<number>`coalesce(sum(${orderNetRevenueExpr()}), 0)`.as('revenue'),
      })
      .from(orders)
      .where(
        and(
          eq(orders.storeId, storeId),
          revenueStatusFilter(),
          gte(orders.createdAt, start),
          lte(orders.createdAt, end),
        ),
      )
      .groupBy(truncExpr)
      .orderBy(truncExpr),
    db
      .select({
        revenue: sql<number>`coalesce(sum(${orderNetRevenueExpr()}), 0)`.as('revenue'),
      })
      .from(orders)
      .where(
        and(
          eq(orders.storeId, storeId),
          revenueStatusFilter(),
          gte(orders.createdAt, prevStart),
          lte(orders.createdAt, prevEnd),
        ),
      ),
  ])

  const prevTotalRevenue = Number(prevResult[0]?.revenue ?? 0)
  const currentTotalRevenue = result.reduce((sum, r) => sum + Number(r.revenue), 0)
  const periodTrend =
    prevTotalRevenue > 0
      ? Math.round(((currentTotalRevenue - prevTotalRevenue) / prevTotalRevenue) * 10000) / 100
      : null

  const rows = result.map((r) => ({
    date: String(r.date),
    label: String(r.date).slice(5),
    orderCount: Number(r.orderCount),
    revenue: Number(r.revenue),
    previousRevenue: prevTotalRevenue,
    trend: periodTrend,
  }))

  const totalOrders = rows.reduce((sum, r) => sum + r.orderCount, 0)
  const totalRevenue = rows.reduce((sum, r) => sum + r.revenue, 0)
  const dayCount = rows.length || 1
  const avgDaily = Math.round(totalRevenue / dayCount)

  return { rows, summary: { totalOrders, totalRevenue, avgDaily } }
}

export async function getRevenueByProduct(
  db: Db,
  storeId: string,
  from: string | undefined,
  to: string | undefined,
): Promise<RevenueByProductResponse> {
  const { start, end } = parseDateRangeLocal(from, to)

  const result = await db
    .select({
      productId: orderItems.productId,
      productName: sql<string>`max(${orderItems.productName})`.as('product_name'),
      sku: sql<string>`max(${products.sku})`.as('sku'),
      quantity: sql<number>`sum(${orderItemNetQuantityExpr()})`.as('quantity'),
      revenue: sql<number>`sum(${orderItemNetRevenueExpr()})`.as('revenue'),
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
    .orderBy(sql`revenue DESC`)

  const totalRevenue = result.reduce((sum, r) => sum + Number(r.revenue), 0)
  const totalQuantity = result.reduce((sum, r) => sum + Number(r.quantity), 0)

  const rows = result.map((r) => ({
    productId: r.productId,
    productName: r.productName,
    sku: r.sku,
    quantity: Number(r.quantity),
    revenue: Number(r.revenue),
    percentage: totalRevenue > 0 ? Math.round((Number(r.revenue) / totalRevenue) * 10000) / 100 : 0,
  }))

  return { rows, summary: { totalProducts: rows.length, totalQuantity, totalRevenue } }
}

export async function getRevenueByCustomer(
  db: Db,
  storeId: string,
  from: string | undefined,
  to: string | undefined,
): Promise<RevenueByCustomerResponse> {
  const { start, end } = parseDateRangeLocal(from, to)

  const result = await db
    .select({
      customerId: orders.customerId,
      customerName: sql<string>`coalesce(max(${customers.name}), 'Khách lẻ')`.as('customer_name'),
      phone: sql<string | null>`max(${customers.phone})`.as('phone'),
      orderCount: sql<number>`count(${orders.id})`.as('order_count'),
      revenue: sql<number>`coalesce(sum(${orderNetRevenueExpr()}), 0)`.as('revenue'),
    })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .where(
      and(
        eq(orders.storeId, storeId),
        revenueStatusFilter(),
        gte(orders.createdAt, start),
        lte(orders.createdAt, end),
      ),
    )
    .groupBy(orders.customerId)
    .orderBy(sql`revenue DESC`)

  const totalRevenue = result.reduce((sum, r) => sum + Number(r.revenue), 0)

  const customerIds = result.map((r) => r.customerId).filter((id): id is string => id !== null)

  let debtMap = new Map<string, number>()
  if (customerIds.length > 0) {
    const debtResult = await db
      .select({
        customerId: debts.customerId,
        totalDebt: sql<number>`sum(${debts.remaining})`.as('total_debt'),
      })
      .from(debts)
      .where(and(eq(debts.storeId, storeId), gt(debts.remaining, 0)))
      .groupBy(debts.customerId)

    debtMap = new Map(debtResult.map((r) => [r.customerId, Number(r.totalDebt)]))
  }

  const rows = result.map((r) => ({
    customerId: r.customerId,
    customerName: r.customerName,
    phone: r.phone,
    orderCount: Number(r.orderCount),
    revenue: Number(r.revenue),
    currentDebt: r.customerId ? (debtMap.get(r.customerId) ?? 0) : 0,
  }))

  return {
    rows,
    summary: { totalCustomers: rows.filter((r) => r.customerId !== null).length, totalRevenue },
  }
}

export async function getRevenueByEmployee(
  db: Db,
  storeId: string,
  from: string | undefined,
  to: string | undefined,
): Promise<RevenueByEmployeeResponse> {
  const { start, end } = parseDateRangeLocal(from, to)

  const result = await db
    .select({
      userId: orders.userId,
      userName: sql<string>`max(${users.name})`.as('user_name'),
      orderCount: sql<number>`count(${orders.id})`.as('order_count'),
      revenue: sql<number>`coalesce(sum(${orderNetRevenueExpr()}), 0)`.as('revenue'),
    })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .where(
      and(
        eq(orders.storeId, storeId),
        revenueStatusFilter(),
        gte(orders.createdAt, start),
        lte(orders.createdAt, end),
      ),
    )
    .groupBy(orders.userId)
    .orderBy(sql`revenue DESC`)

  const totalRevenue = result.reduce((sum, r) => sum + Number(r.revenue), 0)

  const rows = result.map((r) => ({
    userId: r.userId,
    userName: r.userName,
    orderCount: Number(r.orderCount),
    revenue: Number(r.revenue),
    percentage: totalRevenue > 0 ? Math.round((Number(r.revenue) / totalRevenue) * 10000) / 100 : 0,
  }))

  return { rows, summary: { totalEmployees: rows.length, totalRevenue } }
}

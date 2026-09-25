import { and, eq, gt, gte, lte, sql } from 'drizzle-orm'

import {
  brands,
  categories,
  customers,
  debts,
  orderItems,
  orderReturnItems,
  orders,
  products,
  type RevenueByCustomerResponse,
  type RevenueByDimensionResponse,
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
    .leftJoin(
      customers,
      and(eq(orders.customerId, customers.id), eq(customers.storeId, orders.storeId)),
    )
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

export async function getRevenueByDimension(
  db: Db,
  storeId: string,
  from: string | undefined,
  to: string | undefined,
  dimension: 'thuong-hieu' | 'danh-muc',
): Promise<RevenueByDimensionResponse> {
  const { start, end } = parseDateRangeLocal(from, to)
  const dimensionId = dimension === 'thuong-hieu' ? brands.id : categories.id
  const dimensionName = dimension === 'thuong-hieu' ? brands.name : categories.name

  // Group first by order: order-level discounts must be allocated across the
  // original line totals before subtracting the already-discounted refunds.
  const result = await db
    .select({
      orderId: orders.id,
      orderTotal: orders.total,
      dimensionId,
      name: dimensionName,
      gross: sql<number>`coalesce(sum(${orderItems.lineTotal}), 0)`.as('gross'),
      refunded: sql<number>`coalesce(sum(coalesce((
        SELECT sum(${orderReturnItems.lineTotal})
        FROM ${orderReturnItems}
        WHERE ${orderReturnItems.orderItemId} = ${orderItems.id}
      ), 0)), 0)`.as('refunded'),
    })
    .from(orders)
    .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
    .leftJoin(products, and(eq(products.id, orderItems.productId), eq(products.storeId, storeId)))
    .leftJoin(brands, and(eq(brands.id, products.brandId), eq(brands.storeId, storeId)))
    .leftJoin(
      categories,
      and(eq(categories.id, products.categoryId), eq(categories.storeId, storeId)),
    )
    .where(
      and(
        eq(orders.storeId, storeId),
        revenueStatusFilter(),
        gte(orders.createdAt, start),
        lte(orders.createdAt, end),
      ),
    )
    .groupBy(orders.id, dimensionId, dimensionName)
    .orderBy(orders.id, dimensionId)

  const totals = new Map<
    string | null,
    { dimensionId: string | null; name: string; revenue: number }
  >()
  for (let i = 0; i < result.length; ) {
    let endIndex = i + 1
    let grossTotal = Number(result[i]!.gross)
    while (endIndex < result.length && result[endIndex]!.orderId === result[i]!.orderId) {
      grossTotal += Number(result[endIndex]!.gross)
      endIndex++
    }
    const orderTotal = Number(result[i]!.orderTotal)
    let allocated = 0
    for (let j = i; j < endIndex; j++) {
      const group = result[j]!
      const grossShare =
        j === endIndex - 1
          ? orderTotal - allocated
          : grossTotal > 0
            ? Math.floor((Number(group.gross) * orderTotal) / grossTotal)
            : 0
      allocated += grossShare
      const revenue = grossShare - Number(group.refunded)
      const existing = totals.get(group.dimensionId)
      if (existing) existing.revenue += revenue
      else
        totals.set(group.dimensionId, {
          dimensionId: group.dimensionId,
          name: group.name ?? 'Chưa phân loại',
          revenue,
        })
    }
    i = endIndex
  }

  const grouped = [...totals.values()]
  const totalRevenue = grouped.reduce((sum, row) => sum + row.revenue, 0)
  const rows = grouped
    .sort((a, b) => b.revenue - a.revenue)
    .map((row) => ({
      ...row,
      percentage: totalRevenue > 0 ? Math.round((row.revenue / totalRevenue) * 10000) / 100 : 0,
    }))
  return { rows, summary: { totalRevenue } }
}

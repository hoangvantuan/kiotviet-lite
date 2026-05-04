import {
  eachDayOfInterval,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
  subYears,
} from 'date-fns'
import { and, eq, gt, gte, isNull, lte, sql } from 'drizzle-orm'

import {
  customers,
  type DashboardPeriod,
  type DashboardResponse,
  debts,
  orderItems,
  orders,
  products,
  stores,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'

interface PeriodRange {
  start: Date
  end: Date
}

function getPeriodRange(period: DashboardPeriod, now: Date): PeriodRange {
  switch (period) {
    case 'today':
      return { start: startOfDay(now), end: now }
    case 'week':
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: now }
    case 'month':
      return { start: startOfMonth(now), end: now }
    case 'year':
      return { start: startOfYear(now), end: now }
  }
}

function getPreviousPeriodRange(period: DashboardPeriod, now: Date): PeriodRange {
  switch (period) {
    case 'today': {
      const d = subDays(now, 1)
      return { start: startOfDay(d), end: d }
    }
    case 'week': {
      const d = subWeeks(now, 1)
      return { start: startOfWeek(d, { weekStartsOn: 1 }), end: d }
    }
    case 'month': {
      const d = subMonths(now, 1)
      return { start: startOfMonth(d), end: d }
    }
    case 'year': {
      const d = subYears(now, 1)
      return { start: startOfYear(d), end: d }
    }
  }
}

function computeTrend(value: number, previousValue: number): number | null {
  if (previousValue === 0) return null
  return Math.round(((value - previousValue) / previousValue) * 10000) / 100
}

interface MetricsRow {
  revenue: number
  profit: number
  orderCount: number
}

async function queryMetrics(db: Db, storeId: string, start: Date, end: Date): Promise<MetricsRow> {
  const result = await db
    .select({
      revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
      orderCount: sql<number>`count(${orders.id})`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.storeId, storeId),
        eq(orders.status, 'completed'),
        gte(orders.createdAt, start),
        lte(orders.createdAt, end),
      ),
    )

  const row = result[0]!
  const revenue = Number(row.revenue)
  const orderCount = Number(row.orderCount)

  // Profit = revenue - COGS. Since order_items doesn't have costPrice,
  // join with products to get current costPrice as best approximation.
  const cogsResult = await db
    .select({
      totalCogs: sql<number>`coalesce(sum(coalesce(${products.costPrice}, 0) * ${orderItems.quantity}), 0)`,
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

  const totalCogs = Number(cogsResult[0]?.totalCogs ?? 0)
  const profit = revenue - totalCogs

  return { revenue, profit, orderCount }
}

async function getSparkline(db: Db, storeId: string): Promise<number[]> {
  const now = new Date()
  const sevenDaysAgo = subDays(startOfDay(now), 6)
  const days = eachDayOfInterval({ start: sevenDaysAgo, end: startOfDay(now) })

  const result = await db
    .select({
      day: sql<string>`date_trunc('day', ${orders.createdAt})::date`,
      revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.storeId, storeId),
        eq(orders.status, 'completed'),
        gte(orders.createdAt, sevenDaysAgo),
      ),
    )
    .groupBy(sql`date_trunc('day', ${orders.createdAt})::date`)

  const revenueByDay = new Map<string, number>()
  for (const r of result) {
    revenueByDay.set(r.day, Number(r.revenue))
  }

  return days.map((d: Date) => {
    const key = format(d, 'yyyy-MM-dd')
    return revenueByDay.get(key) ?? 0
  })
}

export async function getDashboardMetrics(
  db: Db,
  storeId: string,
  period: DashboardPeriod,
): Promise<DashboardResponse['metrics']> {
  const now = new Date()
  const current = getPeriodRange(period, now)
  const previous = getPreviousPeriodRange(period, now)

  const [currentMetrics, previousMetrics, revenueSparkline] = await Promise.all([
    queryMetrics(db, storeId, current.start, current.end),
    queryMetrics(db, storeId, previous.start, previous.end),
    getSparkline(db, storeId),
  ])

  const avgOrderValue =
    currentMetrics.orderCount > 0
      ? Math.round(currentMetrics.revenue / currentMetrics.orderCount)
      : 0
  const prevAvgOrderValue =
    previousMetrics.orderCount > 0
      ? Math.round(previousMetrics.revenue / previousMetrics.orderCount)
      : 0

  // Build sparklines for each metric (revenue sparkline is the base)
  // For simplicity, orderCount sparkline and profit sparkline use separate queries
  const orderSparkline = await getOrderCountSparkline(db, storeId)
  const profitSparkline = await getProfitSparkline(db, storeId)
  const avgSparkline = revenueSparkline.map((rev, i) => {
    const oc = orderSparkline[i] ?? 0
    return oc > 0 ? Math.round(rev / oc) : 0
  })

  return {
    revenue: {
      value: currentMetrics.revenue,
      previousValue: previousMetrics.revenue,
      trend: computeTrend(currentMetrics.revenue, previousMetrics.revenue),
      sparkline: revenueSparkline,
    },
    profit: {
      value: currentMetrics.profit,
      previousValue: previousMetrics.profit,
      trend: computeTrend(currentMetrics.profit, previousMetrics.profit),
      sparkline: profitSparkline,
    },
    orderCount: {
      value: currentMetrics.orderCount,
      previousValue: previousMetrics.orderCount,
      trend: computeTrend(currentMetrics.orderCount, previousMetrics.orderCount),
      sparkline: orderSparkline,
    },
    avgOrderValue: {
      value: avgOrderValue,
      previousValue: prevAvgOrderValue,
      trend: computeTrend(avgOrderValue, prevAvgOrderValue),
      sparkline: avgSparkline,
    },
  }
}

async function getOrderCountSparkline(db: Db, storeId: string): Promise<number[]> {
  const now = new Date()
  const sevenDaysAgo = subDays(startOfDay(now), 6)
  const days = eachDayOfInterval({ start: sevenDaysAgo, end: startOfDay(now) })

  const result = await db
    .select({
      day: sql<string>`date_trunc('day', ${orders.createdAt})::date`,
      cnt: sql<number>`count(${orders.id})`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.storeId, storeId),
        eq(orders.status, 'completed'),
        gte(orders.createdAt, sevenDaysAgo),
      ),
    )
    .groupBy(sql`date_trunc('day', ${orders.createdAt})::date`)

  const countByDay = new Map<string, number>()
  for (const r of result) {
    countByDay.set(r.day, Number(r.cnt))
  }

  return days.map((d: Date) => {
    const key = format(d, 'yyyy-MM-dd')
    return countByDay.get(key) ?? 0
  })
}

async function getProfitSparkline(db: Db, storeId: string): Promise<number[]> {
  const now = new Date()
  const sevenDaysAgo = subDays(startOfDay(now), 6)
  const days = eachDayOfInterval({ start: sevenDaysAgo, end: startOfDay(now) })

  // Revenue per day
  const revResult = await db
    .select({
      day: sql<string>`date_trunc('day', ${orders.createdAt})::date`,
      revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.storeId, storeId),
        eq(orders.status, 'completed'),
        gte(orders.createdAt, sevenDaysAgo),
      ),
    )
    .groupBy(sql`date_trunc('day', ${orders.createdAt})::date`)

  // COGS per day
  const cogsResult = await db
    .select({
      day: sql<string>`date_trunc('day', ${orders.createdAt})::date`,
      cogs: sql<number>`coalesce(sum(coalesce(${products.costPrice}, 0) * ${orderItems.quantity}), 0)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(
      and(
        eq(orders.storeId, storeId),
        eq(orders.status, 'completed'),
        gte(orders.createdAt, sevenDaysAgo),
      ),
    )
    .groupBy(sql`date_trunc('day', ${orders.createdAt})::date`)

  const revByDay = new Map<string, number>()
  for (const r of revResult) {
    revByDay.set(r.day, Number(r.revenue))
  }
  const cogsByDay = new Map<string, number>()
  for (const r of cogsResult) {
    cogsByDay.set(r.day, Number(r.cogs))
  }

  return days.map((d: Date) => {
    const key = format(d, 'yyyy-MM-dd')
    const rev = revByDay.get(key) ?? 0
    const cogs = cogsByDay.get(key) ?? 0
    return rev - cogs
  })
}

const DAY_LABELS: Record<number, string> = {
  0: 'CN',
  1: 'T2',
  2: 'T3',
  3: 'T4',
  4: 'T5',
  5: 'T6',
  6: 'T7',
}

export async function getRevenueChart(
  db: Db,
  storeId: string,
): Promise<DashboardResponse['revenueChart']> {
  const now = new Date()
  const sevenDaysAgo = subDays(startOfDay(now), 6)
  const days = eachDayOfInterval({ start: sevenDaysAgo, end: startOfDay(now) })

  const result = await db
    .select({
      day: sql<string>`date_trunc('day', ${orders.createdAt})::date`,
      revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
      orderCount: sql<number>`count(${orders.id})`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.storeId, storeId),
        eq(orders.status, 'completed'),
        gte(orders.createdAt, sevenDaysAgo),
      ),
    )
    .groupBy(sql`date_trunc('day', ${orders.createdAt})::date`)

  const dataByDay = new Map<string, { revenue: number; orderCount: number }>()
  for (const r of result) {
    dataByDay.set(r.day, {
      revenue: Number(r.revenue),
      orderCount: Number(r.orderCount),
    })
  }

  return days.map((d: Date) => {
    const key = format(d, 'yyyy-MM-dd')
    const data = dataByDay.get(key)
    return {
      date: key,
      label: DAY_LABELS[d.getDay()] ?? '',
      revenue: data?.revenue ?? 0,
      orderCount: data?.orderCount ?? 0,
    }
  })
}

export async function getTopProducts(
  db: Db,
  storeId: string,
  period: DashboardPeriod,
): Promise<DashboardResponse['topProducts']> {
  const now = new Date()
  const { start, end } = getPeriodRange(period, now)

  // Total revenue in period for percentage calculation
  const totalResult = await db
    .select({
      totalRevenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.storeId, storeId),
        eq(orders.status, 'completed'),
        gte(orders.createdAt, start),
        lte(orders.createdAt, end),
      ),
    )
  const totalRevenue = Number(totalResult[0]?.totalRevenue ?? 0)

  const result = await db
    .select({
      productId: orderItems.productId,
      name: orderItems.productName,
      quantity: sql<number>`sum(${orderItems.quantity})`,
      revenue: sql<number>`sum(${orderItems.lineTotal})`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orders.storeId, storeId),
        eq(orders.status, 'completed'),
        gte(orders.createdAt, start),
        lte(orders.createdAt, end),
      ),
    )
    .groupBy(orderItems.productId, orderItems.productName)
    .orderBy(sql`sum(${orderItems.quantity}) DESC`)
    .limit(5)

  return result.map((r) => ({
    productId: r.productId,
    name: r.name,
    quantity: Number(r.quantity),
    revenue: Number(r.revenue),
    percentage: totalRevenue > 0 ? Math.round((Number(r.revenue) / totalRevenue) * 10000) / 100 : 0,
  }))
}

export async function getLowStockAlerts(
  db: Db,
  storeId: string,
): Promise<DashboardResponse['lowStockAlerts']> {
  const result = await db
    .select({
      productId: products.id,
      name: products.name,
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
    .orderBy(products.currentStock)
    .limit(5)

  return result.map((r) => ({
    productId: r.productId,
    name: r.name,
    currentStock: r.currentStock,
    minStock: r.minStock,
    status: r.currentStock === 0 ? ('out' as const) : ('low' as const),
  }))
}

function parseOverdueDays(raw: string): number[] {
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n) && n > 0)
    .sort((a, b) => a - b)
}

export async function getOverdueDebts(
  db: Db,
  storeId: string,
): Promise<DashboardResponse['overdueDebts']> {
  // Get store settings for overdue days threshold
  const store = await db.query.stores.findFirst({ where: eq(stores.id, storeId) })
  const overdueDays = parseOverdueDays(store?.debtOverdueDays ?? '30,60,90')
  const minOverdueDays = overdueDays[0] ?? 30

  // Find customers with overdue debts
  const result = await db
    .select({
      customerId: debts.customerId,
      name: customers.name,
      totalDebt: sql<number>`sum(${debts.remaining})`,
      maxOverdueDays: sql<number>`max(extract(day from now() - ${debts.createdAt})::integer)`,
    })
    .from(debts)
    .innerJoin(customers, eq(debts.customerId, customers.id))
    .where(
      and(
        eq(debts.storeId, storeId),
        gt(debts.remaining, 0),
        sql`extract(day from now() - ${debts.createdAt})::integer > ${minOverdueDays}`,
      ),
    )
    .groupBy(debts.customerId, customers.name)
    .orderBy(sql`max(extract(day from now() - ${debts.createdAt})::integer) DESC`)
    .limit(5)

  return result.map((r) => ({
    customerId: r.customerId,
    name: r.name,
    totalDebt: Number(r.totalDebt),
    maxOverdueDays: Number(r.maxOverdueDays),
  }))
}

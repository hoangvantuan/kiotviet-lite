import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm'

import {
  customers,
  type DebtAgingReport,
  type DebtAgingRow,
  debts,
  type DebtSummaryReport,
  receipts,
  stores,
  supplierPayments,
  suppliers,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { parseDateRangeBoundary } from '../lib/timezone.js'

interface ReportQuery {
  from?: string
  to?: string
}

function parseOverdueDays(raw: string): number[] {
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n) && n > 0)
    .sort((a, b) => a - b)
}

function buildBucketLabels(days: number[]): string[] {
  const labels: string[] = []
  for (let i = 0; i < days.length; i++) {
    const from = i === 0 ? 0 : (days[i - 1] ?? 0) + 1
    labels.push(`${from}-${days[i] ?? 0} ngày`)
  }
  labels.push(`>${days[days.length - 1]} ngày`)
  return labels
}

export async function getDebtAgingReport({
  db,
  storeId,
  query,
}: {
  db: Db
  storeId: string
  query: ReportQuery
}): Promise<DebtAgingReport> {
  const store = await db.query.stores.findFirst({ where: eq(stores.id, storeId) })
  const overdueDays = parseOverdueDays(store?.debtOverdueDays ?? '30,60,90')
  const bucketLabels = buildBucketLabels(overdueDays)
  const bucketCount = overdueDays.length + 1

  const fromDate = parseDateRangeBoundary(query.from, 'start')
  const toDate = parseDateRangeBoundary(query.to, 'end')

  const rows = await db
    .select({
      customerId: customers.id,
      customerName: customers.name,
      customerPhone: customers.phone,
      debtLimit: customers.debtLimit,
      debtId: debts.id,
      remaining: debts.remaining,
      daysSince: sql<number>`EXTRACT(DAY FROM NOW() - ${debts.createdAt})`.as('days_since'),
    })
    .from(debts)
    .innerJoin(customers, eq(debts.customerId, customers.id))
    .where(
      and(
        eq(debts.storeId, storeId),
        sql`${debts.remaining} > 0`,
        isNull(customers.deletedAt),
        ...(fromDate ? [gte(debts.createdAt, fromDate)] : []),
        ...(toDate ? [lte(debts.createdAt, toDate)] : []),
      ),
    )

  const grouped = new Map<
    string,
    { name: string; phone: string | null; debtLimit: number | null; buckets: number[] }
  >()

  for (const row of rows) {
    let entry = grouped.get(row.customerId)
    if (!entry) {
      entry = {
        name: row.customerName,
        phone: row.customerPhone,
        debtLimit: row.debtLimit,
        buckets: Array.from({ length: bucketCount }, () => 0),
      }
      grouped.set(row.customerId, entry)
    }
    const days = Number(row.daysSince) || 0
    let bucketIdx = overdueDays.length
    for (let i = 0; i < overdueDays.length; i++) {
      if (days <= (overdueDays[i] ?? 0)) {
        bucketIdx = i
        break
      }
    }
    const prev = entry.buckets[bucketIdx] ?? 0
    entry.buckets[bucketIdx] = prev + Number(row.remaining)
  }

  const reportRows: DebtAgingRow[] = []
  const totalBuckets = Array.from({ length: bucketCount }, () => 0)
  let grandTotal = 0

  for (const [customerId, entry] of grouped) {
    const total = entry.buckets.reduce((s, v) => s + v, 0)
    reportRows.push({
      customerId,
      customerName: entry.name,
      customerPhone: entry.phone,
      debtLimit: entry.debtLimit,
      totalDebt: total,
      buckets: entry.buckets,
    })
    grandTotal += total
    for (let i = 0; i < bucketCount; i++) {
      totalBuckets[i] = (totalBuckets[i] ?? 0) + (entry.buckets[i] ?? 0)
    }
  }

  reportRows.sort((a, b) => b.totalDebt - a.totalDebt)

  return {
    rows: reportRows,
    totals: { totalDebt: grandTotal, buckets: totalBuckets },
    bucketLabels,
  }
}

export async function getDebtSummaryReport({
  db,
  storeId,
  query,
}: {
  db: Db
  storeId: string
  query: ReportQuery
}): Promise<DebtSummaryReport> {
  const now = new Date()
  const fromDate = query.from ? new Date(query.from) : new Date(now.getTime() - 30 * 86400000)
  const toDate = query.to ? new Date(query.to) : now

  const [receivableResult, payableResult, receiptsResult, paymentsResult] = await Promise.all([
    db
      .select({
        totalDebt: sql<number>`COALESCE(SUM(${customers.currentDebt}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(customers)
      .where(
        and(
          eq(customers.storeId, storeId),
          sql`${customers.currentDebt} > 0`,
          isNull(customers.deletedAt),
        ),
      ),

    db
      .select({
        totalDebt: sql<number>`COALESCE(SUM(${suppliers.currentDebt}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(suppliers)
      .where(
        and(
          eq(suppliers.storeId, storeId),
          sql`${suppliers.currentDebt} > 0`,
          isNull(suppliers.deletedAt),
        ),
      ),

    db
      .select({
        total: sql<number>`COALESCE(SUM(${receipts.amount}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(receipts)
      .where(
        and(
          eq(receipts.storeId, storeId),
          gte(receipts.createdAt, fromDate),
          lte(receipts.createdAt, toDate),
        ),
      ),

    db
      .select({
        total: sql<number>`COALESCE(SUM(${supplierPayments.amount}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(supplierPayments)
      .where(
        and(
          eq(supplierPayments.storeId, storeId),
          gte(supplierPayments.createdAt, fromDate),
          lte(supplierPayments.createdAt, toDate),
        ),
      ),
  ])

  const recv = receivableResult[0] ?? { totalDebt: 0, count: 0 }
  const pay = payableResult[0] ?? { totalDebt: 0, count: 0 }
  const rcpt = receiptsResult[0] ?? { total: 0, count: 0 }
  const pmnt = paymentsResult[0] ?? { total: 0, count: 0 }
  const totalIn = Number(rcpt.total)
  const totalOut = Number(pmnt.total)

  return {
    receivable: {
      totalDebt: Number(recv.totalDebt),
      customerCount: Number(recv.count),
      totalCollected: totalIn,
      receiptCount: Number(rcpt.count),
    },
    payable: {
      totalDebt: Number(pay.totalDebt),
      supplierCount: Number(pay.count),
      totalPaid: totalOut,
      paymentCount: Number(pmnt.count),
    },
    cashFlow: {
      totalIn,
      totalOut,
      net: totalIn - totalOut,
    },
    period: {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    },
  }
}

function formatVnd(amount: number): string {
  return new Intl.NumberFormat('vi-VN').format(amount)
}

export function buildAgingCsv(report: DebtAgingReport): string {
  const BOM = '﻿'
  const header = ['Khách hàng', 'Điện thoại', 'Hạn mức', 'Tổng nợ', ...report.bucketLabels]
  const lines = [header.join(',')]

  for (const row of report.rows) {
    lines.push(
      [
        `"${row.customerName}"`,
        row.customerPhone ?? '',
        row.debtLimit !== null ? formatVnd(row.debtLimit) : 'Không giới hạn',
        formatVnd(row.totalDebt),
        ...row.buckets.map(formatVnd),
      ].join(','),
    )
  }

  lines.push(
    [
      '"Tổng cộng"',
      '',
      '',
      formatVnd(report.totals.totalDebt),
      ...report.totals.buckets.map(formatVnd),
    ].join(','),
  )

  return BOM + lines.join('\n')
}

export function buildSummaryCsv(report: DebtSummaryReport): string {
  const BOM = '﻿'
  const lines: string[] = []

  lines.push('PHẢI THU (KHÁCH HÀNG)')
  lines.push('Chỉ tiêu,Giá trị')
  lines.push(`Tổng nợ phải thu,${formatVnd(report.receivable.totalDebt)}`)
  lines.push(`Số khách hàng còn nợ,${report.receivable.customerCount}`)
  lines.push(`Tổng đã thu (trong kỳ),${formatVnd(report.receivable.totalCollected)}`)
  lines.push(`Số phiếu thu,${report.receivable.receiptCount}`)
  lines.push('')

  lines.push('PHẢI TRẢ (NHÀ CUNG CẤP)')
  lines.push('Chỉ tiêu,Giá trị')
  lines.push(`Tổng nợ phải trả,${formatVnd(report.payable.totalDebt)}`)
  lines.push(`Số NCC còn nợ,${report.payable.supplierCount}`)
  lines.push(`Tổng đã trả (trong kỳ),${formatVnd(report.payable.totalPaid)}`)
  lines.push(`Số phiếu chi,${report.payable.paymentCount}`)
  lines.push('')

  lines.push('SỔ QUỸ (TRONG KỲ)')
  lines.push('Chỉ tiêu,Giá trị')
  lines.push(`Tổng thu,${formatVnd(report.cashFlow.totalIn)}`)
  lines.push(`Tổng chi,${formatVnd(report.cashFlow.totalOut)}`)
  lines.push(`Chênh lệch,${formatVnd(report.cashFlow.net)}`)

  return BOM + lines.join('\n')
}

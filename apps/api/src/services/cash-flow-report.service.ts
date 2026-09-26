/**
 * BC-06: báo cáo dòng tiền theo phương thức và đối soát tiền mặt cuối ngày.
 *
 * - Tiền vào: tiền thực nhận trên đơn (lib/cash-flow.ts) và phiếu thu theo phương thức nhận.
 *   KHÔNG cộng `debts.paid` (bẫy TIEN-01): phần ghi nợ chỉ thành tiền khi có phiếu thu.
 * - Tiền ra: phần hoàn tiền của phiếu trả theo phương thức hoàn, phiếu chi nhà cung cấp.
 * - Doanh thu gộp và thuần: gộp = đơn giá × số lượng trước chiết khấu; thuần = gộp - chiết khấu
 *   dòng - chiết khấu đơn - giá trị hàng trả (số chụp lúc bán, ADR-0010).
 *
 * Kỳ báo cáo lọc đơn theo ngày bán, phiếu trả theo NGÀY LẬP PHIẾU (tiền hoàn ra quỹ hôm đó), khác
 * báo cáo doanh thu theo ngày đơn vốn trừ hàng trả vào ngày bán.
 */
import { and, eq, gte, lte, type SQL, sql } from 'drizzle-orm'

import {
  type CashFlowMethodRow,
  type CashFlowReport,
  type CashFlowReportQuery,
  cashShifts,
  MONEY_METHODS,
  type MoneyMethod,
  orderItems,
  orderReturns,
  orders,
  receipts,
  supplierPayments,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import {
  cashFlowOrderFilter,
  cashFlowReceiptFilter,
  cashFlowReturnFilter,
  cashFlowSupplierPaymentFilter,
  orderCashInExpr,
  orderDebtExpr,
  orderQrInExpr,
  orderTransferInExpr,
  toMoneyMethod,
} from '../lib/cash-flow.js'
import { ApiError } from '../lib/errors.js'
import { parseDateRangeLocal } from '../lib/timezone.js'
import { listShiftsOpenedBetween } from './shifts.service.js'

const sumInt = (expr: SQL) => sql<string>`coalesce(sum(${expr}), 0)::bigint`

const MAX_RANGE_DAYS = 366

export interface GetCashFlowReportDeps {
  db: Db
  storeId: string
  query: CashFlowReportQuery
}

export async function getCashFlowReport({
  db,
  storeId,
  query,
}: GetCashFlowReportDeps): Promise<CashFlowReport> {
  const { start, end } = parseDateRangeLocal(query.from, query.to)
  if (start > end) {
    throw new ApiError('VALIDATION_ERROR', 'Ngày bắt đầu phải trước ngày kết thúc')
  }
  if (end.getTime() - start.getTime() > MAX_RANGE_DAYS * 86_400_000) {
    throw new ApiError('VALIDATION_ERROR', `Khoảng thời gian tối đa ${MAX_RANGE_DAYS} ngày`)
  }

  const orderScope = and(
    eq(orders.storeId, storeId),
    gte(orders.createdAt, start),
    lte(orders.createdAt, end),
    cashFlowOrderFilter(),
  )
  const receiptScope = and(
    eq(receipts.storeId, storeId),
    gte(receipts.createdAt, start),
    lte(receipts.createdAt, end),
    cashFlowReceiptFilter(),
  )
  const returnScope = and(
    eq(orderReturns.storeId, storeId),
    gte(orderReturns.createdAt, start),
    lte(orderReturns.createdAt, end),
    cashFlowReturnFilter(),
  )
  const supplierScope = and(
    eq(supplierPayments.storeId, storeId),
    gte(supplierPayments.createdAt, start),
    lte(supplierPayments.createdAt, end),
    cashFlowSupplierPaymentFilter(),
  )

  // Doanh thu gộp, chiết khấu dòng lấy từ dòng hàng; chiết khấu đơn từ đơn (đơn cũ trước R2 chưa
  // phân bổ chiết khấu xuống dòng)
  const [lineAgg] = await db
    .select({
      gross: sumInt(sql`${orderItems.unitPrice} * ${orderItems.quantity}`),
      lineDiscount: sumInt(sql`${orderItems.discountAmount}`),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(orderScope)

  const [orderAgg] = await db
    .select({
      count: sql<number>`count(*)::int`,
      orderDiscount: sumInt(sql`${orders.discountAmount}`),
      cash: sumInt(orderCashInExpr()),
      transfer: sumInt(orderTransferInExpr()),
      qr: sumInt(orderQrInExpr()),
      debt: sumInt(orderDebtExpr()),
      unassignedCount: sql<number>`(count(*) FILTER (WHERE ${orders.shiftId} IS NULL))::int`,
      unassignedCash: sumInt(
        sql`CASE WHEN ${orders.shiftId} IS NULL THEN ${orderCashInExpr()} END`,
      ),
    })
    .from(orders)
    .where(orderScope)

  const receiptRows = await db
    .select({
      method: receipts.paymentMethod,
      amount: sumInt(sql`${receipts.amount}`),
      unassignedCash: sumInt(
        sql`CASE WHEN ${receipts.shiftId} IS NULL THEN ${receipts.amount} END`,
      ),
    })
    .from(receipts)
    .where(receiptScope)
    .groupBy(receipts.paymentMethod)

  const [returnAgg] = await db
    .select({
      count: sql<number>`count(*)::int`,
      total: sumInt(sql`${orderReturns.totalAmount}`),
      debtReduction: sumInt(sql`${orderReturns.debtReductionAmount}`),
      prepaymentRefund: sumInt(sql`${orderReturns.prepaymentRefundAmount}`),
    })
    .from(orderReturns)
    .where(returnScope)

  const refundRows = await db
    .select({
      method: orderReturns.refundMethod,
      amount: sumInt(sql`${orderReturns.refundAmount}`),
      unassignedCash: sumInt(
        sql`CASE WHEN ${orderReturns.shiftId} IS NULL THEN ${orderReturns.refundAmount} END`,
      ),
    })
    .from(orderReturns)
    .where(and(returnScope, sql`${orderReturns.refundAmount} > 0`))
    .groupBy(orderReturns.refundMethod)

  const supplierRows = await db
    .select({
      method: supplierPayments.paymentMethod,
      amount: sumInt(sql`${supplierPayments.amount}`),
      unassignedCash: sumInt(
        sql`CASE WHEN ${supplierPayments.shiftId} IS NULL THEN ${supplierPayments.amount} END`,
      ),
    })
    .from(supplierPayments)
    .where(supplierScope)
    .groupBy(supplierPayments.paymentMethod)

  // Bảng theo phương thức: ba phương thức luôn có dòng; dòng "chưa rõ" chỉ hiện khi có chứng từ cũ
  const rows = new Map<MoneyMethod | null, CashFlowMethodRow>()
  const rowFor = (method: MoneyMethod | null): CashFlowMethodRow => {
    let row = rows.get(method)
    if (!row) {
      row = { method, salesIn: 0, receiptsIn: 0, refundsOut: 0, supplierPaymentsOut: 0, net: 0 }
      rows.set(method, row)
    }
    return row
  }
  for (const method of MONEY_METHODS) rowFor(method)
  rowFor('cash').salesIn = Number(orderAgg?.cash ?? 0)
  rowFor('transfer').salesIn = Number(orderAgg?.transfer ?? 0)
  rowFor('qr').salesIn = Number(orderAgg?.qr ?? 0)
  for (const r of receiptRows) rowFor(toMoneyMethod(r.method)).receiptsIn += Number(r.amount)
  for (const r of refundRows) rowFor(toMoneyMethod(r.method)).refundsOut += Number(r.amount)
  for (const r of supplierRows) {
    rowFor(toMoneyMethod(r.method)).supplierPaymentsOut += Number(r.amount)
  }
  const methods = [...rows.values()]
  for (const row of methods) {
    row.net = row.salesIn + row.receiptsIn - row.refundsOut - row.supplierPaymentsOut
  }

  const cashRow = rowFor('cash')
  const cashIn = cashRow.salesIn + cashRow.receiptsIn
  const cashOut = cashRow.refundsOut + cashRow.supplierPaymentsOut

  const cashOnly = <T extends { method: string | null; unassignedCash: string }>(list: T[]) =>
    list.filter((r) => r.method === 'cash').reduce((acc, r) => acc + Number(r.unassignedCash), 0)

  const [openingAgg] = await db
    .select({ openingCash: sumInt(sql`${cashShifts.openingCash}`) })
    .from(cashShifts)
    .where(
      and(
        eq(cashShifts.storeId, storeId),
        gte(cashShifts.openedAt, start),
        lte(cashShifts.openedAt, end),
      ),
    )

  const gross = Number(lineAgg?.gross ?? 0)
  const lineDiscount = Number(lineAgg?.lineDiscount ?? 0)
  const orderDiscount = Number(orderAgg?.orderDiscount ?? 0)
  const returns = Number(returnAgg?.total ?? 0)

  return {
    from: query.from,
    to: query.to,
    revenue: {
      orderCount: orderAgg?.count ?? 0,
      gross,
      lineDiscount,
      orderDiscount,
      returnCount: returnAgg?.count ?? 0,
      returns,
      net: gross - lineDiscount - orderDiscount - returns,
    },
    methods,
    debt: {
      debtSales: Number(orderAgg?.debt ?? 0),
      returnDebtReduction: Number(returnAgg?.debtReduction ?? 0),
      returnPrepaymentRefund: Number(returnAgg?.prepaymentRefund ?? 0),
    },
    cash: {
      cashIn,
      cashOut,
      netCash: cashIn - cashOut,
      openingCash: Number(openingAgg?.openingCash ?? 0),
    },
    shifts: await listShiftsOpenedBetween(db, storeId, start, end),
    unassigned: {
      orderCount: orderAgg?.unassignedCount ?? 0,
      cashIn: Number(orderAgg?.unassignedCash ?? 0) + cashOnly(receiptRows),
      cashOut: cashOnly(refundRows) + cashOnly(supplierRows),
    },
  }
}

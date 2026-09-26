/**
 * BC-06: báo cáo dòng tiền theo phương thức và đối soát tiền mặt cuối ngày.
 *
 * - Tiền vào: tiền thực nhận trên đơn (lib/cash-flow.ts) và phiếu thu theo phương thức nhận.
 *   KHÔNG cộng `debts.paid` (bẫy TIEN-01): phần ghi nợ chỉ thành tiền khi có phiếu thu.
 * - Tiền ra: phần hoàn tiền của phiếu trả theo phương thức hoàn, phiếu chi nhà cung cấp, tiền trả
 *   lại khách khi hủy đơn (theo NGÀY HỦY, không rút ngược số của ngày bán).
 * - Tiền NCC hoàn: phiếu trả hàng nhập (ngày lập phiếu) và phiếu nhập bị hủy (ngày hủy) là tiền vào.
 * - Phiếu thu, phiếu chi đã hủy không tính (lib/cash-flow.ts).
 * - Doanh thu gộp và thuần: gộp = đơn giá × số lượng trước chiết khấu; thuần = gộp - chiết khấu
 *   dòng - chiết khấu đơn - giá trị hàng trả (số chụp lúc bán, ADR-0010).
 *
 * Kỳ báo cáo lọc đơn theo ngày bán, phiếu trả theo NGÀY LẬP PHIẾU (tiền hoàn ra quỹ hôm đó), khác
 * báo cáo doanh thu theo ngày đơn vốn trừ hàng trả vào ngày bán. Tiền bán của đơn đã hủy vẫn nằm ở
 * ngày bán, còn phần doanh thu thì loại đơn hủy cho khớp báo cáo doanh thu.
 */
import { and, eq, gte, lte, ne, type SQL, sql } from 'drizzle-orm'

import {
  type CashFlowMethodRow,
  type CashFlowReport,
  type CashFlowReportQuery,
  MONEY_METHODS,
  type MoneyMethod,
  orderItems,
  orderReturns,
  orders,
  purchaseOrders,
  purchaseReturns,
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
    // Theo giờ bán: đơn ngoại tuyến đồng bộ hôm sau vẫn thuộc ngày bán, cùng ngày với ca đã gắn
    gte(orders.soldAt, start),
    lte(orders.soldAt, end),
    cashFlowOrderFilter(),
  )
  // Doanh thu, chiết khấu, bán nợ: đơn đã hủy không còn là doanh thu (khớp báo cáo doanh thu)
  const revenueScope = and(orderScope, ne(orders.status, 'cancelled'))
  const cancelScope = and(
    eq(orders.storeId, storeId),
    eq(orders.status, 'cancelled'),
    gte(orders.cancelledAt, start),
    lte(orders.cancelledAt, end),
    sql`${orders.cancelRefundAmount} > 0`,
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
      gross: sumInt(sql`round(${orderItems.unitPrice} * ${orderItems.quantity})`),
      lineDiscount: sumInt(sql`${orderItems.discountAmount}`),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(revenueScope)

  const [revenueAgg] = await db
    .select({
      count: sql<number>`count(*)::int`,
      orderDiscount: sumInt(sql`${orders.discountAmount}`),
      debt: sumInt(orderDebtExpr()),
    })
    .from(orders)
    .where(revenueScope)

  const [orderAgg] = await db
    .select({
      cash: sumInt(orderCashInExpr()),
      transfer: sumInt(orderTransferInExpr()),
      qr: sumInt(orderQrInExpr()),
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

  // Tiền trả lại khách khi hủy đơn: tiền ra của ngày hủy theo kênh hoàn đã ghi trên đơn
  const cancelRefundRows = await db
    .select({
      method: orders.cancelRefundMethod,
      amount: sumInt(sql`${orders.cancelRefundAmount}`),
      unassignedCash: sumInt(
        sql`CASE WHEN ${orders.cancelShiftId} IS NULL THEN ${orders.cancelRefundAmount} END`,
      ),
    })
    .from(orders)
    .where(cancelScope)
    .groupBy(orders.cancelRefundMethod)

  // Tiền NCC hoàn: phiếu trả hàng nhập theo ngày lập, phiếu nhập bị hủy theo ngày hủy
  const purchaseReturnRefundRows = await db
    .select({
      method: purchaseReturns.refundMethod,
      amount: sumInt(sql`${purchaseReturns.supplierRefundAmount}`),
      unassignedCash: sumInt(
        sql`CASE WHEN ${purchaseReturns.shiftId} IS NULL THEN ${purchaseReturns.supplierRefundAmount} END`,
      ),
    })
    .from(purchaseReturns)
    .where(
      and(
        eq(purchaseReturns.storeId, storeId),
        gte(purchaseReturns.createdAt, start),
        lte(purchaseReturns.createdAt, end),
        sql`${purchaseReturns.supplierRefundAmount} > 0`,
      ),
    )
    .groupBy(purchaseReturns.refundMethod)

  const purchaseCancelRefundRows = await db
    .select({
      method: purchaseOrders.cancelRefundMethod,
      amount: sumInt(sql`${purchaseOrders.cancelSupplierRefund}`),
      unassignedCash: sumInt(
        sql`CASE WHEN ${purchaseOrders.cancelShiftId} IS NULL THEN ${purchaseOrders.cancelSupplierRefund} END`,
      ),
    })
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.storeId, storeId),
        eq(purchaseOrders.status, 'cancelled'),
        gte(purchaseOrders.cancelledAt, start),
        lte(purchaseOrders.cancelledAt, end),
        sql`${purchaseOrders.cancelSupplierRefund} > 0`,
      ),
    )
    .groupBy(purchaseOrders.cancelRefundMethod)
  const supplierRefundRows = [...purchaseReturnRefundRows, ...purchaseCancelRefundRows]

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
      row = {
        method,
        salesIn: 0,
        receiptsIn: 0,
        supplierRefundsIn: 0,
        refundsOut: 0,
        supplierPaymentsOut: 0,
        net: 0,
      }
      rows.set(method, row)
    }
    return row
  }
  for (const method of MONEY_METHODS) rowFor(method)
  rowFor('cash').salesIn = Number(orderAgg?.cash ?? 0)
  rowFor('transfer').salesIn = Number(orderAgg?.transfer ?? 0)
  rowFor('qr').salesIn = Number(orderAgg?.qr ?? 0)
  for (const r of receiptRows) rowFor(toMoneyMethod(r.method)).receiptsIn += Number(r.amount)
  for (const r of supplierRefundRows) {
    rowFor(toMoneyMethod(r.method)).supplierRefundsIn += Number(r.amount)
  }
  for (const r of [...refundRows, ...cancelRefundRows]) {
    rowFor(toMoneyMethod(r.method)).refundsOut += Number(r.amount)
  }
  for (const r of supplierRows) {
    rowFor(toMoneyMethod(r.method)).supplierPaymentsOut += Number(r.amount)
  }
  const methods = [...rows.values()]
  for (const row of methods) {
    row.net =
      row.salesIn +
      row.receiptsIn +
      row.supplierRefundsIn -
      row.refundsOut -
      row.supplierPaymentsOut
  }

  const cashRow = rowFor('cash')
  const cashIn = cashRow.salesIn + cashRow.receiptsIn + cashRow.supplierRefundsIn
  const cashOut = cashRow.refundsOut + cashRow.supplierPaymentsOut

  const cashOnly = <T extends { method: string | null; unassignedCash: string }>(list: T[]) =>
    list.filter((r) => r.method === 'cash').reduce((acc, r) => acc + Number(r.unassignedCash), 0)

  // Ca thuộc ngày mở ca (ca vắt qua 0h tính cho ngày mở). Đối soát theo từng ca rồi cộng chênh
  // lệch; tiền đầu ngày là quỹ đầu ca của ca sớm nhất, không cộng dồn quỹ đầu ca các ca nối tiếp
  const shifts = await listShiftsOpenedBetween(db, storeId, start, end)
  const closedShifts = shifts.filter((s) => s.status === 'closed')
  // listShiftsOpenedBetween xếp theo giờ mở: phần tử đầu là ca sớm nhất
  const earliestShift = shifts[0]

  const gross = Number(lineAgg?.gross ?? 0)
  const lineDiscount = Number(lineAgg?.lineDiscount ?? 0)
  const orderDiscount = Number(revenueAgg?.orderDiscount ?? 0)
  const returns = Number(returnAgg?.total ?? 0)

  return {
    from: query.from,
    to: query.to,
    revenue: {
      orderCount: revenueAgg?.count ?? 0,
      gross,
      lineDiscount,
      orderDiscount,
      returnCount: returnAgg?.count ?? 0,
      returns,
      net: gross - lineDiscount - orderDiscount - returns,
    },
    methods,
    debt: {
      debtSales: Number(revenueAgg?.debt ?? 0),
      returnDebtReduction: Number(returnAgg?.debtReduction ?? 0),
      returnPrepaymentRefund: Number(returnAgg?.prepaymentRefund ?? 0),
    },
    cash: {
      cashIn,
      cashOut,
      netCash: cashIn - cashOut,
      openingCash: earliestShift?.openingCash ?? 0,
      shiftDifference: closedShifts.reduce((sum, s) => sum + (s.difference ?? 0), 0),
      closedShiftCount: closedShifts.length,
      openShiftCount: shifts.length - closedShifts.length,
    },
    shifts,
    unassigned: {
      orderCount: orderAgg?.unassignedCount ?? 0,
      cashIn:
        Number(orderAgg?.unassignedCash ?? 0) +
        cashOnly(receiptRows) +
        cashOnly(supplierRefundRows),
      cashOut: cashOnly(refundRows) + cashOnly(cancelRefundRows) + cashOnly(supplierRows),
    },
  }
}

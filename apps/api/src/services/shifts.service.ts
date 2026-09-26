/**
 * POS-06: ca bán hàng.
 *
 * - Mỗi người bán có tối đa một ca mở (chỉ mục unique một phần `uniq_cash_shifts_open_user`).
 * - Đơn, phiếu thu, phiếu trả, phiếu chi lập khi người lập đang có ca mở thì ghi `shift_id`.
 * - Cửa hàng bật `shiftsEnabled` thì đơn POS trực tuyến bắt buộc có ca. Đơn ngoại tuyến đồng bộ
 *   gắn ca theo giờ bán và người bán; không khớp ca nào thì để trống, hiện ở đối soát.
 * - Đóng ca: tiền mặt phải có = đầu ca + thu tiền mặt - chi và hoàn tiền mặt (lib/cash-flow.ts),
 *   chênh lệch = thực đếm - phải có. Số liệu được chụp vào `close_summary`.
 */
import { and, desc, eq, gte, isNull, lte, or, type SQL, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import {
  cashShifts,
  type CloseShiftInput,
  type CurrentShiftResponse,
  hasPermission,
  type ListShiftsQuery,
  type OpenShiftChoice,
  type OpenShiftInput,
  orderReturns,
  orders,
  purchaseOrders,
  purchaseReturns,
  receipts,
  type Shift,
  type ShiftDetail,
  type ShiftSummary,
  shiftSummarySchema,
  stores,
  supplierPayments,
  type UserRole,
  users,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import {
  cashFlowOrderFilter,
  cashFlowReceiptFilter,
  cashFlowReturnFilter,
  cashFlowSupplierPaymentFilter,
  orderCancelRefundExpr,
  orderCashInExpr,
  orderDebtExpr,
  orderQrInExpr,
  orderTransferInExpr,
} from '../lib/cash-flow.js'
import { ApiError } from '../lib/errors.js'
import { isUniqueViolation } from '../lib/pg-errors.js'
import { parseDateRangeLocal } from '../lib/timezone.js'
import { logAction, type RequestMeta } from './audit.service.js'
import { serviceDb, type ServiceTransaction } from './service-transaction.js'

export interface ShiftsActor {
  userId: string
  storeId: string
  role: UserRole
}

const OPEN_SHIFT_CONSTRAINT = 'uniq_cash_shifts_open_user'

type ShiftRow = typeof cashShifts.$inferSelect

// ---------------------------------------------------------------------------
// Gắn ca cho chứng từ
// ---------------------------------------------------------------------------

/**
 * Ca đang mở của người lập chứng từ. Khóa FOR SHARE để lệnh đóng ca (FOR UPDATE) chờ chứng từ
 * đang ghi commit xong: số chụp lúc đóng ca không sót chứng từ nào.
 */
export async function lockOpenShiftId(
  db: Db,
  storeId: string,
  userId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: cashShifts.id })
    .from(cashShifts)
    .where(
      and(
        eq(cashShifts.storeId, storeId),
        eq(cashShifts.userId, userId),
        eq(cashShifts.status, 'open'),
      ),
    )
    .limit(1)
    .for('share')
  return row?.id ?? null
}

/** Kết quả chọn ca cho chứng từ: `choices` khác null nghĩa là có nhiều ca mở, chưa biết chọn ca nào. */
export interface DocumentShiftResolution {
  shiftId: string | null
  choices: OpenShiftChoice[] | null
  /**
   * TIEN-111: người lập chỉ được ghi vào ca của chính mình, chưa mở ca mà cửa hàng bật dùng ca.
   * `assertDocumentShift` chặn khi chứng từ có tiền mặt.
   */
  ownShiftRequired?: boolean
}

/**
 * Ca cho chứng từ có dòng tiền lập ngoài luồng bán (phiếu trả, phiếu thu, phiếu chi). Nhân viên
 * thường không có quyền lập các phiếu này, quản lý lập thay; gắn theo người lập thì tiền rơi khỏi
 * ca của thu ngân và ca đó báo thiếu, thừa sai. Thứ tự chọn:
 * 1. `requestedShiftId`: ca người lập chọn, phải thuộc cửa hàng và đang mở.
 * 2. Ca đang mở của chính người lập.
 * 3. Cửa hàng có đúng một ca đang mở: gắn vào ca đó.
 * 4. Nhiều ca đang mở: trả danh sách ca; `assertDocumentShift` quyết định có phải hỏi hay không.
 * Gọi ở đầu transaction, trước khi khóa đơn và khách (cùng thứ tự với lúc bán). Mọi ca đọc ra
 * đều khóa FOR SHARE như lockOpenShiftId, để lệnh đóng ca chờ chứng từ commit.
 */
export async function resolveDocumentShift(
  db: Db,
  opts: {
    storeId: string
    userId: string
    requestedShiftId?: string | null
    /**
     * TIEN-111: người không có quyền `shifts.manage` (nhân viên) chỉ ghi chứng từ vào ca của chính
     * mình: không chọn được ca người khác, không rơi vào ca duy nhất đang mở của người khác.
     */
    ownShiftOnly?: boolean
  },
): Promise<DocumentShiftResolution> {
  const { storeId, userId, requestedShiftId, ownShiftOnly } = opts
  if (ownShiftOnly) {
    const own = await lockOpenShiftId(db, storeId, userId)
    if (requestedShiftId && requestedShiftId !== own) {
      throw new ApiError('BUSINESS_RULE_VIOLATION', 'Chỉ được ghi chứng từ vào ca của chính bạn', {
        reason: 'shift_not_own',
      })
    }
    if (own) return { shiftId: own, choices: null }
    const [store] = await db
      .select({ shiftsEnabled: stores.shiftsEnabled })
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1)
    return { shiftId: null, choices: null, ownShiftRequired: store?.shiftsEnabled === true }
  }
  if (requestedShiftId) {
    const [row] = await db
      .select({ id: cashShifts.id })
      .from(cashShifts)
      .where(
        and(
          eq(cashShifts.id, requestedShiftId),
          eq(cashShifts.storeId, storeId),
          eq(cashShifts.status, 'open'),
        ),
      )
      .limit(1)
      .for('share')
    if (!row) {
      throw new ApiError(
        'BUSINESS_RULE_VIOLATION',
        'Ca bán hàng đã chọn không còn mở. Vui lòng chọn lại ca',
        { reason: 'shift_not_open' },
      )
    }
    return { shiftId: row.id, choices: null }
  }

  const own = await lockOpenShiftId(db, storeId, userId)
  if (own) return { shiftId: own, choices: null }

  const open = await db
    .select({
      id: cashShifts.id,
      userId: cashShifts.userId,
      userName: users.name,
      openedAt: cashShifts.openedAt,
    })
    .from(cashShifts)
    .leftJoin(users, eq(users.id, cashShifts.userId))
    .where(and(eq(cashShifts.storeId, storeId), eq(cashShifts.status, 'open')))
    .orderBy(cashShifts.openedAt)
    .for('share', { of: cashShifts })
  if (open.length <= 1) return { shiftId: open[0]?.id ?? null, choices: null }
  return {
    shiftId: null,
    choices: open.map((s) => ({
      id: s.id,
      userId: s.userId,
      userName: s.userName,
      openedAt: s.openedAt.toISOString(),
    })),
  }
}

/**
 * Ca cuối cùng của chứng từ. Nhiều ca đang mở mà chứng từ có khoản tiền mặt (vào hay ra ngăn
 * kéo) thì bắt người lập chọn ca; khoản không phải tiền mặt không ảnh hưởng ngăn kéo nên để trống.
 */
export function assertDocumentShift(
  resolution: DocumentShiftResolution,
  hasCash: boolean,
): string | null {
  if (resolution.ownShiftRequired && hasCash) {
    throw new ApiError(
      'BUSINESS_RULE_VIOLATION',
      'Chưa mở ca bán hàng. Vui lòng mở ca trước khi thu, chi tiền mặt',
      { reason: 'shift_required' },
    )
  }
  if (!resolution.choices || !hasCash) return resolution.shiftId
  throw new ApiError(
    'BUSINESS_RULE_VIOLATION',
    'Có nhiều ca đang mở. Vui lòng chọn ca nhận khoản tiền mặt này',
    { reason: 'shift_choice_required', shifts: resolution.choices },
  )
}

/**
 * Ca cho đơn POS trực tuyến: bật dùng ca mà người bán chưa mở ca thì chặn bán. Máy khách đọc
 * `details.reason = 'shift_required'` để mở hộp mở ca.
 */
export async function requireShiftForSale(
  db: Db,
  storeId: string,
  userId: string,
): Promise<string | null> {
  const shiftId = await lockOpenShiftId(db, storeId, userId)
  if (shiftId) return shiftId
  const [store] = await db
    .select({ shiftsEnabled: stores.shiftsEnabled })
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1)
  if (store?.shiftsEnabled) {
    throw new ApiError(
      'BUSINESS_RULE_VIOLATION',
      'Chưa mở ca bán hàng. Vui lòng mở ca trước khi bán',
      { reason: 'shift_required' },
    )
  }
  return null
}

/**
 * Ca cho đơn ngoại tuyến đồng bộ: ca của người bán có giờ bán nằm trong khoảng mở, đóng ca.
 * Không khớp thì null (không chặn đồng bộ); đơn hiện trong mục chưa gắn ca của đối soát.
 */
export async function resolveShiftAt(
  db: Db,
  storeId: string,
  userId: string,
  soldAt: Date,
): Promise<string | null> {
  const [row] = await db
    .select({ id: cashShifts.id })
    .from(cashShifts)
    .where(
      and(
        eq(cashShifts.storeId, storeId),
        eq(cashShifts.userId, userId),
        lte(cashShifts.openedAt, soldAt),
        or(isNull(cashShifts.closedAt), gte(cashShifts.closedAt, soldAt)),
      ),
    )
    .orderBy(desc(cashShifts.openedAt))
    .limit(1)
    .for('share')
  return row?.id ?? null
}

// ---------------------------------------------------------------------------
// Số liệu ca
// ---------------------------------------------------------------------------

const sumInt = (expr: SQL) => sql<string>`coalesce(sum(${expr}), 0)::bigint`

export async function computeShiftSummary(db: Db, shift: ShiftRow): Promise<ShiftSummary> {
  const [orderAgg] = await db
    .select({
      count: sql<number>`count(*)::int`,
      cash: sumInt(orderCashInExpr()),
      transfer: sumInt(orderTransferInExpr()),
      qr: sumInt(orderQrInExpr()),
      debt: sumInt(orderDebtExpr()),
    })
    .from(orders)
    .where(and(eq(orders.shiftId, shift.id), cashFlowOrderFilter()))

  const [receiptAgg] = await db
    .select({
      count: sql<number>`count(*)::int`,
      cash: sumInt(sql`CASE WHEN ${receipts.paymentMethod} = 'cash' THEN ${receipts.amount} END`),
      transfer: sumInt(
        sql`CASE WHEN ${receipts.paymentMethod} = 'transfer' THEN ${receipts.amount} END`,
      ),
      qr: sumInt(sql`CASE WHEN ${receipts.paymentMethod} = 'qr' THEN ${receipts.amount} END`),
    })
    .from(receipts)
    .where(and(eq(receipts.shiftId, shift.id), cashFlowReceiptFilter()))

  const [returnAgg] = await db
    .select({
      count: sql<number>`count(*)::int`,
      cash: sumInt(
        sql`CASE WHEN ${orderReturns.refundMethod} = 'cash' THEN ${orderReturns.refundAmount} END`,
      ),
      bank: sumInt(
        sql`CASE WHEN ${orderReturns.refundMethod} IN ('transfer', 'qr') THEN ${orderReturns.refundAmount} END`,
      ),
    })
    .from(orderReturns)
    .where(and(eq(orderReturns.shiftId, shift.id), cashFlowReturnFilter()))

  const [supplierAgg] = await db
    .select({
      count: sql<number>`count(*)::int`,
      cash: sumInt(
        sql`CASE WHEN ${supplierPayments.paymentMethod} = 'cash' THEN ${supplierPayments.amount} END`,
      ),
      bank: sumInt(
        sql`CASE WHEN ${supplierPayments.paymentMethod} IN ('transfer', 'qr') THEN ${supplierPayments.amount} END`,
      ),
    })
    .from(supplierPayments)
    .where(and(eq(supplierPayments.shiftId, shift.id), cashFlowSupplierPaymentFilter()))

  // Hủy đơn chi trả lại khách trong ca này (ca hủy, có thể khác ca bán): tiền bán của đơn vẫn
  // thuộc ca bán, không rút ngược số của ca đã đóng (BC-06)
  const [cancelAgg] = await db
    .select({
      cash: sumInt(orderCancelRefundExpr('cash')),
      bank: sumInt(sql`${orderCancelRefundExpr('transfer')} + ${orderCancelRefundExpr('qr')}`),
    })
    .from(orders)
    .where(eq(orders.cancelShiftId, shift.id))

  // Tiền NCC hoàn nhận trong ca: phiếu trả hàng nhập và phiếu nhập bị hủy
  const [purchaseReturnAgg] = await db
    .select({
      cash: sumInt(
        sql`CASE WHEN ${purchaseReturns.refundMethod} = 'cash' THEN ${purchaseReturns.supplierRefundAmount} END`,
      ),
      bank: sumInt(
        sql`CASE WHEN ${purchaseReturns.refundMethod} IN ('transfer', 'qr') THEN ${purchaseReturns.supplierRefundAmount} END`,
      ),
    })
    .from(purchaseReturns)
    .where(eq(purchaseReturns.shiftId, shift.id))

  const [purchaseCancelAgg] = await db
    .select({
      cash: sumInt(
        sql`CASE WHEN ${purchaseOrders.cancelRefundMethod} = 'cash' THEN ${purchaseOrders.cancelSupplierRefund} END`,
      ),
      bank: sumInt(
        sql`CASE WHEN ${purchaseOrders.cancelRefundMethod} IN ('transfer', 'qr') THEN ${purchaseOrders.cancelSupplierRefund} END`,
      ),
    })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.cancelShiftId, shift.id), eq(purchaseOrders.status, 'cancelled')))

  const cashSales = Number(orderAgg?.cash ?? 0)
  const cashReceipts = Number(receiptAgg?.cash ?? 0)
  const cashRefunds = Number(returnAgg?.cash ?? 0) + Number(cancelAgg?.cash ?? 0)
  const cashSupplierRefunds =
    Number(purchaseReturnAgg?.cash ?? 0) + Number(purchaseCancelAgg?.cash ?? 0)
  const cashSupplierPayments = Number(supplierAgg?.cash ?? 0)
  const openingCash = Number(shift.openingCash)

  return {
    openingCash,
    cashSales,
    cashReceipts,
    cashRefunds,
    cashSupplierPayments,
    cashSupplierRefunds,
    expectedCash:
      openingCash +
      cashSales +
      cashReceipts +
      cashSupplierRefunds -
      cashRefunds -
      cashSupplierPayments,
    // Tiền NCC hoàn qua ngân hàng gộp vào chuyển khoản vào (NCC không trả qua mã QR của cửa hàng)
    transferIn:
      Number(orderAgg?.transfer ?? 0) +
      Number(receiptAgg?.transfer ?? 0) +
      Number(purchaseReturnAgg?.bank ?? 0) +
      Number(purchaseCancelAgg?.bank ?? 0),
    qrIn: Number(orderAgg?.qr ?? 0) + Number(receiptAgg?.qr ?? 0),
    transferOut:
      Number(returnAgg?.bank ?? 0) + Number(supplierAgg?.bank ?? 0) + Number(cancelAgg?.bank ?? 0),
    debtSales: Number(orderAgg?.debt ?? 0),
    orderCount: orderAgg?.count ?? 0,
    receiptCount: receiptAgg?.count ?? 0,
    returnCount: returnAgg?.count ?? 0,
    supplierPaymentCount: supplierAgg?.count ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Đọc ca
// ---------------------------------------------------------------------------

const closers = alias(users, 'shift_closers')

const shiftSelectColumns = {
  shift: cashShifts,
  userName: users.name,
  closedByName: closers.name,
}

type ShiftSelectRow = { shift: ShiftRow; userName: string | null; closedByName: string | null }

function toShift({ shift, userName, closedByName }: ShiftSelectRow): Shift {
  return {
    id: shift.id,
    userId: shift.userId,
    userName,
    status: shift.status === 'closed' ? 'closed' : 'open',
    openingCash: Number(shift.openingCash),
    openNote: shift.openNote,
    openedAt: shift.openedAt.toISOString(),
    closedAt: shift.closedAt?.toISOString() ?? null,
    closedBy: shift.closedBy,
    closedByName,
    expectedCash: shift.expectedCash === null ? null : Number(shift.expectedCash),
    countedCash: shift.countedCash === null ? null : Number(shift.countedCash),
    difference: shift.difference === null ? null : Number(shift.difference),
    closeNote: shift.closeNote,
  }
}

function selectShifts(db: Db) {
  return db
    .select(shiftSelectColumns)
    .from(cashShifts)
    .leftJoin(users, eq(cashShifts.userId, users.id))
    .leftJoin(closers, eq(cashShifts.closedBy, closers.id))
}

async function toShiftDetail(db: Db, row: ShiftSelectRow): Promise<ShiftDetail> {
  return {
    ...toShift(row),
    summary: await computeShiftSummary(db, row.shift),
    // Bản chụp đóng ca cũ thiếu trường mới: parse để điền mặc định (cashSupplierRefunds = 0)
    closeSummary: row.shift.closeSummary ? shiftSummarySchema.parse(row.shift.closeSummary) : null,
  }
}

/** Người không có 'shifts.manage' chỉ thấy và đóng ca của chính mình. */
function canManageShifts(actor: ShiftsActor): boolean {
  return hasPermission(actor.role, 'shifts.manage')
}

async function loadShiftForActor(db: Db, actor: ShiftsActor, shiftId: string) {
  const [row] = await selectShifts(db)
    .where(and(eq(cashShifts.id, shiftId), eq(cashShifts.storeId, actor.storeId)))
    .limit(1)
  if (!row || (!canManageShifts(actor) && row.shift.userId !== actor.userId)) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy ca bán hàng')
  }
  return row
}

export async function getCurrentShift({
  db,
  actor,
}: {
  db: Db
  actor: ShiftsActor
}): Promise<CurrentShiftResponse> {
  const [store] = await db
    .select({ shiftsEnabled: stores.shiftsEnabled })
    .from(stores)
    .where(eq(stores.id, actor.storeId))
    .limit(1)
  const [row] = await selectShifts(db)
    .where(
      and(
        eq(cashShifts.storeId, actor.storeId),
        eq(cashShifts.userId, actor.userId),
        eq(cashShifts.status, 'open'),
      ),
    )
    .limit(1)
  return {
    shiftsEnabled: store?.shiftsEnabled ?? false,
    shift: row ? await toShiftDetail(db, row) : null,
  }
}

export async function getShift({
  db,
  actor,
  shiftId,
}: {
  db: Db
  actor: ShiftsActor
  shiftId: string
}): Promise<ShiftDetail> {
  const row = await loadShiftForActor(db, actor, shiftId)
  return toShiftDetail(db, row)
}

export interface ShiftsListResult {
  items: Shift[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export async function listShifts({
  db,
  actor,
  query,
}: {
  db: Db
  actor: ShiftsActor
  query: ListShiftsQuery
}): Promise<ShiftsListResult> {
  const { page, pageSize, from, to, status } = query
  const conditions: SQL[] = [eq(cashShifts.storeId, actor.storeId)]
  const userId = canManageShifts(actor) ? query.userId : actor.userId
  if (userId) conditions.push(eq(cashShifts.userId, userId))
  if (status) conditions.push(eq(cashShifts.status, status))
  if (from || to) {
    const range = parseDateRangeLocal(from, to)
    if (from) conditions.push(gte(cashShifts.openedAt, range.start))
    if (to) conditions.push(lte(cashShifts.openedAt, range.end))
  }
  const where = and(...conditions)

  const rows = await selectShifts(db)
    .where(where)
    .orderBy(desc(cashShifts.openedAt), desc(cashShifts.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cashShifts)
    .where(where)
  const total = countRow?.count ?? 0

  return {
    items: rows.map(toShift),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

// ---------------------------------------------------------------------------
// Mở, đóng ca
// ---------------------------------------------------------------------------

export interface OpenShiftDeps {
  db: Db
  transaction?: ServiceTransaction
  actor: ShiftsActor
  input: OpenShiftInput
  meta?: RequestMeta
}

export async function openShift({
  db: rootDb,
  transaction,
  actor,
  input,
  meta,
}: OpenShiftDeps): Promise<ShiftDetail> {
  const db = serviceDb(rootDb, transaction)
  try {
    const shiftId = await db.transaction(async (tx) => {
      const txDb = tx as unknown as Db
      const [created] = await txDb
        .insert(cashShifts)
        .values({
          storeId: actor.storeId,
          userId: actor.userId,
          openingCash: input.openingCash,
          openNote: input.note ?? null,
        })
        .returning({ id: cashShifts.id })
      if (!created) throw new ApiError('INTERNAL_ERROR', 'Không mở được ca bán hàng')

      await logAction({
        db: txDb,
        storeId: actor.storeId,
        actorId: actor.userId,
        action: 'shift.opened',
        targetType: 'cash_shift',
        targetId: created.id,
        changes: { openingCash: input.openingCash },
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      })
      return created.id
    })
    const row = await loadShiftForActor(db, actor, shiftId)
    return toShiftDetail(db, row)
  } catch (err) {
    if (isUniqueViolation(err, OPEN_SHIFT_CONSTRAINT)) {
      throw new ApiError('CONFLICT', 'Bạn đang có một ca chưa đóng. Vui lòng đóng ca đó trước', {
        reason: 'shift_already_open',
      })
    }
    throw err
  }
}

export interface CloseShiftDeps {
  db: Db
  transaction?: ServiceTransaction
  actor: ShiftsActor
  shiftId: string
  input: CloseShiftInput
  meta?: RequestMeta
}

export async function closeShift({
  db: rootDb,
  transaction,
  actor,
  shiftId,
  input,
  meta,
}: CloseShiftDeps): Promise<ShiftDetail> {
  const db = serviceDb(rootDb, transaction)
  await db.transaction(async (tx) => {
    const txDb = tx as unknown as Db
    // Khóa dòng ca: chứng từ đang ghi (giữ FOR SHARE) commit xong mới tính số, ca đóng rồi thì
    // chứng từ mới không gắn vào nữa.
    const [shift] = await txDb
      .select()
      .from(cashShifts)
      .where(and(eq(cashShifts.id, shiftId), eq(cashShifts.storeId, actor.storeId)))
      .limit(1)
      .for('update')
    if (!shift || (!canManageShifts(actor) && shift.userId !== actor.userId)) {
      throw new ApiError('NOT_FOUND', 'Không tìm thấy ca bán hàng')
    }
    if (shift.status !== 'open') {
      throw new ApiError('BUSINESS_RULE_VIOLATION', 'Ca này đã đóng', {
        reason: 'shift_closed',
      })
    }

    const summary = await computeShiftSummary(txDb, shift)
    const difference = input.countedCash - summary.expectedCash
    await txDb
      .update(cashShifts)
      .set({
        status: 'closed',
        closedAt: new Date(),
        closedBy: actor.userId,
        expectedCash: summary.expectedCash,
        countedCash: input.countedCash,
        difference,
        closeNote: input.note ?? null,
        closeSummary: summary,
      })
      .where(eq(cashShifts.id, shift.id))

    await logAction({
      db: txDb,
      storeId: actor.storeId,
      actorId: actor.userId,
      action: 'shift.closed',
      targetType: 'cash_shift',
      targetId: shift.id,
      changes: {
        expectedCash: summary.expectedCash,
        countedCash: input.countedCash,
        difference,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })
  })
  const row = await loadShiftForActor(db, actor, shiftId)
  return toShiftDetail(db, row)
}

/** Ca mở trong khoảng thời gian, cho đối soát cuối ngày của báo cáo dòng tiền (BC-06). */
export async function listShiftsOpenedBetween(
  db: Db,
  storeId: string,
  start: Date,
  end: Date,
): Promise<Shift[]> {
  const rows = await selectShifts(db)
    .where(
      and(
        eq(cashShifts.storeId, storeId),
        gte(cashShifts.openedAt, start),
        lte(cashShifts.openedAt, end),
      ),
    )
    .orderBy(cashShifts.openedAt, cashShifts.id)
  return rows.map(toShift)
}

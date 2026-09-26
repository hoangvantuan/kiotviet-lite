import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  type SQL,
  sql,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import {
  type CancelDocumentInput,
  type CreateReceiptInput,
  customers,
  debts,
  type DocumentStatus,
  formatCurrencyVnd as formatVnd,
  type ListReceiptsQuery,
  type OpenDebtItem,
  orders,
  type ReceiptAllocationItem,
  receiptAllocations,
  type ReceiptDetail,
  type ReceiptListItem,
  receipts,
  type UserRole,
  users,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { toMoneyMethod } from '../lib/cash-flow.js'
import { ApiError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'
import { escapeLikePattern } from '../lib/strings.js'
import { parseDateRangeBoundary } from '../lib/timezone.js'
import { logAction, type RequestMeta } from './audit.service.js'
import {
  lockCustomerForDebt,
  reverseCustomerPayments,
  settleCustomerDebts,
} from './customer-debt-ledger.service.js'
import {
  alreadyCancelledError,
  type PreauthorizedCancel,
  resolveCancelApprover,
} from './document-cancel.helper.js'
import { nextDocumentCode } from './document-codes.service.js'
import { serviceDb, type ServiceTransaction } from './service-transaction.js'
import { assertDocumentShift, resolveDocumentShift } from './shifts.service.js'

export interface ReceiptsActor {
  userId: string
  storeId: string
  role: UserRole
}

export { formatVnd }

interface ReceiptRow {
  id: string
  code: string
  paymentMethod: string | null
  customerId: string
  customerName: string | null
  customerCode: string | null
  customerPhone: string | null
  amount: number
  note: string | null
  allocationCount: number
  status: string
  cancelledAt: Date | null
  cancelledBy: string | null
  cancelledByName: string | null
  cancelReason: string | null
  createdBy: string
  createdByName: string | null
  createdAt: Date
}

export function toReceiptListItem(row: ReceiptRow): ReceiptListItem {
  return {
    id: row.id,
    code: row.code,
    paymentMethod: toMoneyMethod(row.paymentMethod),
    customerId: row.customerId,
    customerName: row.customerName,
    customerCode: row.customerCode,
    customerPhone: row.customerPhone,
    amount: Number(row.amount),
    note: row.note,
    allocationCount: Number(row.allocationCount),
    status: row.status as DocumentStatus,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    cancelledBy: row.cancelledBy,
    cancelledByName: row.cancelledByName,
    cancelReason: row.cancelReason,
    createdBy: row.createdBy,
    createdByName: row.createdByName,
    createdAt: row.createdAt.toISOString(),
  }
}

export function toOpenDebtItem(row: {
  id: string
  orderId: string | null
  orderCode: string | null
  type: OpenDebtItem['type']
  amount: number
  paid: number
  remaining: number
  createdAt: Date
}): OpenDebtItem {
  return {
    id: row.id,
    orderId: row.orderId,
    orderCode: row.orderCode,
    type: row.type,
    amount: Number(row.amount),
    paid: Number(row.paid),
    remaining: Number(row.remaining),
    createdAt: row.createdAt.toISOString(),
  }
}

const allocationCountSubquery = sql<number>`(
  SELECT COUNT(*)::int
  FROM ${receiptAllocations}
  WHERE ${receiptAllocations.receiptId} = ${receipts.id}
)`

const cancellers = alias(users, 'receipt_cancellers')

const receiptSelectColumns = {
  id: receipts.id,
  code: receipts.code,
  paymentMethod: receipts.paymentMethod,
  customerId: receipts.customerId,
  customerName: customers.name,
  customerCode: customers.code,
  customerPhone: customers.phone,
  amount: receipts.amount,
  note: receipts.note,
  allocationCount: allocationCountSubquery,
  status: receipts.status,
  cancelledAt: receipts.cancelledAt,
  cancelledBy: receipts.cancelledBy,
  cancelledByName: cancellers.name,
  cancelReason: receipts.cancelReason,
  createdBy: receipts.createdBy,
  createdByName: users.name,
  createdAt: receipts.createdAt,
}

export interface ReceiptsListResult {
  items: ReceiptListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface ListReceiptsDeps {
  db: Db
  storeId: string
  query: ListReceiptsQuery
}

export async function listReceipts({
  db,
  storeId,
  query,
}: ListReceiptsDeps): Promise<ReceiptsListResult> {
  const { page, pageSize, customerId, fromDate, toDate, search } = query
  const conditions: SQL[] = [eq(receipts.storeId, storeId)]

  if (customerId) {
    conditions.push(eq(receipts.customerId, customerId))
  }
  // R7: ngày YYYY-MM-DD hiểu theo lịch cửa hàng, không theo UTC
  const from = parseDateRangeBoundary(fromDate, 'start')
  const to = parseDateRangeBoundary(toDate, 'end')
  if (from) conditions.push(gte(receipts.createdAt, from))
  if (to) conditions.push(lte(receipts.createdAt, to))

  const trimmedSearch = search?.trim()
  if (trimmedSearch) {
    const escaped = escapeLikePattern(trimmedSearch)
    const pattern = `%${escaped}%`
    const searchClause = or(
      ilike(receipts.code, pattern),
      ilike(customers.name, pattern),
      ilike(customers.phone, pattern),
      ilike(receipts.note, pattern),
    )
    if (searchClause) conditions.push(searchClause)
  }

  const whereClause = and(...conditions)
  const offset = (page - 1) * pageSize

  const rows = await db
    .select(receiptSelectColumns)
    .from(receipts)
    .leftJoin(customers, eq(receipts.customerId, customers.id))
    .leftJoin(users, eq(receipts.createdBy, users.id))
    .leftJoin(cancellers, eq(receipts.cancelledBy, cancellers.id))
    .where(whereClause)
    .orderBy(desc(receipts.createdAt), desc(receipts.id))
    .limit(pageSize)
    .offset(offset)

  const totalRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(receipts)
    .leftJoin(customers, eq(receipts.customerId, customers.id))
    .where(whereClause)

  const total = totalRows[0]?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return {
    items: rows.map(toReceiptListItem),
    total,
    page,
    pageSize,
    totalPages,
  }
}

export interface GetReceiptDeps {
  db: Db
  storeId: string
  targetId: string
}

async function loadReceiptAllocations(
  db: Db,
  receiptId: string,
  debtAfterMap?: Map<string, number>,
): Promise<ReceiptAllocationItem[]> {
  const rows = await db
    .select({
      id: receiptAllocations.id,
      debtId: receiptAllocations.debtId,
      orderId: debts.orderId,
      orderCode: orders.orderNumber,
      type: debts.type,
      amount: receiptAllocations.amount,
      debtCreatedAt: debts.createdAt,
    })
    .from(receiptAllocations)
    .innerJoin(debts, eq(receiptAllocations.debtId, debts.id))
    .leftJoin(orders, eq(debts.orderId, orders.id))
    .where(eq(receiptAllocations.receiptId, receiptId))
    .orderBy(asc(debts.createdAt), asc(debts.id))

  return rows.map((row) => ({
    id: row.id,
    debtId: row.debtId,
    orderId: row.orderId,
    orderCode: row.orderCode,
    type: row.type,
    amount: Number(row.amount),
    debtRemainingAfter: debtAfterMap?.get(row.debtId) ?? null,
  }))
}

export async function getReceipt({
  db,
  storeId,
  targetId,
}: GetReceiptDeps): Promise<ReceiptDetail> {
  const rows = await db
    .select(receiptSelectColumns)
    .from(receipts)
    .leftJoin(customers, eq(receipts.customerId, customers.id))
    .leftJoin(users, eq(receipts.createdBy, users.id))
    .leftJoin(cancellers, eq(receipts.cancelledBy, cancellers.id))
    .where(and(eq(receipts.id, targetId), eq(receipts.storeId, storeId)))
    .limit(1)

  const row = rows[0]
  if (!row) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy phiếu thu')
  }

  const allocations = await loadReceiptAllocations(db, targetId)

  return {
    ...toReceiptListItem(row),
    debtAfter: null,
    allocations,
  }
}

export interface ListCustomerOpenDebtsDeps {
  db: Db
  storeId: string
  customerId: string
}

export interface CustomerOpenDebtsResult {
  customerId: string
  customerName: string
  customerPhone: string | null
  totalRemaining: number
  items: OpenDebtItem[]
}

export async function listCustomerOpenDebts({
  db,
  storeId,
  customerId,
}: ListCustomerOpenDebtsDeps): Promise<CustomerOpenDebtsResult> {
  const customerRows = await db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      currentDebt: customers.currentDebt,
    })
    .from(customers)
    .where(
      and(
        eq(customers.id, customerId),
        eq(customers.storeId, storeId),
        isNull(customers.deletedAt),
      ),
    )
    .limit(1)

  const customer = customerRows[0]
  if (!customer) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy khách hàng')
  }

  const debtRows = await db
    .select({
      id: debts.id,
      orderId: debts.orderId,
      orderCode: orders.orderNumber,
      type: debts.type,
      amount: debts.amount,
      paid: debts.paid,
      remaining: debts.remaining,
      createdAt: debts.createdAt,
    })
    .from(debts)
    .leftJoin(orders, eq(debts.orderId, orders.id))
    .where(
      and(eq(debts.storeId, storeId), eq(debts.customerId, customerId), gt(debts.remaining, 0)),
    )
    .orderBy(asc(debts.createdAt), asc(debts.id))

  return {
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    totalRemaining: Number(customer.currentDebt),
    items: debtRows.map(toOpenDebtItem),
  }
}

export interface CreateReceiptDeps {
  db: Db
  // Transaction của request có Idempotency-Key: chứng từ và phản hồi lưu cùng một lần commit
  transaction?: ServiceTransaction
  actor: ReceiptsActor
  input: CreateReceiptInput
  meta?: RequestMeta
}

export async function createReceipt({
  db: rootDb,
  transaction,
  actor,
  input,
  meta,
}: CreateReceiptDeps): Promise<ReceiptDetail> {
  const db = serviceDb(rootDb, transaction)
  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Db

    // POS-06: gắn vào ca của quầy nhận tiền (resolveDocumentShift). Khóa ca trước khách, cùng thứ
    // tự đơn hàng
    const shiftId = assertDocumentShift(
      await resolveDocumentShift(txDb, {
        storeId: actor.storeId,
        userId: actor.userId,
        requestedShiftId: input.shiftId,
      }),
      input.paymentMethod === 'cash',
    )

    // 1. Lock customer FIRST
    const customerRows = await tx
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.id, input.customerId),
          eq(customers.storeId, actor.storeId),
          isNull(customers.deletedAt),
        ),
      )
      .for('update')
      .limit(1)
    const customer = customerRows[0]
    if (!customer) {
      throw new ApiError('NOT_FOUND', 'Không tìm thấy khách hàng')
    }

    // 2. Validate amount <= currentDebt
    const debtBefore = Number(customer.currentDebt)
    if (debtBefore <= 0) {
      throw new ApiError('BUSINESS_RULE_VIOLATION', 'Khách hàng không còn nợ')
    }
    if (input.amount > debtBefore) {
      throw new ApiError(
        'BUSINESS_RULE_VIOLATION',
        `Số tiền thu (${formatVnd(input.amount)}) vượt quá tổng nợ còn lại (${formatVnd(
          debtBefore,
        )})`,
      )
    }

    // 3. Lock TẤT CẢ debts (sort id ASC để consistent lock order)
    const debtIds = [...input.allocations.map((a) => a.debtId)].sort()
    const lockedDebts = await tx
      .select()
      .from(debts)
      .where(
        and(
          inArray(debts.id, debtIds),
          eq(debts.storeId, actor.storeId),
          eq(debts.customerId, input.customerId),
        ),
      )
      .for('update')

    // 4. Cross-check
    if (lockedDebts.length !== debtIds.length) {
      throw new ApiError(
        'BUSINESS_RULE_VIOLATION',
        'Một hoặc nhiều khoản nợ không hợp lệ (không tồn tại, đã tất toán, hoặc thuộc khách hàng khác)',
      )
    }
    const debtMap = new Map(lockedDebts.map((d) => [d.id, d]))
    for (const a of input.allocations) {
      const d = debtMap.get(a.debtId)
      if (!d) {
        throw new ApiError('BUSINESS_RULE_VIOLATION', 'Một hoặc nhiều khoản nợ không hợp lệ')
      }
      const remaining = Number(d.remaining)
      if (remaining <= 0) {
        throw new ApiError(
          'BUSINESS_RULE_VIOLATION',
          'Một khoản nợ đã được tất toán, vui lòng tải lại danh sách',
        )
      }
      if (a.amount > remaining) {
        throw new ApiError(
          'BUSINESS_RULE_VIOLATION',
          `Số tiền phân bổ (${formatVnd(a.amount)}) vượt quá nợ còn lại (${formatVnd(remaining)}) của khoản nợ`,
        )
      }
    }

    const noteNormalized = input.note?.trim() || null

    // TIEN-109: mã phiếu thu cấp từ bộ đếm theo cửa hàng (R4), không trùng khi lập song song
    const code = await nextDocumentCode({ db: txDb, storeId: actor.storeId, kind: 'receipt' })

    // 5. Insert receipt
    const [receiptRow] = await tx
      .insert(receipts)
      .values({
        storeId: actor.storeId,
        code,
        customerId: input.customerId,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        shiftId,
        note: noteNormalized,
        createdBy: actor.userId,
      })
      .returning({ id: receipts.id, createdAt: receipts.createdAt })

    if (!receiptRow) {
      throw new ApiError('INTERNAL_ERROR', 'Không tạo được phiếu thu')
    }

    // 6. Insert allocations batch
    await tx.insert(receiptAllocations).values(
      input.allocations.map((a) => ({
        receiptId: receiptRow.id,
        debtId: a.debtId,
        amount: a.amount,
      })),
    )

    // 7. Ghi bút toán thu qua sổ công nợ: trừ từng khoản nợ và công nợ khách cùng lúc
    await settleCustomerDebts(txDb, {
      storeId: actor.storeId,
      customerId: input.customerId,
      kind: 'payment',
      allocations: input.allocations,
    })
    const debtAfterMap = new Map<string, number>()
    for (const a of input.allocations) {
      const before = debtMap.get(a.debtId)!
      debtAfterMap.set(a.debtId, Number(before.remaining) - a.amount)
    }
    const debtAfter = debtBefore - input.amount

    // 9. Audit log
    await logAction({
      db: txDb,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'receipt.created',
      targetType: 'receipt',
      targetId: receiptRow.id,
      changes: {
        code,
        customerId: input.customerId,
        customerName: customer.name,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        note: noteNormalized,
        allocationMode: input.allocationMode,
        allocationCount: input.allocations.length,
        debtBefore,
        debtAfter,
        allocations: input.allocations.map((a) => ({
          debtId: a.debtId,
          amount: a.amount,
        })),
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    // 10. Logger info
    logger.info(
      {
        storeId: actor.storeId,
        actorId: actor.userId,
        receiptId: receiptRow.id,
        customerId: input.customerId,
        amount: input.amount,
        debtBefore,
        debtAfter,
        allocationMode: input.allocationMode,
        allocationCount: input.allocations.length,
      },
      'receipt.created',
    )

    // 11. Build & return ReceiptDetail
    const actorRows = await tx
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, actor.userId))
      .limit(1)

    const allocations = await loadReceiptAllocations(txDb, receiptRow.id, debtAfterMap)

    return {
      id: receiptRow.id,
      code,
      paymentMethod: input.paymentMethod,
      customerId: customer.id,
      customerName: customer.name,
      customerCode: customer.code,
      customerPhone: customer.phone,
      amount: input.amount,
      note: noteNormalized,
      allocationCount: input.allocations.length,
      status: 'active',
      cancelledAt: null,
      cancelledBy: null,
      cancelledByName: null,
      cancelReason: null,
      createdBy: actor.userId,
      createdByName: actorRows[0]?.name ?? null,
      createdAt: receiptRow.createdAt.toISOString(),
      debtAfter,
      allocations,
    }
  })
}

export interface CancelReceiptDeps {
  db: Db
  transaction?: ServiceTransaction
  actor: ReceiptsActor
  receiptId: string
  input: CancelDocumentInput
  /** Route đã kiểm quyền và PIN ngoài transaction (`cancelDocumentRoute`) */
  preauthorized?: PreauthorizedCancel
  meta?: RequestMeta
}

/**
 * TIEN-107: hủy phiếu thu. Phiếu không bị xóa, đổi sang 'cancelled' kèm người hủy, lúc hủy, lý do.
 * Số đã thu trả lại đúng các khoản nợ phiếu đã phân bổ (bút toán đảo trong sổ công nợ), dòng
 * phân bổ giữ làm vết. Thứ tự khóa: phiếu thu, khách, các khoản nợ theo id (ADR-0008).
 * Phiếu đã hủy thì 409, không đảo lần hai.
 */
export async function cancelReceipt({
  db: rootDb,
  transaction,
  actor,
  receiptId,
  input,
  preauthorized,
  meta,
}: CancelReceiptDeps): Promise<ReceiptDetail> {
  const db = serviceDb(rootDb, transaction)
  const approver = await resolveCancelApprover({ db, actor, input, meta, preauthorized })
  await db.transaction(async (tx) => {
    const txDb = tx as unknown as Db
    const [receipt] = await tx
      .select()
      .from(receipts)
      .where(and(eq(receipts.id, receiptId), eq(receipts.storeId, actor.storeId)))
      .for('update')
      .limit(1)
    if (!receipt) {
      throw new ApiError('NOT_FOUND', 'Không tìm thấy phiếu thu')
    }
    if (receipt.status === 'cancelled') {
      throw alreadyCancelledError('Phiếu thu')
    }

    const customer = await lockCustomerForDebt(txDb, {
      storeId: actor.storeId,
      customerId: receipt.customerId,
    })
    const allocationRows = await tx
      .select({ debtId: receiptAllocations.debtId, amount: receiptAllocations.amount })
      .from(receiptAllocations)
      .where(eq(receiptAllocations.receiptId, receipt.id))
    const allocations = allocationRows.map((a) => ({ debtId: a.debtId, amount: Number(a.amount) }))

    await reverseCustomerPayments(txDb, {
      storeId: actor.storeId,
      customerId: receipt.customerId,
      allocations,
    })

    const reason = input.reason.trim()
    await tx
      .update(receipts)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: actor.userId,
        cancelReason: reason,
      })
      .where(eq(receipts.id, receipt.id))

    const debtBefore = customer.currentDebt
    const debtAfter = debtBefore + Number(receipt.amount)
    await logAction({
      db: txDb,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'receipt.cancelled',
      targetType: 'receipt',
      targetId: receipt.id,
      changes: {
        customerId: receipt.customerId,
        amount: Number(receipt.amount),
        reason,
        debtBefore,
        debtAfter,
        allocations,
        approvedBy: approver?.userId ?? null,
        approvedByName: approver?.name ?? null,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })
    logger.info(
      { storeId: actor.storeId, actorId: actor.userId, receiptId: receipt.id, debtAfter },
      'receipt.cancelled',
    )
  })
  return getReceipt({ db, storeId: actor.storeId, targetId: receiptId })
}

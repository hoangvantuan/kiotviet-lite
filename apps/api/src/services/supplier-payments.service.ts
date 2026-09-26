import { and, desc, eq, gte, ilike, isNull, lte, or, type SQL, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import {
  type CancelDocumentInput,
  type CreateSupplierPaymentInput,
  type DocumentStatus,
  formatCurrencyVnd as formatVnd,
  type ListSupplierPaymentsQuery,
  purchaseOrders,
  type SupplierPaymentDetail,
  type SupplierPaymentListItem,
  supplierPayments,
  suppliers,
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
  alreadyCancelledError,
  type PreauthorizedCancel,
  resolveCancelApprover,
} from './document-cancel.helper.js'
import {
  loadPurchaseOrderPayables,
  refreshPurchaseOrderPaymentStatus,
} from './purchase-orders.service.js'
import { serviceDb, type ServiceTransaction } from './service-transaction.js'
import { assertDocumentShift, resolveDocumentShift } from './shifts.service.js'

export interface SupplierPaymentsActor {
  userId: string
  storeId: string
  role: UserRole
}

interface SupplierPaymentRow {
  id: string
  supplierId: string
  supplierName: string | null
  supplierPhone: string | null
  amount: number
  paymentMethod: string | null
  note: string | null
  purchaseOrderId: string | null
  purchaseOrderCode: string | null
  status: string
  cancelledAt: Date | null
  cancelledBy: string | null
  cancelledByName: string | null
  cancelReason: string | null
  createdBy: string
  createdByName: string | null
  createdAt: Date
}

export function toSupplierPaymentListItem(row: SupplierPaymentRow): SupplierPaymentListItem {
  return {
    id: row.id,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    supplierPhone: row.supplierPhone,
    amount: Number(row.amount),
    paymentMethod: toMoneyMethod(row.paymentMethod),
    note: row.note,
    purchaseOrderId: row.purchaseOrderId,
    purchaseOrderCode: row.purchaseOrderCode,
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

export function toSupplierPaymentDetail(
  row: SupplierPaymentRow,
  debtAfter: number | null = null,
): SupplierPaymentDetail {
  return {
    ...toSupplierPaymentListItem(row),
    debtAfter,
  }
}

export { formatVnd }

const cancellers = alias(users, 'supplier_payment_cancellers')

const supplierPaymentSelectColumns = {
  id: supplierPayments.id,
  supplierId: supplierPayments.supplierId,
  supplierName: suppliers.name,
  supplierPhone: suppliers.phone,
  amount: supplierPayments.amount,
  note: supplierPayments.note,
  purchaseOrderId: supplierPayments.purchaseOrderId,
  purchaseOrderCode: purchaseOrders.code,
  status: supplierPayments.status,
  cancelledAt: supplierPayments.cancelledAt,
  cancelledBy: supplierPayments.cancelledBy,
  cancelledByName: cancellers.name,
  cancelReason: supplierPayments.cancelReason,
  createdBy: supplierPayments.createdBy,
  createdByName: users.name,
  createdAt: supplierPayments.createdAt,
  paymentMethod: supplierPayments.paymentMethod,
}

export interface SupplierPaymentListResult {
  items: SupplierPaymentListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface ListSupplierPaymentsDeps {
  db: Db
  storeId: string
  query: ListSupplierPaymentsQuery
}

export async function listSupplierPayments({
  db,
  storeId,
  query,
}: ListSupplierPaymentsDeps): Promise<SupplierPaymentListResult> {
  const { page, pageSize, supplierId, fromDate, toDate, search } = query
  const conditions: SQL[] = [eq(supplierPayments.storeId, storeId)]

  if (supplierId) {
    conditions.push(eq(supplierPayments.supplierId, supplierId))
  }
  // R7: ngày YYYY-MM-DD hiểu theo lịch cửa hàng, không theo UTC
  const from = parseDateRangeBoundary(fromDate, 'start')
  const to = parseDateRangeBoundary(toDate, 'end')
  if (from) conditions.push(gte(supplierPayments.createdAt, from))
  if (to) conditions.push(lte(supplierPayments.createdAt, to))

  const trimmedSearch = search?.trim()
  if (trimmedSearch) {
    const escaped = escapeLikePattern(trimmedSearch)
    const pattern = `%${escaped}%`
    const searchClause = or(ilike(suppliers.name, pattern), ilike(supplierPayments.note, pattern))
    if (searchClause) conditions.push(searchClause)
  }

  const whereClause = and(...conditions)
  const offset = (page - 1) * pageSize

  const rows = await db
    .select(supplierPaymentSelectColumns)
    .from(supplierPayments)
    .leftJoin(suppliers, eq(supplierPayments.supplierId, suppliers.id))
    .leftJoin(users, eq(supplierPayments.createdBy, users.id))
    .leftJoin(purchaseOrders, eq(supplierPayments.purchaseOrderId, purchaseOrders.id))
    .leftJoin(cancellers, eq(supplierPayments.cancelledBy, cancellers.id))
    .where(whereClause)
    .orderBy(desc(supplierPayments.createdAt), desc(supplierPayments.id))
    .limit(pageSize)
    .offset(offset)

  const totalRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(supplierPayments)
    .leftJoin(suppliers, eq(supplierPayments.supplierId, suppliers.id))
    .where(whereClause)

  const total = totalRows[0]?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return {
    items: rows.map(toSupplierPaymentListItem),
    total,
    page,
    pageSize,
    totalPages,
  }
}

export interface GetSupplierPaymentDeps {
  db: Db
  storeId: string
  targetId: string
}

export async function getSupplierPayment({
  db,
  storeId,
  targetId,
}: GetSupplierPaymentDeps): Promise<SupplierPaymentDetail> {
  const rows = await db
    .select(supplierPaymentSelectColumns)
    .from(supplierPayments)
    .leftJoin(suppliers, eq(supplierPayments.supplierId, suppliers.id))
    .leftJoin(users, eq(supplierPayments.createdBy, users.id))
    .leftJoin(purchaseOrders, eq(supplierPayments.purchaseOrderId, purchaseOrders.id))
    .leftJoin(cancellers, eq(supplierPayments.cancelledBy, cancellers.id))
    .where(and(eq(supplierPayments.id, targetId), eq(supplierPayments.storeId, storeId)))
    .limit(1)

  const row = rows[0]
  if (!row) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy phiếu chi')
  }
  return toSupplierPaymentDetail(row, null)
}

export interface CreateSupplierPaymentDeps {
  db: Db
  // Transaction của request có Idempotency-Key: chứng từ và phản hồi lưu cùng một lần commit
  transaction?: ServiceTransaction
  actor: SupplierPaymentsActor
  input: CreateSupplierPaymentInput
  meta?: RequestMeta
}

export async function createSupplierPayment({
  db: rootDb,
  transaction,
  actor,
  input,
  meta,
}: CreateSupplierPaymentDeps): Promise<SupplierPaymentDetail> {
  const db = serviceDb(rootDb, transaction)
  // Layer 3: defense in depth — service tự re-check role (middleware + route đã chặn trước)
  if (actor.role !== 'owner') {
    throw new ApiError('FORBIDDEN', 'Chỉ chủ cửa hàng mới được tạo phiếu chi')
  }

  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Db

    // POS-06: phiếu chi vào ca của quầy chi tiền (resolveDocumentShift), khóa ca trước nhà cung cấp
    const shiftId = assertDocumentShift(
      await resolveDocumentShift(txDb, {
        storeId: actor.storeId,
        userId: actor.userId,
        requestedShiftId: input.shiftId,
      }),
      input.paymentMethod === 'cash',
    )

    // TIEN-104: phiếu chi gắn phiếu nhập. Khóa phiếu nhập trước NCC (thứ tự khóa chứng từ, NCC,
    // sản phẩm như hủy phiếu nhập), phiếu phải còn hiệu lực, cùng NCC, và chi không vượt số còn
    // phải trả của phiếu.
    const purchaseOrderId = input.purchaseOrderId ?? null
    let purchaseOrderCode: string | null = null
    let purchaseOrderOutstanding: number | null = null
    if (purchaseOrderId) {
      const payables = await loadPurchaseOrderPayables(txDb, {
        storeId: actor.storeId,
        purchaseOrderId,
        forUpdate: true,
      })
      if (payables.supplierId !== input.supplierId) {
        throw new ApiError('VALIDATION_ERROR', 'Phiếu nhập không thuộc nhà cung cấp này')
      }
      if (payables.status !== 'active') {
        throw new ApiError('BUSINESS_RULE_VIOLATION', 'Phiếu nhập đã hủy, không chi tiền được')
      }
      purchaseOrderCode = payables.code
      purchaseOrderOutstanding = payables.outstanding
    }

    const supplierRows = await tx
      .select()
      .from(suppliers)
      .where(
        and(
          eq(suppliers.id, input.supplierId),
          eq(suppliers.storeId, actor.storeId),
          isNull(suppliers.deletedAt),
        ),
      )
      .for('update')
      .limit(1)
    const supplier = supplierRows[0]
    if (!supplier) {
      throw new ApiError('NOT_FOUND', 'Không tìm thấy nhà cung cấp')
    }

    const debtBefore = Number(supplier.currentDebt)

    if (debtBefore <= 0) {
      throw new ApiError('BUSINESS_RULE_VIOLATION', 'Nhà cung cấp này không còn nợ phải trả')
    }

    if (input.amount > debtBefore) {
      throw new ApiError(
        'BUSINESS_RULE_VIOLATION',
        `Số tiền chi (${formatVnd(input.amount)}) vượt quá nợ phải trả NCC hiện tại (${formatVnd(
          debtBefore,
        )})`,
      )
    }

    if (purchaseOrderOutstanding !== null && input.amount > purchaseOrderOutstanding) {
      throw new ApiError(
        'BUSINESS_RULE_VIOLATION',
        `Số tiền chi (${formatVnd(input.amount)}) vượt quá số còn phải trả của phiếu ${purchaseOrderCode} (${formatVnd(
          Math.max(0, purchaseOrderOutstanding),
        )})`,
      )
    }

    const noteNormalized = input.note?.trim() || null

    const [paymentRow] = await tx
      .insert(supplierPayments)
      .values({
        storeId: actor.storeId,
        supplierId: input.supplierId,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        shiftId,
        note: noteNormalized,
        purchaseOrderId,
        createdBy: actor.userId,
      })
      .returning({ id: supplierPayments.id, createdAt: supplierPayments.createdAt })

    if (!paymentRow) {
      throw new ApiError('INTERNAL_ERROR', 'Không tạo được phiếu chi')
    }

    const debtAfterValue = debtBefore - input.amount
    await tx
      .update(suppliers)
      .set({
        currentDebt: sql`${suppliers.currentDebt} - ${input.amount}`,
      })
      .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.storeId, actor.storeId)))
    if (purchaseOrderId) {
      await refreshPurchaseOrderPaymentStatus(txDb, purchaseOrderId)
    }

    const actorRows = await tx
      .select({ name: users.name })
      .from(users)
      .where(and(eq(users.id, actor.userId), eq(users.storeId, actor.storeId)))
      .limit(1)

    await logAction({
      db: txDb,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'supplier_payment.created',
      targetType: 'supplier_payment',
      targetId: paymentRow.id,
      changes: {
        supplierId: input.supplierId,
        supplierName: supplier.name,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        note: noteNormalized,
        purchaseOrderId,
        purchaseOrderCode,
        debtBefore,
        debtAfter: debtAfterValue,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    logger.info(
      {
        storeId: actor.storeId,
        actorId: actor.userId,
        supplierId: input.supplierId,
        amount: input.amount,
        debtBefore,
        debtAfter: debtAfterValue,
        paymentId: paymentRow.id,
      },
      'supplier_payment.created',
    )

    return toSupplierPaymentDetail(
      {
        id: paymentRow.id,
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplierPhone: supplier.phone,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        note: noteNormalized,
        purchaseOrderId,
        purchaseOrderCode,
        status: 'active',
        cancelledAt: null,
        cancelledBy: null,
        cancelledByName: null,
        cancelReason: null,
        createdBy: actor.userId,
        createdByName: actorRows[0]?.name ?? null,
        createdAt: paymentRow.createdAt,
      },
      debtAfterValue,
    )
  })
}

export interface CancelSupplierPaymentDeps {
  db: Db
  transaction?: ServiceTransaction
  actor: SupplierPaymentsActor
  paymentId: string
  input: CancelDocumentInput
  /** Route đã kiểm quyền và PIN ngoài transaction (`cancelDocumentRoute`) */
  preauthorized?: PreauthorizedCancel
  meta?: RequestMeta
}

/**
 * TIEN-107: hủy phiếu chi NCC. Chủ và quản lý (`documents.cancel`) như các chứng từ khác. Phiếu không bị xóa,
 * đổi sang 'cancelled'; số đã chi cộng lại vào công nợ NCC, phiếu nhập được gắn (nếu có) tính lại
 * trạng thái thanh toán. Thứ tự khóa: phiếu chi, phiếu nhập, NCC. Hủy lần hai thì 409.
 */
export async function cancelSupplierPayment({
  db: rootDb,
  transaction,
  actor,
  paymentId,
  input,
  preauthorized,
  meta,
}: CancelSupplierPaymentDeps): Promise<SupplierPaymentDetail> {
  const db = serviceDb(rootDb, transaction)
  const approver = await resolveCancelApprover({ db, actor, input, meta, preauthorized })
  await db.transaction(async (tx) => {
    const txDb = tx as unknown as Db
    const [payment] = await tx
      .select()
      .from(supplierPayments)
      .where(and(eq(supplierPayments.id, paymentId), eq(supplierPayments.storeId, actor.storeId)))
      .for('update')
      .limit(1)
    if (!payment) {
      throw new ApiError('NOT_FOUND', 'Không tìm thấy phiếu chi')
    }
    if (payment.status === 'cancelled') {
      throw alreadyCancelledError('Phiếu chi')
    }
    if (payment.purchaseOrderId) {
      const po = await loadPurchaseOrderPayables(txDb, {
        storeId: actor.storeId,
        purchaseOrderId: payment.purchaseOrderId,
        forUpdate: true,
      })
      // Trả hàng nhập sau phiếu chi này đã ghi "NCC phải hoàn" dựa trên số đã trả. Hủy phiếu chi lúc
      // này làm nợ NCC tăng đủ số chi trong khi khoản hoàn vẫn treo: lệch đúng bằng khoản hoàn. Như
      // phía bán chặn hủy đơn đã có trả hàng, ở đây chặn hủy phiếu chi của phiếu nhập đã phát sinh hoàn.
      if (po.returnRefundAmount > 0) {
        throw new ApiError(
          'BUSINESS_RULE_VIOLATION',
          `Phiếu nhập ${po.code} đã trả hàng và phát sinh tiền NCC phải hoàn, nên không hủy được phiếu chi gắn phiếu này`,
          { reason: 'purchase_order_has_supplier_refund', purchaseOrderId: po.id },
        )
      }
    }
    const [supplier] = await tx
      .select({ id: suppliers.id, currentDebt: suppliers.currentDebt })
      .from(suppliers)
      .where(and(eq(suppliers.id, payment.supplierId), eq(suppliers.storeId, actor.storeId)))
      .for('update')
      .limit(1)
    if (!supplier) {
      throw new ApiError('NOT_FOUND', 'Không tìm thấy nhà cung cấp')
    }

    const amount = Number(payment.amount)
    const debtBefore = Number(supplier.currentDebt)
    const debtAfter = debtBefore + amount
    await tx
      .update(suppliers)
      .set({ currentDebt: sql`${suppliers.currentDebt} + ${amount}` })
      .where(eq(suppliers.id, supplier.id))

    const reason = input.reason.trim()
    await tx
      .update(supplierPayments)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: actor.userId,
        cancelReason: reason,
      })
      .where(eq(supplierPayments.id, payment.id))
    if (payment.purchaseOrderId) {
      await refreshPurchaseOrderPaymentStatus(txDb, payment.purchaseOrderId)
    }

    await logAction({
      db: txDb,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'supplier_payment.cancelled',
      targetType: 'supplier_payment',
      targetId: payment.id,
      changes: {
        supplierId: payment.supplierId,
        amount,
        reason,
        purchaseOrderId: payment.purchaseOrderId,
        debtBefore,
        debtAfter,
        approvedBy: approver?.userId ?? null,
        approvedByName: approver?.name ?? null,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })
    logger.info(
      { storeId: actor.storeId, paymentId: payment.id, debtAfter },
      'supplier_payment.cancelled',
    )
  })
  return getSupplierPayment({ db, storeId: actor.storeId, targetId: paymentId })
}

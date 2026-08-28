import { and, desc, eq, gte, ilike, isNull, lte, or, type SQL, sql } from 'drizzle-orm'

import {
  type CreateSupplierPaymentInput,
  type ListSupplierPaymentsQuery,
  type SupplierPaymentDetail,
  type SupplierPaymentListItem,
  supplierPayments,
  suppliers,
  type UserRole,
  users,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'
import { escapeLikePattern } from '../lib/strings.js'
import { logAction, type RequestMeta } from './audit.service.js'

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
  note: string | null
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
    note: row.note,
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

export function formatVnd(amount: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(amount)}đ`
}

const supplierPaymentSelectColumns = {
  id: supplierPayments.id,
  supplierId: supplierPayments.supplierId,
  supplierName: suppliers.name,
  supplierPhone: suppliers.phone,
  amount: supplierPayments.amount,
  note: supplierPayments.note,
  createdBy: supplierPayments.createdBy,
  createdByName: users.name,
  createdAt: supplierPayments.createdAt,
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
  if (fromDate) {
    conditions.push(gte(supplierPayments.createdAt, new Date(fromDate)))
  }
  if (toDate) {
    const d = new Date(toDate)
    if (
      d.getUTCHours() === 0 &&
      d.getUTCMinutes() === 0 &&
      d.getUTCSeconds() === 0 &&
      d.getUTCMilliseconds() === 0
    ) {
      d.setUTCHours(23, 59, 59, 999)
    }
    conditions.push(lte(supplierPayments.createdAt, d))
  }

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
  actor: SupplierPaymentsActor
  input: CreateSupplierPaymentInput
  meta?: RequestMeta
}

export async function createSupplierPayment({
  db,
  actor,
  input,
  meta,
}: CreateSupplierPaymentDeps): Promise<SupplierPaymentDetail> {
  // Layer 3: defense in depth — service tự re-check role (middleware + route đã chặn trước)
  if (actor.role !== 'owner') {
    throw new ApiError('FORBIDDEN', 'Chỉ chủ cửa hàng mới được tạo phiếu chi')
  }

  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Db

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

    const noteNormalized = input.note?.trim() || null

    const [paymentRow] = await tx
      .insert(supplierPayments)
      .values({
        storeId: actor.storeId,
        supplierId: input.supplierId,
        amount: input.amount,
        note: noteNormalized,
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
        note: noteNormalized,
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
        supplierName: supplier.name,
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
        note: noteNormalized,
        createdBy: actor.userId,
        createdByName: actorRows[0]?.name ?? null,
        createdAt: paymentRow.createdAt,
      },
      debtAfterValue,
    )
  })
}

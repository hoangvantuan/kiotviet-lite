import { and, asc, desc, eq, gt, isNull, sql } from 'drizzle-orm'

import {
  type CreateDebtAdjustmentInput,
  customers,
  type DebtAdjustmentDetail,
  type DebtAdjustmentListItem,
  debtAdjustments,
  debts,
  type ListDebtAdjustmentsQuery,
  type UserRole,
  users,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'
import { logAction, type RequestMeta } from './audit.service.js'

export interface DebtAdjustmentsActor {
  userId: string
  storeId: string
  role: UserRole
}

export function formatVnd(amount: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(amount)}đ`
}

interface DebtAdjustmentRow {
  id: string
  customerId: string
  oldAmount: number
  newAmount: number
  reason: string
  adjustedBy: string
  adjustedByName: string | null
  createdAt: Date
}

export function toDebtAdjustmentListItem(row: DebtAdjustmentRow): DebtAdjustmentListItem {
  return {
    id: row.id,
    customerId: row.customerId,
    oldAmount: Number(row.oldAmount),
    newAmount: Number(row.newAmount),
    reason: row.reason,
    adjustedBy: row.adjustedBy,
    adjustedByName: row.adjustedByName,
    createdAt: row.createdAt.toISOString(),
  }
}

export function toDebtAdjustmentDetail(
  row: DebtAdjustmentRow & { customerName: string | null },
): DebtAdjustmentDetail {
  return {
    ...toDebtAdjustmentListItem(row),
    customerName: row.customerName,
  }
}

const debtAdjustmentSelectColumns = {
  id: debtAdjustments.id,
  customerId: debtAdjustments.customerId,
  oldAmount: debtAdjustments.oldAmount,
  newAmount: debtAdjustments.newAmount,
  reason: debtAdjustments.reason,
  adjustedBy: debtAdjustments.adjustedBy,
  adjustedByName: users.name,
  createdAt: debtAdjustments.createdAt,
}

export interface DebtAdjustmentListResult {
  items: DebtAdjustmentListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface ListDebtAdjustmentsDeps {
  db: Db
  storeId: string
  query: ListDebtAdjustmentsQuery
}

export async function listDebtAdjustments({
  db,
  storeId,
  query,
}: ListDebtAdjustmentsDeps): Promise<DebtAdjustmentListResult> {
  const { page, pageSize, customerId } = query
  const whereClause = and(
    eq(debtAdjustments.storeId, storeId),
    eq(debtAdjustments.customerId, customerId),
  )
  const offset = (page - 1) * pageSize

  const rows = await db
    .select(debtAdjustmentSelectColumns)
    .from(debtAdjustments)
    .leftJoin(users, eq(debtAdjustments.adjustedBy, users.id))
    .where(whereClause)
    .orderBy(desc(debtAdjustments.createdAt), desc(debtAdjustments.id))
    .limit(pageSize)
    .offset(offset)

  const totalRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(debtAdjustments)
    .where(whereClause)

  const total = totalRows[0]?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return {
    items: rows.map(toDebtAdjustmentListItem),
    total,
    page,
    pageSize,
    totalPages,
  }
}

export interface CreateDebtAdjustmentDeps {
  db: Db
  actor: DebtAdjustmentsActor
  input: CreateDebtAdjustmentInput
  meta?: RequestMeta
}

export async function createDebtAdjustment({
  db,
  actor,
  input,
  meta,
}: CreateDebtAdjustmentDeps): Promise<DebtAdjustmentDetail> {
  // Defense in depth: re-check role tại service layer
  if (actor.role !== 'owner') {
    throw new ApiError('FORBIDDEN', 'Chỉ chủ cửa hàng mới được điều chỉnh nợ')
  }

  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Db

    // 1. SELECT customer với lock FOR UPDATE
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

    // 2. Lấy oldAmount snapshot
    const oldAmount = Number(customer.currentDebt)

    // 3. Validate newAmount !== oldAmount và không âm
    if (input.newAmount < 0) {
      throw new ApiError('VALIDATION_ERROR', 'Số nợ mới không được âm')
    }
    if (input.newAmount === oldAmount) {
      throw new ApiError(
        'BUSINESS_RULE_VIOLATION',
        `Số nợ mới phải khác số nợ hiện tại (${formatVnd(oldAmount)})`,
      )
    }

    // 4. Insert adjustment
    const [adjustmentRow] = await tx
      .insert(debtAdjustments)
      .values({
        storeId: actor.storeId,
        customerId: input.customerId,
        oldAmount,
        newAmount: input.newAmount,
        reason: input.reason,
        adjustedBy: actor.userId,
      })
      .returning({ id: debtAdjustments.id, createdAt: debtAdjustments.createdAt })

    if (!adjustmentRow) {
      throw new ApiError('INTERNAL_ERROR', 'Không tạo được điều chỉnh nợ')
    }

    // 5. Update customer.currentDebt = newAmount
    await tx
      .update(customers)
      .set({ currentDebt: input.newAmount })
      .where(eq(customers.id, input.customerId))

    // H7: đồng bộ debts.remaining khi điều chỉnh nợ
    // Khi giảm nợ (newAmount < oldAmount): settle các khoản nợ cũ nhất (FIFO)
    // Khi tăng nợ (newAmount > oldAmount): không cần sửa debts vì nợ mới chưa phát sinh
    if (input.newAmount < oldAmount) {
      const reduction = oldAmount - input.newAmount

      if (input.newAmount === 0) {
        // Xoá toàn bộ nợ: set remaining=0, paid=amount cho tất cả khoản nợ còn lại
        await tx
          .update(debts)
          .set({
            remaining: 0,
            paid: debts.amount,
          })
          .where(
            and(
              eq(debts.storeId, actor.storeId),
              eq(debts.customerId, input.customerId),
              gt(debts.remaining, 0),
            ),
          )
      } else {
        // Giảm nợ một phần: phân bổ theo FIFO (nợ cũ nhất tất toán trước)
        const openDebts = await tx
          .select({
            id: debts.id,
            remaining: debts.remaining,
          })
          .from(debts)
          .where(
            and(
              eq(debts.storeId, actor.storeId),
              eq(debts.customerId, input.customerId),
              gt(debts.remaining, 0),
            ),
          )
          .orderBy(asc(debts.createdAt))
          .for('update')

        let leftToSettle = reduction
        for (const d of openDebts) {
          if (leftToSettle <= 0) break
          const rem = Number(d.remaining)
          const settleAmount = Math.min(leftToSettle, rem)
          await tx
            .update(debts)
            .set({
              remaining: sql`GREATEST(0, ${debts.remaining} - ${settleAmount})`,
              paid: sql`${debts.paid} + ${settleAmount}`,
            })
            .where(eq(debts.id, d.id))
          leftToSettle -= settleAmount
        }
      }
    }

    // 6. Audit log trong cùng transaction
    await logAction({
      db: txDb,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'debt_adjustment.created',
      targetType: 'debt_adjustment',
      targetId: adjustmentRow.id,
      changes: {
        customerId: input.customerId,
        customerName: customer.name,
        oldAmount,
        newAmount: input.newAmount,
        reason: input.reason,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    // 7. Logger info
    logger.info(
      {
        storeId: actor.storeId,
        actorId: actor.userId,
        customerId: input.customerId,
        customerName: customer.name,
        oldAmount,
        newAmount: input.newAmount,
        adjustmentId: adjustmentRow.id,
      },
      'debt_adjustment.created',
    )

    // 8. Lấy tên actor
    const actorRows = await tx
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, actor.userId))
      .limit(1)

    return toDebtAdjustmentDetail({
      id: adjustmentRow.id,
      customerId: customer.id,
      customerName: customer.name,
      oldAmount,
      newAmount: input.newAmount,
      reason: input.reason,
      adjustedBy: actor.userId,
      adjustedByName: actorRows[0]?.name ?? null,
      createdAt: adjustmentRow.createdAt,
    })
  })
}

import { and, desc, eq, isNull, sql } from 'drizzle-orm'

import {
  applyDebtAdjustment,
  type CreateOpeningDebtInput,
  type CreateSupplierDebtAdjustmentInput,
  type DebtAdjustmentDirection,
  formatCurrencyVnd,
  type ListSupplierDebtAdjustmentsQuery,
  type SupplierDebtAdjustmentDetail,
  type SupplierDebtAdjustmentListItem,
  supplierDebtAdjustments,
  suppliers,
  type UserRole,
  users,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'
import { parseDateRangeBoundary } from '../lib/timezone.js'
import { logAction, type RequestMeta } from './audit.service.js'

export interface SupplierDebtActor {
  userId: string
  storeId: string
  role: UserRole
}

interface AdjustmentRow {
  id: string
  supplierId: string
  oldAmount: number
  newAmount: number
  reason: string
  type: 'adjustment' | 'opening'
  incurredAt: Date | null
  adjustedBy: string
  adjustedByName: string | null
  createdAt: Date
}

function toListItem(row: AdjustmentRow): SupplierDebtAdjustmentListItem {
  return {
    id: row.id,
    supplierId: row.supplierId,
    oldAmount: Number(row.oldAmount),
    newAmount: Number(row.newAmount),
    reason: row.reason,
    type: row.type,
    incurredAt: row.incurredAt?.toISOString() ?? null,
    adjustedBy: row.adjustedBy,
    adjustedByName: row.adjustedByName,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function listSupplierDebtAdjustments({
  db,
  storeId,
  query,
}: {
  db: Db
  storeId: string
  query: ListSupplierDebtAdjustmentsQuery
}) {
  const where = and(
    eq(supplierDebtAdjustments.storeId, storeId),
    eq(supplierDebtAdjustments.supplierId, query.supplierId),
  )
  const rows = await db
    .select({
      id: supplierDebtAdjustments.id,
      supplierId: supplierDebtAdjustments.supplierId,
      oldAmount: supplierDebtAdjustments.oldAmount,
      newAmount: supplierDebtAdjustments.newAmount,
      reason: supplierDebtAdjustments.reason,
      type: supplierDebtAdjustments.type,
      incurredAt: supplierDebtAdjustments.incurredAt,
      adjustedBy: supplierDebtAdjustments.adjustedBy,
      adjustedByName: users.name,
      createdAt: supplierDebtAdjustments.createdAt,
    })
    .from(supplierDebtAdjustments)
    .leftJoin(users, eq(supplierDebtAdjustments.adjustedBy, users.id))
    .where(where)
    .orderBy(desc(supplierDebtAdjustments.createdAt), desc(supplierDebtAdjustments.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize)
  const [count] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(supplierDebtAdjustments)
    .where(where)
  const total = count?.count ?? 0
  return {
    items: rows.map(toListItem),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  }
}

export async function createSupplierDebtAdjustment({
  db,
  actor,
  input,
  meta,
}: {
  db: Db
  actor: SupplierDebtActor
  input: CreateSupplierDebtAdjustmentInput
  meta?: RequestMeta
}): Promise<SupplierDebtAdjustmentDetail> {
  return saveAdjustment({
    db,
    actor,
    supplierId: input.supplierId,
    change: {
      direction: input.direction,
      amount: input.amount,
      expectedCurrentDebt: input.expectedCurrentDebt,
    },
    reason: input.reason,
    type: 'adjustment',
    meta,
  })
}

export async function createSupplierOpeningDebt({
  db,
  actor,
  supplierId,
  input,
  meta,
}: {
  db: Db
  actor: SupplierDebtActor
  supplierId: string
  input: CreateOpeningDebtInput
  meta?: RequestMeta
}): Promise<SupplierDebtAdjustmentDetail> {
  const incurredAt = parseDateRangeBoundary(input.incurredAt, 'start')!
  if (incurredAt > new Date()) {
    throw new ApiError('VALIDATION_ERROR', 'Ngày phát sinh không được ở tương lai')
  }
  return saveAdjustment({
    db,
    actor,
    supplierId,
    change: { direction: 'increase', amount: input.amount, expectedCurrentDebt: 0 },
    reason: `Nợ đầu kỳ (phát sinh ngày ${input.incurredAt})`,
    type: 'opening',
    incurredAt,
    openingDate: input.incurredAt,
    meta,
  })
}

async function saveAdjustment({
  db,
  actor,
  supplierId,
  change,
  reason,
  type,
  incurredAt = null,
  openingDate,
  meta,
}: {
  db: Db
  actor: SupplierDebtActor
  supplierId: string
  // TIEN-102: bút toán tăng/giảm kèm số nợ máy khách thấy, không ghi đè số tuyệt đối
  change: { direction: DebtAdjustmentDirection; amount: number; expectedCurrentDebt: number }
  reason: string
  type: 'adjustment' | 'opening'
  incurredAt?: Date | null
  openingDate?: string
  meta?: RequestMeta
}): Promise<SupplierDebtAdjustmentDetail> {
  if (actor.role !== 'owner') {
    throw new ApiError('FORBIDDEN', 'Chỉ chủ cửa hàng mới được điều chỉnh công nợ nhà cung cấp')
  }
  if (!Number.isInteger(change.amount) || change.amount <= 0) {
    throw new ApiError('VALIDATION_ERROR', 'Số tiền điều chỉnh phải lớn hơn 0')
  }
  return db.transaction(async (tx) => {
    const [supplier] = await tx
      .select({ id: suppliers.id, name: suppliers.name, currentDebt: suppliers.currentDebt })
      .from(suppliers)
      .where(
        and(
          eq(suppliers.id, supplierId),
          eq(suppliers.storeId, actor.storeId),
          isNull(suppliers.deletedAt),
        ),
      )
      .for('update')
      .limit(1)
    if (!supplier) throw new ApiError('NOT_FOUND', 'Không tìm thấy nhà cung cấp')
    const oldAmount = Number(supplier.currentDebt)
    if (type === 'opening' && oldAmount !== 0) {
      throw new ApiError('BUSINESS_RULE_VIOLATION', 'Nhà cung cấp đã có công nợ')
    }
    if (change.expectedCurrentDebt !== oldAmount) {
      throw new ApiError(
        'CONFLICT',
        `Công nợ nhà cung cấp đã thay đổi (hiện là ${formatCurrencyVnd(oldAmount)}), vui lòng tải lại rồi điều chỉnh`,
      )
    }
    if (change.direction === 'decrease' && change.amount > oldAmount) {
      throw new ApiError(
        'BUSINESS_RULE_VIOLATION',
        `Số tiền giảm (${formatCurrencyVnd(change.amount)}) vượt quá số nợ hiện tại (${formatCurrencyVnd(oldAmount)})`,
      )
    }
    const newAmount = applyDebtAdjustment(oldAmount, change.direction, change.amount)
    const [created] = await tx
      .insert(supplierDebtAdjustments)
      .values({
        storeId: actor.storeId,
        supplierId,
        oldAmount,
        newAmount,
        reason,
        type,
        incurredAt,
        adjustedBy: actor.userId,
      })
      .returning({ id: supplierDebtAdjustments.id, createdAt: supplierDebtAdjustments.createdAt })
    if (!created) throw new ApiError('INTERNAL_ERROR', 'Không tạo được điều chỉnh nợ')
    await tx
      .update(suppliers)
      .set({ currentDebt: newAmount })
      .where(and(eq(suppliers.id, supplierId), eq(suppliers.storeId, actor.storeId)))
    const [user] = await tx
      .select({ name: users.name })
      .from(users)
      .where(and(eq(users.id, actor.userId), eq(users.storeId, actor.storeId)))
      .limit(1)
    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action:
        type === 'opening' ? 'supplier_debt.opening_created' : 'supplier_debt_adjustment.created',
      targetType: 'supplier_debt_adjustment',
      targetId: created.id,
      changes: {
        supplierId,
        supplierName: supplier.name,
        oldAmount,
        newAmount,
        reason,
        ...(type === 'opening' ? { amount: newAmount, incurredAt: openingDate } : {}),
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })
    logger.info(
      {
        storeId: actor.storeId,
        actorId: actor.userId,
        supplierId,
        oldAmount,
        newAmount,
        adjustmentId: created.id,
      },
      'supplier_debt_adjustment.created',
    )
    return {
      id: created.id,
      supplierId,
      supplierName: supplier.name,
      oldAmount,
      newAmount,
      reason,
      type,
      incurredAt: incurredAt?.toISOString() ?? null,
      adjustedBy: actor.userId,
      adjustedByName: user?.name ?? null,
      createdAt: created.createdAt.toISOString(),
    }
  })
}

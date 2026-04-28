import { and, eq, isNull, sql } from 'drizzle-orm'

import {
  type CreateCustomerGroupInput,
  type CustomerGroupItem,
  customerGroups,
  customers,
  type UpdateCustomerGroupInput,
  type UserRole,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { isUniqueViolation } from '../lib/pg-errors.js'
import { diffObjects, logAction, type RequestMeta } from './audit.service.js'

export interface CustomerGroupsActor {
  userId: string
  storeId: string
  role: UserRole
}

interface CustomerGroupRow {
  id: string
  storeId: string
  name: string
  description: string | null
  defaultPriceListId: string | null
  debtLimit: number | null
  customerCount: number
  createdAt: Date
  updatedAt: Date
}

function toCustomerGroupItem(row: CustomerGroupRow): CustomerGroupItem {
  return {
    id: row.id,
    storeId: row.storeId,
    name: row.name,
    description: row.description,
    defaultPriceListId: row.defaultPriceListId,
    debtLimit: row.debtLimit,
    customerCount: row.customerCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function ensureNameUnique({
  db,
  storeId,
  name,
  excludeId,
}: {
  db: Db
  storeId: string
  name: string
  excludeId?: string
}): Promise<void> {
  const conditions = [
    eq(customerGroups.storeId, storeId),
    sql`LOWER(${customerGroups.name}) = LOWER(${name})`,
    isNull(customerGroups.deletedAt),
  ]
  if (excludeId) {
    conditions.push(sql`${customerGroups.id} != ${excludeId}`)
  }
  const rows = await db
    .select({ id: customerGroups.id })
    .from(customerGroups)
    .where(and(...conditions))
    .limit(1)
  if (rows.length > 0) {
    throw new ApiError('CONFLICT', 'Tên nhóm khách hàng đã tồn tại', { field: 'name' })
  }
}

function aliveGroupCount(db: Db, groupId: string) {
  return db
    .select({ count: sql<number>`count(*)::int` })
    .from(customers)
    .where(and(eq(customers.groupId, groupId), isNull(customers.deletedAt)))
}

export interface ListCustomerGroupsDeps {
  db: Db
  storeId: string
}

export async function listCustomerGroups({
  db,
  storeId,
}: ListCustomerGroupsDeps): Promise<CustomerGroupItem[]> {
  const rows = await db
    .select({
      id: customerGroups.id,
      storeId: customerGroups.storeId,
      name: customerGroups.name,
      description: customerGroups.description,
      defaultPriceListId: customerGroups.defaultPriceListId,
      debtLimit: customerGroups.debtLimit,
      createdAt: customerGroups.createdAt,
      updatedAt: customerGroups.updatedAt,
      customerCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${customers}
        WHERE ${customers.groupId} = ${customerGroups.id}
        AND ${customers.deletedAt} IS NULL
      )`,
    })
    .from(customerGroups)
    .where(and(eq(customerGroups.storeId, storeId), isNull(customerGroups.deletedAt)))
    .orderBy(customerGroups.name)

  return rows.map((row) => toCustomerGroupItem(row))
}

export interface GetCustomerGroupDeps {
  db: Db
  storeId: string
  targetId: string
}

export async function getCustomerGroup({
  db,
  storeId,
  targetId,
}: GetCustomerGroupDeps): Promise<CustomerGroupItem> {
  const target = await db.query.customerGroups.findFirst({
    where: eq(customerGroups.id, targetId),
  })
  if (!target || target.storeId !== storeId || target.deletedAt !== null) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy nhóm khách hàng')
  }

  const countRows = await aliveGroupCount(db, target.id)

  return toCustomerGroupItem({
    ...target,
    customerCount: countRows[0]?.count ?? 0,
  })
}

export interface CreateCustomerGroupDeps {
  db: Db
  actor: CustomerGroupsActor
  input: CreateCustomerGroupInput
  meta?: RequestMeta
}

export async function createCustomerGroup({
  db,
  actor,
  input,
  meta,
}: CreateCustomerGroupDeps): Promise<CustomerGroupItem> {
  await ensureNameUnique({ db, storeId: actor.storeId, name: input.name })

  return db.transaction(async (tx) => {
    let created: typeof customerGroups.$inferSelect
    try {
      const [row] = await tx
        .insert(customerGroups)
        .values({
          storeId: actor.storeId,
          name: input.name,
          description: input.description ?? null,
          defaultPriceListId: input.defaultPriceListId ?? null,
          debtLimit: input.debtLimit ?? null,
        })
        .returning()
      if (!row) {
        throw new ApiError('INTERNAL_ERROR', 'Không tạo được nhóm khách hàng')
      }
      created = row
    } catch (err) {
      if (err instanceof ApiError) throw err
      if (isUniqueViolation(err, 'uniq_customer_groups_store_name_alive')) {
        throw new ApiError('CONFLICT', 'Tên nhóm khách hàng đã tồn tại', { field: 'name' })
      }
      throw err
    }

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'customer_group.created',
      targetType: 'customer_group',
      targetId: created.id,
      changes: {
        name: created.name,
        description: created.description,
        defaultPriceListId: created.defaultPriceListId,
        debtLimit: created.debtLimit,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    return toCustomerGroupItem({
      ...created,
      customerCount: 0,
    })
  })
}

export interface UpdateCustomerGroupDeps {
  db: Db
  actor: CustomerGroupsActor
  targetId: string
  input: UpdateCustomerGroupInput
  meta?: RequestMeta
}

export async function updateCustomerGroup({
  db,
  actor,
  targetId,
  input,
  meta,
}: UpdateCustomerGroupDeps): Promise<CustomerGroupItem> {
  const target = await db.query.customerGroups.findFirst({
    where: eq(customerGroups.id, targetId),
  })
  if (!target || target.storeId !== actor.storeId || target.deletedAt !== null) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy nhóm khách hàng')
  }

  const updates: Partial<typeof customerGroups.$inferInsert> = {}
  if (input.name !== undefined && input.name !== target.name) {
    await ensureNameUnique({
      db,
      storeId: actor.storeId,
      name: input.name,
      excludeId: target.id,
    })
    updates.name = input.name
  }
  if (input.description !== undefined && input.description !== target.description) {
    updates.description = input.description
  }
  if (
    input.defaultPriceListId !== undefined &&
    input.defaultPriceListId !== target.defaultPriceListId
  ) {
    updates.defaultPriceListId = input.defaultPriceListId
  }
  if (input.debtLimit !== undefined && input.debtLimit !== target.debtLimit) {
    updates.debtLimit = input.debtLimit
  }

  if (Object.keys(updates).length === 0) {
    return getCustomerGroup({ db, storeId: actor.storeId, targetId })
  }

  const before = {
    name: target.name,
    description: target.description,
    defaultPriceListId: target.defaultPriceListId,
    debtLimit: target.debtLimit,
  }
  const after = { ...before, ...updates }

  return db.transaction(async (tx) => {
    let updated: typeof customerGroups.$inferSelect
    try {
      const [row] = await tx
        .update(customerGroups)
        .set(updates)
        .where(eq(customerGroups.id, targetId))
        .returning()
      if (!row) {
        throw new ApiError('INTERNAL_ERROR', 'Không cập nhật được nhóm khách hàng')
      }
      updated = row
    } catch (err) {
      if (err instanceof ApiError) throw err
      if (isUniqueViolation(err, 'uniq_customer_groups_store_name_alive')) {
        throw new ApiError('CONFLICT', 'Tên nhóm khách hàng đã tồn tại', { field: 'name' })
      }
      throw err
    }

    const fieldDiff = diffObjects(
      before as Record<string, unknown>,
      after as Record<string, unknown>,
    )
    if (Object.keys(fieldDiff).length > 0) {
      await logAction({
        db: tx as unknown as Db,
        storeId: actor.storeId,
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'customer_group.updated',
        targetType: 'customer_group',
        targetId,
        changes: fieldDiff,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      })
    }

    const countRows = await aliveGroupCount(tx as unknown as Db, targetId)

    return toCustomerGroupItem({
      ...updated,
      customerCount: countRows[0]?.count ?? 0,
    })
  })
}

export interface DeleteCustomerGroupDeps {
  db: Db
  actor: CustomerGroupsActor
  targetId: string
  meta?: RequestMeta
}

export async function deleteCustomerGroup({
  db,
  actor,
  targetId,
  meta,
}: DeleteCustomerGroupDeps): Promise<{ ok: true }> {
  const target = await db.query.customerGroups.findFirst({
    where: eq(customerGroups.id, targetId),
  })
  if (!target || target.storeId !== actor.storeId || target.deletedAt !== null) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy nhóm khách hàng')
  }

  const countRows = await aliveGroupCount(db, targetId)
  const customerCount = countRows[0]?.count ?? 0
  if (customerCount > 0) {
    throw new ApiError(
      'BUSINESS_RULE_VIOLATION',
      `Nhóm đang chứa ${customerCount} khách hàng, không thể xoá. Vui lòng chuyển khách hàng sang nhóm khác trước`,
    )
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(customerGroups)
      .set({ deletedAt: new Date() })
      .where(eq(customerGroups.id, targetId))
      .returning({ id: customerGroups.id })
    if (!row) {
      throw new ApiError('INTERNAL_ERROR', 'Không xoá được nhóm khách hàng')
    }

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'customer_group.deleted',
      targetType: 'customer_group',
      targetId,
      changes: {
        name: target.name,
        description: target.description,
        defaultPriceListId: target.defaultPriceListId,
        debtLimit: target.debtLimit,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    return { ok: true as const }
  })
}

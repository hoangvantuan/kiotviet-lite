import { and, asc, desc, eq, ilike, isNotNull, isNull, or, type SQL, sql } from 'drizzle-orm'

import {
  type CreateCustomerInput,
  type CustomerDetail,
  customerGroups,
  type CustomerListItem,
  customers,
  type ListCustomersQuery,
  type QuickCreateCustomerInput,
  type UpdateCustomerInput,
  type UserRole,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { isUniqueViolation } from '../lib/pg-errors.js'
import { escapeLikePattern } from '../lib/strings.js'
import { diffObjects, logAction, type RequestMeta } from './audit.service.js'

export interface CustomersActor {
  userId: string
  storeId: string
  role: UserRole
}

interface CustomerJoinRow {
  id: string
  storeId: string
  name: string
  phone: string
  email: string | null
  address: string | null
  taxId: string | null
  notes: string | null
  debtLimit: number | null
  groupId: string | null
  totalPurchased: number
  purchaseCount: number
  currentDebt: number
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
  groupName: string | null
  groupDefaultPriceListId: string | null
  groupDebtLimit: number | null
}

function toCustomerListItem(row: CustomerJoinRow): CustomerListItem {
  const debtLimit = row.debtLimit === null ? null : Number(row.debtLimit)
  const groupDebtLimit = row.groupDebtLimit === null ? null : Number(row.groupDebtLimit)
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    taxId: row.taxId,
    notes: row.notes,
    debtLimit,
    effectiveDebtLimit: debtLimit ?? groupDebtLimit ?? null,
    groupId: row.groupId,
    groupName: row.groupName,
    totalPurchased: Number(row.totalPurchased),
    purchaseCount: Number(row.purchaseCount),
    currentDebt: Number(row.currentDebt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toCustomerDetail(row: CustomerJoinRow): CustomerDetail {
  return {
    ...toCustomerListItem(row),
    storeId: row.storeId,
    effectivePriceListId: row.groupDefaultPriceListId,
    group:
      row.groupId === null
        ? null
        : {
            id: row.groupId,
            name: row.groupName ?? '',
            defaultPriceListId: row.groupDefaultPriceListId,
            debtLimit: row.groupDebtLimit === null ? null : Number(row.groupDebtLimit),
          },
  }
}

async function ensurePhoneUnique({
  db,
  storeId,
  phone,
  excludeId,
}: {
  db: Db
  storeId: string
  phone: string
  excludeId?: string
}): Promise<void> {
  const conditions = [
    eq(customers.storeId, storeId),
    eq(customers.phone, phone),
    isNull(customers.deletedAt),
  ]
  if (excludeId) {
    conditions.push(sql`${customers.id} != ${excludeId}`)
  }
  const rows = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(...conditions))
    .limit(1)
  if (rows.length > 0) {
    throw new ApiError('CONFLICT', 'Số điện thoại đã được sử dụng', { field: 'phone' })
  }
}

async function ensureGroupValid({
  db,
  storeId,
  groupId,
}: {
  db: Db
  storeId: string
  groupId: string
}): Promise<void> {
  const group = await db.query.customerGroups.findFirst({
    where: eq(customerGroups.id, groupId),
  })
  if (!group || group.storeId !== storeId || group.deletedAt !== null) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy nhóm khách hàng')
  }
}

const customerSelectColumns = {
  id: customers.id,
  storeId: customers.storeId,
  name: customers.name,
  phone: customers.phone,
  email: customers.email,
  address: customers.address,
  taxId: customers.taxId,
  notes: customers.notes,
  debtLimit: customers.debtLimit,
  groupId: customers.groupId,
  totalPurchased: customers.totalPurchased,
  purchaseCount: customers.purchaseCount,
  currentDebt: customers.currentDebt,
  deletedAt: customers.deletedAt,
  createdAt: customers.createdAt,
  updatedAt: customers.updatedAt,
  groupName: customerGroups.name,
  groupDefaultPriceListId: customerGroups.defaultPriceListId,
  groupDebtLimit: customerGroups.debtLimit,
}

export interface ListCustomersDeps {
  db: Db
  storeId: string
  query: ListCustomersQuery
}

export interface CustomerListResult {
  items: CustomerListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export async function listCustomers({
  db,
  storeId,
  query,
}: ListCustomersDeps): Promise<CustomerListResult> {
  const { page, pageSize, search, groupId, hasDebt } = query

  const conditions: SQL[] = [eq(customers.storeId, storeId), isNull(customers.deletedAt)]

  const trimmedSearch = search?.trim()
  if (trimmedSearch) {
    const escaped = escapeLikePattern(trimmedSearch)
    const pattern = `%${escaped}%`
    const searchClause = or(
      sql`LOWER(${customers.name}) LIKE LOWER(${pattern})`,
      ilike(customers.phone, pattern),
    )
    if (searchClause) conditions.push(searchClause)
  }

  if (groupId === 'none') {
    conditions.push(isNull(customers.groupId))
  } else if (groupId) {
    conditions.push(eq(customers.groupId, groupId))
  }

  if (hasDebt === 'yes') {
    conditions.push(sql`${customers.currentDebt} > 0`)
  } else if (hasDebt === 'no') {
    conditions.push(sql`${customers.currentDebt} = 0`)
  }

  const whereClause = and(...conditions)

  const offset = (page - 1) * pageSize

  const rows = await db
    .select(customerSelectColumns)
    .from(customers)
    .leftJoin(customerGroups, eq(customers.groupId, customerGroups.id))
    .where(whereClause)
    .orderBy(desc(customers.createdAt), asc(customers.name))
    .limit(pageSize)
    .offset(offset)

  const totalRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customers)
    .where(whereClause)

  const total = totalRows[0]?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return {
    items: rows.map(toCustomerListItem),
    total,
    page,
    pageSize,
    totalPages,
  }
}

export interface ListTrashedCustomersDeps {
  db: Db
  storeId: string
  page: number
  pageSize: number
}

export async function listTrashedCustomers({
  db,
  storeId,
  page,
  pageSize,
}: ListTrashedCustomersDeps): Promise<CustomerListResult> {
  const whereClause = and(eq(customers.storeId, storeId), isNotNull(customers.deletedAt))

  const offset = (page - 1) * pageSize

  const rows = await db
    .select(customerSelectColumns)
    .from(customers)
    .leftJoin(customerGroups, eq(customers.groupId, customerGroups.id))
    .where(whereClause)
    .orderBy(desc(customers.deletedAt))
    .limit(pageSize)
    .offset(offset)

  const totalRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customers)
    .where(whereClause)

  const total = totalRows[0]?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return {
    items: rows.map(toCustomerListItem),
    total,
    page,
    pageSize,
    totalPages,
  }
}

export interface GetCustomerDeps {
  db: Db
  storeId: string
  targetId: string
}

export async function getCustomer({
  db,
  storeId,
  targetId,
}: GetCustomerDeps): Promise<CustomerDetail> {
  const rows = await db
    .select(customerSelectColumns)
    .from(customers)
    .leftJoin(customerGroups, eq(customers.groupId, customerGroups.id))
    .where(
      and(eq(customers.id, targetId), eq(customers.storeId, storeId), isNull(customers.deletedAt)),
    )
    .limit(1)

  const row = rows[0]
  if (!row) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy khách hàng')
  }

  return toCustomerDetail(row)
}

export interface CreateCustomerDeps {
  db: Db
  actor: CustomersActor
  input: CreateCustomerInput
  meta?: RequestMeta
}

export async function createCustomer({
  db,
  actor,
  input,
  meta,
}: CreateCustomerDeps): Promise<CustomerDetail> {
  await ensurePhoneUnique({ db, storeId: actor.storeId, phone: input.phone })

  if (input.groupId) {
    await ensureGroupValid({ db, storeId: actor.storeId, groupId: input.groupId })
  }

  return db.transaction(async (tx) => {
    let createdId: string
    try {
      const [row] = await tx
        .insert(customers)
        .values({
          storeId: actor.storeId,
          name: input.name,
          phone: input.phone,
          email: input.email ?? null,
          address: input.address ?? null,
          taxId: input.taxId ?? null,
          notes: input.notes ?? null,
          debtLimit: input.debtLimit ?? null,
          groupId: input.groupId ?? null,
        })
        .returning({ id: customers.id })

      if (!row) {
        throw new ApiError('INTERNAL_ERROR', 'Không tạo được khách hàng')
      }
      createdId = row.id
    } catch (err) {
      if (err instanceof ApiError) throw err
      if (isUniqueViolation(err, 'uniq_customers_store_phone_alive')) {
        throw new ApiError('CONFLICT', 'Số điện thoại đã được sử dụng', { field: 'phone' })
      }
      throw err
    }

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'customer.created',
      targetType: 'customer',
      targetId: createdId,
      changes: {
        name: input.name,
        phone: input.phone,
        groupId: input.groupId ?? null,
        debtLimit: input.debtLimit ?? null,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    return getCustomer({ db: tx as unknown as Db, storeId: actor.storeId, targetId: createdId })
  })
}

export interface QuickCreateCustomerDeps {
  db: Db
  actor: CustomersActor
  input: QuickCreateCustomerInput
  meta?: RequestMeta
}

export async function quickCreateCustomer({
  db,
  actor,
  input,
  meta,
}: QuickCreateCustomerDeps): Promise<CustomerDetail> {
  return createCustomer({
    db,
    actor,
    input: {
      name: input.name,
      phone: input.phone,
      email: null,
      address: null,
      taxId: null,
      notes: null,
      debtLimit: null,
      groupId: null,
    },
    meta,
  })
}

export interface UpdateCustomerDeps {
  db: Db
  actor: CustomersActor
  targetId: string
  input: UpdateCustomerInput
  meta?: RequestMeta
}

export async function updateCustomer({
  db,
  actor,
  targetId,
  input,
  meta,
}: UpdateCustomerDeps): Promise<CustomerDetail> {
  const target = await db.query.customers.findFirst({
    where: eq(customers.id, targetId),
  })
  if (!target || target.storeId !== actor.storeId || target.deletedAt !== null) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy khách hàng')
  }

  if (input.phone !== undefined && input.phone !== target.phone) {
    await ensurePhoneUnique({
      db,
      storeId: actor.storeId,
      phone: input.phone,
      excludeId: target.id,
    })
  }

  if (input.groupId !== undefined && input.groupId !== null && input.groupId !== target.groupId) {
    await ensureGroupValid({ db, storeId: actor.storeId, groupId: input.groupId })
  }

  const updates: Partial<typeof customers.$inferInsert> = {}
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}

  const fields: Array<keyof UpdateCustomerInput> = [
    'name',
    'phone',
    'email',
    'address',
    'taxId',
    'notes',
    'debtLimit',
    'groupId',
  ]
  for (const field of fields) {
    if (input[field] !== undefined) {
      const newValue = input[field]
      const oldValue = (target as Record<string, unknown>)[field]
      if (newValue !== oldValue) {
        ;(updates as Record<string, unknown>)[field] = newValue
        before[field] = oldValue
        after[field] = newValue
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    return getCustomer({ db, storeId: actor.storeId, targetId })
  }

  return db.transaction(async (tx) => {
    try {
      const [row] = await tx
        .update(customers)
        .set(updates)
        .where(eq(customers.id, targetId))
        .returning({ id: customers.id })
      if (!row) {
        throw new ApiError('INTERNAL_ERROR', 'Không cập nhật được khách hàng')
      }
    } catch (err) {
      if (err instanceof ApiError) throw err
      if (isUniqueViolation(err, 'uniq_customers_store_phone_alive')) {
        throw new ApiError('CONFLICT', 'Số điện thoại đã được sử dụng', { field: 'phone' })
      }
      throw err
    }

    const fieldDiff = diffObjects(before, after)
    if (Object.keys(fieldDiff).length > 0) {
      await logAction({
        db: tx as unknown as Db,
        storeId: actor.storeId,
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'customer.updated',
        targetType: 'customer',
        targetId,
        changes: fieldDiff,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      })
    }

    return getCustomer({ db: tx as unknown as Db, storeId: actor.storeId, targetId })
  })
}

export interface DeleteCustomerDeps {
  db: Db
  actor: CustomersActor
  targetId: string
  meta?: RequestMeta
}

export async function deleteCustomer({
  db,
  actor,
  targetId,
  meta,
}: DeleteCustomerDeps): Promise<{ ok: true }> {
  const target = await db.query.customers.findFirst({
    where: eq(customers.id, targetId),
  })
  if (!target || target.storeId !== actor.storeId || target.deletedAt !== null) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy khách hàng')
  }

  if (target.currentDebt > 0) {
    const formatted = new Intl.NumberFormat('vi-VN').format(target.currentDebt)
    throw new ApiError(
      'BUSINESS_RULE_VIOLATION',
      `Khách hàng có công nợ ${formatted}đ, không thể xoá`,
    )
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(customers)
      .set({ deletedAt: new Date() })
      .where(eq(customers.id, targetId))
      .returning({ id: customers.id })
    if (!row) {
      throw new ApiError('INTERNAL_ERROR', 'Không xoá được khách hàng')
    }

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'customer.deleted',
      targetType: 'customer',
      targetId,
      changes: {
        name: target.name,
        phone: target.phone,
        groupId: target.groupId,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    return { ok: true as const }
  })
}

export interface RestoreCustomerDeps {
  db: Db
  actor: CustomersActor
  targetId: string
  meta?: RequestMeta
}

export async function restoreCustomer({
  db,
  actor,
  targetId,
  meta,
}: RestoreCustomerDeps): Promise<CustomerDetail> {
  const target = await db.query.customers.findFirst({
    where: eq(customers.id, targetId),
  })
  if (!target || target.storeId !== actor.storeId || target.deletedAt === null) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy khách hàng đã xoá')
  }

  await ensurePhoneUnique({ db, storeId: actor.storeId, phone: target.phone })

  return db.transaction(async (tx) => {
    try {
      const [row] = await tx
        .update(customers)
        .set({ deletedAt: null })
        .where(eq(customers.id, targetId))
        .returning({ id: customers.id })
      if (!row) {
        throw new ApiError('INTERNAL_ERROR', 'Không khôi phục được khách hàng')
      }
    } catch (err) {
      if (err instanceof ApiError) throw err
      if (isUniqueViolation(err, 'uniq_customers_store_phone_alive')) {
        throw new ApiError(
          'CONFLICT',
          'Số điện thoại đã được dùng cho khách hàng khác, vui lòng đổi số điện thoại trước khi khôi phục',
          { field: 'phone' },
        )
      }
      throw err
    }

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'customer.restored',
      targetType: 'customer',
      targetId,
      changes: {
        name: target.name,
        phone: target.phone,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    return getCustomer({ db: tx as unknown as Db, storeId: actor.storeId, targetId })
  })
}

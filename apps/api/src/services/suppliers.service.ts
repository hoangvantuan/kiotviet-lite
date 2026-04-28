import { and, asc, desc, eq, ilike, isNotNull, isNull, or, type SQL, sql } from 'drizzle-orm'

import {
  type CreateSupplierInput,
  type ListSuppliersQuery,
  type SupplierDetail,
  type SupplierListItem,
  suppliers,
  type UpdateSupplierInput,
  type UserRole,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'
import { isFkViolation, isUniqueViolation } from '../lib/pg-errors.js'
import { escapeLikePattern } from '../lib/strings.js'
import { diffObjects, logAction, type RequestMeta } from './audit.service.js'

// Convert Date → ISO string để JSON serialize an toàn cho audit log.
// Drizzle trả Date objects cho timestamp columns; nếu mở rộng audit fields
// (deletedAt, createdAt, updatedAt) → cần normalize trước khi diff.
function normalizeAuditValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString()
  }
  return value
}

export interface SuppliersActor {
  userId: string
  storeId: string
  role: UserRole
}

interface SupplierRow {
  id: string
  storeId: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  taxId: string | null
  notes: string | null
  currentDebt: number
  purchaseCount: number
  totalPurchased: number
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

function toSupplierListItem(row: SupplierRow): SupplierListItem {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    taxId: row.taxId,
    notes: row.notes,
    currentDebt: Number(row.currentDebt),
    purchaseCount: Number(row.purchaseCount),
    totalPurchased: Number(row.totalPurchased),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toSupplierDetail(row: SupplierRow): SupplierDetail {
  return {
    ...toSupplierListItem(row),
    storeId: row.storeId,
    deletedAt: row.deletedAt === null ? null : row.deletedAt.toISOString(),
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
  const conditions: SQL[] = [
    eq(suppliers.storeId, storeId),
    isNull(suppliers.deletedAt),
    sql`LOWER(${suppliers.name}) = LOWER(${name})`,
  ]
  if (excludeId) {
    conditions.push(sql`${suppliers.id} != ${excludeId}`)
  }
  const rows = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(...conditions))
    .limit(1)
  if (rows.length > 0) {
    throw new ApiError('CONFLICT', 'Tên nhà cung cấp đã được sử dụng', { field: 'name' })
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
  const conditions: SQL[] = [
    eq(suppliers.storeId, storeId),
    eq(suppliers.phone, phone),
    isNull(suppliers.deletedAt),
  ]
  if (excludeId) {
    conditions.push(sql`${suppliers.id} != ${excludeId}`)
  }
  const rows = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(...conditions))
    .limit(1)
  if (rows.length > 0) {
    throw new ApiError('CONFLICT', 'Số điện thoại đã được sử dụng', { field: 'phone' })
  }
}

const supplierSelectColumns = {
  id: suppliers.id,
  storeId: suppliers.storeId,
  name: suppliers.name,
  phone: suppliers.phone,
  email: suppliers.email,
  address: suppliers.address,
  taxId: suppliers.taxId,
  notes: suppliers.notes,
  currentDebt: suppliers.currentDebt,
  purchaseCount: suppliers.purchaseCount,
  totalPurchased: suppliers.totalPurchased,
  deletedAt: suppliers.deletedAt,
  createdAt: suppliers.createdAt,
  updatedAt: suppliers.updatedAt,
}

export interface SupplierListResult {
  items: SupplierListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface ListSuppliersDeps {
  db: Db
  storeId: string
  query: ListSuppliersQuery
}

export async function listSuppliers({
  db,
  storeId,
  query,
}: ListSuppliersDeps): Promise<SupplierListResult> {
  const { page, pageSize, search, hasDebt } = query
  const conditions: SQL[] = [eq(suppliers.storeId, storeId), isNull(suppliers.deletedAt)]

  const trimmedSearch = search?.trim()
  if (trimmedSearch) {
    const escaped = escapeLikePattern(trimmedSearch)
    const pattern = `%${escaped}%`
    const searchClause = or(
      sql`LOWER(${suppliers.name}) LIKE LOWER(${pattern})`,
      ilike(suppliers.phone, pattern),
    )
    if (searchClause) conditions.push(searchClause)
  }

  if (hasDebt === 'yes') {
    conditions.push(sql`${suppliers.currentDebt} > 0`)
  } else if (hasDebt === 'no') {
    conditions.push(sql`${suppliers.currentDebt} = 0`)
  }

  const whereClause = and(...conditions)
  const offset = (page - 1) * pageSize

  const rows = await db
    .select(supplierSelectColumns)
    .from(suppliers)
    .where(whereClause)
    .orderBy(desc(suppliers.createdAt), asc(suppliers.name))
    .limit(pageSize)
    .offset(offset)

  const totalRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(suppliers)
    .where(whereClause)

  const total = totalRows[0]?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return {
    items: rows.map(toSupplierListItem),
    total,
    page,
    pageSize,
    totalPages,
  }
}

export interface ListTrashedSuppliersDeps {
  db: Db
  storeId: string
  page: number
  pageSize: number
}

export async function listTrashedSuppliers({
  db,
  storeId,
  page,
  pageSize,
}: ListTrashedSuppliersDeps): Promise<SupplierListResult> {
  const whereClause = and(eq(suppliers.storeId, storeId), isNotNull(suppliers.deletedAt))
  const offset = (page - 1) * pageSize

  const rows = await db
    .select(supplierSelectColumns)
    .from(suppliers)
    .where(whereClause)
    .orderBy(desc(suppliers.deletedAt))
    .limit(pageSize)
    .offset(offset)

  const totalRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(suppliers)
    .where(whereClause)

  const total = totalRows[0]?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return {
    items: rows.map(toSupplierListItem),
    total,
    page,
    pageSize,
    totalPages,
  }
}

export interface GetSupplierDeps {
  db: Db
  storeId: string
  targetId: string
  includeDeleted?: boolean
}

export async function getSupplier({
  db,
  storeId,
  targetId,
  includeDeleted = false,
}: GetSupplierDeps): Promise<SupplierDetail> {
  const conditions: SQL[] = [eq(suppliers.id, targetId), eq(suppliers.storeId, storeId)]
  if (!includeDeleted) {
    conditions.push(isNull(suppliers.deletedAt))
  }
  const rows = await db
    .select(supplierSelectColumns)
    .from(suppliers)
    .where(and(...conditions))
    .limit(1)

  const row = rows[0]
  if (!row) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy nhà cung cấp')
  }
  return toSupplierDetail(row)
}

export interface CreateSupplierDeps {
  db: Db
  actor: SuppliersActor
  input: CreateSupplierInput
  meta?: RequestMeta
}

export async function createSupplier({
  db,
  actor,
  input,
  meta,
}: CreateSupplierDeps): Promise<SupplierDetail> {
  const phone = input.phone ?? null

  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Db

    // Re-check unique TRONG transaction để tránh race với concurrent insert
    // (DB unique index vẫn là backstop chính qua catch 23505)
    await ensureNameUnique({ db: txDb, storeId: actor.storeId, name: input.name })
    if (phone !== null) {
      await ensurePhoneUnique({ db: txDb, storeId: actor.storeId, phone })
    }

    let createdId: string
    try {
      const [row] = await tx
        .insert(suppliers)
        .values({
          storeId: actor.storeId,
          name: input.name,
          phone,
          email: input.email ?? null,
          address: input.address ?? null,
          taxId: input.taxId ?? null,
          notes: input.notes ?? null,
        })
        .returning({ id: suppliers.id })
      if (!row) {
        throw new ApiError('INTERNAL_ERROR', 'Không tạo được nhà cung cấp')
      }
      createdId = row.id
    } catch (err) {
      if (err instanceof ApiError) throw err
      if (isUniqueViolation(err, 'uniq_suppliers_store_name_alive')) {
        throw new ApiError('CONFLICT', 'Tên nhà cung cấp đã được sử dụng', { field: 'name' })
      }
      if (isUniqueViolation(err, 'uniq_suppliers_store_phone_alive')) {
        throw new ApiError('CONFLICT', 'Số điện thoại đã được sử dụng', { field: 'phone' })
      }
      throw err
    }

    await logAction({
      db: txDb,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'supplier.created',
      targetType: 'supplier',
      targetId: createdId,
      changes: {
        name: input.name,
        phone,
        email: input.email ?? null,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    logger.info(
      {
        storeId: actor.storeId,
        actorId: actor.userId,
        supplierId: createdId,
        name: input.name,
      },
      'supplier.created',
    )

    return getSupplier({ db: txDb, storeId: actor.storeId, targetId: createdId })
  })
}

export interface UpdateSupplierDeps {
  db: Db
  actor: SuppliersActor
  targetId: string
  input: UpdateSupplierInput
  meta?: RequestMeta
}

export async function updateSupplier({
  db,
  actor,
  targetId,
  input,
  meta,
}: UpdateSupplierDeps): Promise<SupplierDetail> {
  const target = await db.query.suppliers.findFirst({
    where: eq(suppliers.id, targetId),
  })
  if (!target || target.storeId !== actor.storeId || target.deletedAt !== null) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy nhà cung cấp')
  }

  if (input.name !== undefined && input.name !== target.name) {
    await ensureNameUnique({
      db,
      storeId: actor.storeId,
      name: input.name,
      excludeId: target.id,
    })
  }

  if (input.phone !== undefined && input.phone !== null && input.phone !== target.phone) {
    await ensurePhoneUnique({
      db,
      storeId: actor.storeId,
      phone: input.phone,
      excludeId: target.id,
    })
  }

  const updates: Partial<typeof suppliers.$inferInsert> = {}
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}

  const fields: Array<keyof UpdateSupplierInput> = [
    'name',
    'phone',
    'email',
    'address',
    'taxId',
    'notes',
  ]
  for (const field of fields) {
    if (input[field] !== undefined) {
      const newValue = input[field]
      const oldValue = (target as Record<string, unknown>)[field]
      if (newValue !== oldValue) {
        ;(updates as Record<string, unknown>)[field] = newValue
        before[field] = normalizeAuditValue(oldValue)
        after[field] = normalizeAuditValue(newValue)
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    return getSupplier({ db, storeId: actor.storeId, targetId })
  }

  return db.transaction(async (tx) => {
    try {
      const [row] = await tx
        .update(suppliers)
        .set(updates)
        .where(eq(suppliers.id, targetId))
        .returning({ id: suppliers.id })
      if (!row) {
        throw new ApiError('INTERNAL_ERROR', 'Không cập nhật được nhà cung cấp')
      }
    } catch (err) {
      if (err instanceof ApiError) throw err
      if (isUniqueViolation(err, 'uniq_suppliers_store_name_alive')) {
        throw new ApiError('CONFLICT', 'Tên nhà cung cấp đã được sử dụng', { field: 'name' })
      }
      if (isUniqueViolation(err, 'uniq_suppliers_store_phone_alive')) {
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
        action: 'supplier.updated',
        targetType: 'supplier',
        targetId,
        changes: fieldDiff,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      })
    }

    logger.info(
      {
        storeId: actor.storeId,
        actorId: actor.userId,
        supplierId: targetId,
        fields: Object.keys(updates),
      },
      'supplier.updated',
    )

    return getSupplier({ db: tx as unknown as Db, storeId: actor.storeId, targetId })
  })
}

export interface DeleteSupplierDeps {
  db: Db
  actor: SuppliersActor
  targetId: string
  meta?: RequestMeta
}

export async function deleteSupplier({
  db,
  actor,
  targetId,
  meta,
}: DeleteSupplierDeps): Promise<{ ok: true }> {
  const target = await db.query.suppliers.findFirst({
    where: eq(suppliers.id, targetId),
  })
  if (!target || target.storeId !== actor.storeId || target.deletedAt !== null) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy nhà cung cấp')
  }

  if (target.currentDebt > 0) {
    const formatted = new Intl.NumberFormat('vi-VN').format(target.currentDebt)
    throw new ApiError(
      'BUSINESS_RULE_VIOLATION',
      `Nhà cung cấp còn công nợ ${formatted}đ, không thể xoá`,
    )
  }

  if (target.purchaseCount > 0) {
    throw new ApiError(
      'BUSINESS_RULE_VIOLATION',
      `Nhà cung cấp đã có ${target.purchaseCount} phiếu nhập, không thể xoá`,
    )
  }

  return db.transaction(async (tx) => {
    try {
      const [row] = await tx
        .update(suppliers)
        .set({ deletedAt: new Date() })
        .where(eq(suppliers.id, targetId))
        .returning({ id: suppliers.id })
      if (!row) {
        throw new ApiError('INTERNAL_ERROR', 'Không xoá được nhà cung cấp')
      }
    } catch (err) {
      if (err instanceof ApiError) throw err
      if (isFkViolation(err)) {
        throw new ApiError(
          'BUSINESS_RULE_VIOLATION',
          'Nhà cung cấp đang được tham chiếu, không thể xoá',
        )
      }
      throw err
    }

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'supplier.deleted',
      targetType: 'supplier',
      targetId,
      changes: {
        name: target.name,
        phone: target.phone,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    logger.info(
      {
        storeId: actor.storeId,
        actorId: actor.userId,
        supplierId: targetId,
        name: target.name,
      },
      'supplier.deleted',
    )

    return { ok: true as const }
  })
}

export interface RestoreSupplierDeps {
  db: Db
  actor: SuppliersActor
  targetId: string
  meta?: RequestMeta
}

export async function restoreSupplier({
  db,
  actor,
  targetId,
  meta,
}: RestoreSupplierDeps): Promise<SupplierDetail> {
  const target = await db.query.suppliers.findFirst({
    where: eq(suppliers.id, targetId),
  })
  if (!target || target.storeId !== actor.storeId || target.deletedAt === null) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy nhà cung cấp đã xoá')
  }

  await ensureNameUnique({ db, storeId: actor.storeId, name: target.name })
  if (target.phone !== null) {
    await ensurePhoneUnique({ db, storeId: actor.storeId, phone: target.phone })
  }

  return db.transaction(async (tx) => {
    try {
      const [row] = await tx
        .update(suppliers)
        .set({ deletedAt: null })
        .where(eq(suppliers.id, targetId))
        .returning({ id: suppliers.id })
      if (!row) {
        throw new ApiError('INTERNAL_ERROR', 'Không khôi phục được nhà cung cấp')
      }
    } catch (err) {
      if (err instanceof ApiError) throw err
      if (isUniqueViolation(err, 'uniq_suppliers_store_name_alive')) {
        throw new ApiError(
          'CONFLICT',
          'Tên nhà cung cấp đã được dùng cho NCC khác, vui lòng đổi tên trước khi khôi phục',
          { field: 'name' },
        )
      }
      if (isUniqueViolation(err, 'uniq_suppliers_store_phone_alive')) {
        throw new ApiError(
          'CONFLICT',
          'Số điện thoại đã được dùng cho NCC khác, vui lòng đổi số điện thoại trước khi khôi phục',
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
      action: 'supplier.restored',
      targetType: 'supplier',
      targetId,
      changes: {
        name: target.name,
        phone: target.phone,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    logger.info(
      {
        storeId: actor.storeId,
        actorId: actor.userId,
        supplierId: targetId,
        name: target.name,
      },
      'supplier.restored',
    )

    return getSupplier({ db: tx as unknown as Db, storeId: actor.storeId, targetId })
  })
}

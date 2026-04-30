import { and, asc, desc, eq, isNull, type SQL, sql } from 'drizzle-orm'

import {
  categories,
  type CategoryDiscountListItem,
  categoryDiscounts,
  type CategoryDiscountType,
  type CreateCategoryDiscountInput,
  customerGroups,
  customers,
  type EffectiveStatus,
  type ListCategoryDiscountsQuery,
  products,
  type UpdateCategoryDiscountInput,
  type UserRole,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { escapeLikePattern } from '../lib/strings.js'
import { diffObjects, logAction, type RequestMeta } from './audit.service.js'

export interface CategoryDiscountsActor {
  userId: string
  storeId: string
  role: UserRole
}

interface CategoryDiscountRow {
  id: string
  categoryId: string
  categoryName: string
  customerId: string | null
  customerName: string | null
  customerPhone: string | null
  customerGroupId: string | null
  customerGroupName: string | null
  discountType: string
  discountValue: number
  minQty: number
  effectiveFrom: string | null
  effectiveTo: string | null
  isActive: boolean
  note: string | null
  createdAt: Date
  updatedAt: Date
}

function toIsoDate(today: Date): string {
  return today.toISOString().slice(0, 10)
}

export function computeEffectiveStatus(
  row: { isActive: boolean; effectiveFrom: string | null; effectiveTo: string | null },
  today: Date,
): EffectiveStatus {
  if (!row.isActive) return 'inactive'
  const todayStr = toIsoDate(today)
  if (row.effectiveTo && row.effectiveTo < todayStr) return 'expired'
  if (row.effectiveFrom && row.effectiveFrom > todayStr) return 'pending'
  return 'active'
}

function toCategoryDiscountListItem(
  row: CategoryDiscountRow,
  today: Date,
): CategoryDiscountListItem {
  return {
    id: row.id,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    customerId: row.customerId,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    customerGroupId: row.customerGroupId,
    customerGroupName: row.customerGroupName,
    discountType: row.discountType as CategoryDiscountType,
    discountValue: Number(row.discountValue),
    minQty: row.minQty,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    isActive: row.isActive,
    effectiveStatus: computeEffectiveStatus(row, today),
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function buildSelectColumns() {
  return {
    id: categoryDiscounts.id,
    categoryId: categoryDiscounts.categoryId,
    categoryName: categories.name,
    customerId: categoryDiscounts.customerId,
    customerName: customers.name,
    customerPhone: customers.phone,
    customerGroupId: categoryDiscounts.customerGroupId,
    customerGroupName: customerGroups.name,
    discountType: categoryDiscounts.discountType,
    discountValue: categoryDiscounts.discountValue,
    minQty: categoryDiscounts.minQty,
    effectiveFrom: categoryDiscounts.effectiveFrom,
    effectiveTo: categoryDiscounts.effectiveTo,
    isActive: categoryDiscounts.isActive,
    note: categoryDiscounts.note,
    createdAt: categoryDiscounts.createdAt,
    updatedAt: categoryDiscounts.updatedAt,
  }
}

export interface ListCategoryDiscountsDeps {
  db: Db
  storeId: string
  query: ListCategoryDiscountsQuery
}

export interface CategoryDiscountListResult {
  items: CategoryDiscountListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export async function listCategoryDiscounts({
  db,
  storeId,
  query,
}: ListCategoryDiscountsDeps): Promise<CategoryDiscountListResult> {
  const {
    page,
    pageSize,
    categoryId,
    customerId,
    customerGroupId,
    isActive,
    effectiveStatus,
    search,
  } = query

  const today = new Date()
  const todayStr = toIsoDate(today)

  const conditions: SQL[] = [
    eq(categoryDiscounts.storeId, storeId),
    sql`(${categoryDiscounts.customerId} IS NULL OR ${customers.deletedAt} IS NULL)`,
    sql`(${categoryDiscounts.customerGroupId} IS NULL OR ${customerGroups.deletedAt} IS NULL)`,
  ]

  if (categoryId) {
    conditions.push(eq(categoryDiscounts.categoryId, categoryId))
  }
  if (customerId) {
    conditions.push(eq(categoryDiscounts.customerId, customerId))
  }
  if (customerGroupId) {
    conditions.push(eq(categoryDiscounts.customerGroupId, customerGroupId))
  }
  if (isActive !== undefined) {
    conditions.push(eq(categoryDiscounts.isActive, isActive))
  }

  if (effectiveStatus) {
    if (effectiveStatus === 'inactive') {
      conditions.push(eq(categoryDiscounts.isActive, false))
    } else if (effectiveStatus === 'expired') {
      conditions.push(
        sql`${categoryDiscounts.effectiveTo} IS NOT NULL AND ${categoryDiscounts.effectiveTo} < ${todayStr}`,
      )
    } else if (effectiveStatus === 'pending') {
      conditions.push(eq(categoryDiscounts.isActive, true))
      conditions.push(
        sql`${categoryDiscounts.effectiveFrom} IS NOT NULL AND ${categoryDiscounts.effectiveFrom} > ${todayStr}`,
      )
    } else if (effectiveStatus === 'active') {
      conditions.push(eq(categoryDiscounts.isActive, true))
      conditions.push(
        sql`(${categoryDiscounts.effectiveFrom} IS NULL OR ${categoryDiscounts.effectiveFrom} <= ${todayStr})`,
      )
      conditions.push(
        sql`(${categoryDiscounts.effectiveTo} IS NULL OR ${categoryDiscounts.effectiveTo} >= ${todayStr})`,
      )
    }
  }

  const trimmed = search?.trim()
  if (trimmed) {
    const escaped = escapeLikePattern(trimmed)
    const pattern = `%${escaped}%`
    conditions.push(
      sql`(LOWER(${categoryDiscounts.note}) LIKE LOWER(${pattern}) OR LOWER(${categories.name}) LIKE LOWER(${pattern}) OR LOWER(${customers.name}) LIKE LOWER(${pattern}) OR LOWER(${customerGroups.name}) LIKE LOWER(${pattern}))`,
    )
  }

  const whereClause = and(...conditions)
  const offset = (page - 1) * pageSize

  const rows = await db
    .select(buildSelectColumns())
    .from(categoryDiscounts)
    .innerJoin(categories, eq(categoryDiscounts.categoryId, categories.id))
    .leftJoin(customers, eq(categoryDiscounts.customerId, customers.id))
    .leftJoin(customerGroups, eq(categoryDiscounts.customerGroupId, customerGroups.id))
    .where(whereClause)
    .orderBy(desc(categoryDiscounts.createdAt), desc(categoryDiscounts.id))
    .limit(pageSize)
    .offset(offset)

  const totalRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(categoryDiscounts)
    .innerJoin(categories, eq(categoryDiscounts.categoryId, categories.id))
    .leftJoin(customers, eq(categoryDiscounts.customerId, customers.id))
    .leftJoin(customerGroups, eq(categoryDiscounts.customerGroupId, customerGroups.id))
    .where(whereClause)

  const total = totalRows[0]?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return {
    items: rows.map((row) => toCategoryDiscountListItem(row as CategoryDiscountRow, today)),
    total,
    page,
    pageSize,
    totalPages,
  }
}

async function getCategoryDiscountRow({
  db,
  storeId,
  id,
  today,
}: {
  db: Db
  storeId: string
  id: string
  today: Date
}): Promise<CategoryDiscountListItem | null> {
  const rows = await db
    .select(buildSelectColumns())
    .from(categoryDiscounts)
    .innerJoin(categories, eq(categoryDiscounts.categoryId, categories.id))
    .leftJoin(customers, eq(categoryDiscounts.customerId, customers.id))
    .leftJoin(customerGroups, eq(categoryDiscounts.customerGroupId, customerGroups.id))
    .where(and(eq(categoryDiscounts.id, id), eq(categoryDiscounts.storeId, storeId)))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return toCategoryDiscountListItem(row as CategoryDiscountRow, today)
}

export interface GetCategoryDiscountDeps {
  db: Db
  storeId: string
  id: string
}

export async function getCategoryDiscount({
  db,
  storeId,
  id,
}: GetCategoryDiscountDeps): Promise<CategoryDiscountListItem> {
  const row = await getCategoryDiscountRow({ db, storeId, id, today: new Date() })
  if (!row) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy chiết khấu danh mục')
  }
  return row
}

async function ensureCategoryAlive({
  db,
  storeId,
  categoryId,
}: {
  db: Db
  storeId: string
  categoryId: string
}): Promise<void> {
  const target = await db.query.categories.findFirst({
    where: eq(categories.id, categoryId),
  })
  if (!target || target.storeId !== storeId) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy danh mục')
  }
}

async function ensureCustomerAlive({
  db,
  storeId,
  customerId,
}: {
  db: Db
  storeId: string
  customerId: string
}): Promise<void> {
  const target = await db.query.customers.findFirst({
    where: eq(customers.id, customerId),
  })
  if (!target || target.storeId !== storeId || target.deletedAt !== null) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy khách hàng')
  }
}

async function ensureCustomerGroupAlive({
  db,
  storeId,
  customerGroupId,
}: {
  db: Db
  storeId: string
  customerGroupId: string
}): Promise<void> {
  const target = await db.query.customerGroups.findFirst({
    where: eq(customerGroups.id, customerGroupId),
  })
  if (!target || target.storeId !== storeId || target.deletedAt !== null) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy nhóm khách hàng')
  }
}

export interface CreateCategoryDiscountDeps {
  db: Db
  actor: CategoryDiscountsActor
  input: CreateCategoryDiscountInput
  meta?: RequestMeta
}

export async function createCategoryDiscount({
  db,
  actor,
  input,
  meta,
}: CreateCategoryDiscountDeps): Promise<CategoryDiscountListItem> {
  await ensureCategoryAlive({ db, storeId: actor.storeId, categoryId: input.categoryId })
  if (input.customerId) {
    await ensureCustomerAlive({ db, storeId: actor.storeId, customerId: input.customerId })
  }
  if (input.customerGroupId) {
    await ensureCustomerGroupAlive({
      db,
      storeId: actor.storeId,
      customerGroupId: input.customerGroupId,
    })
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(categoryDiscounts)
      .values({
        storeId: actor.storeId,
        categoryId: input.categoryId,
        customerId: input.customerId ?? null,
        customerGroupId: input.customerGroupId ?? null,
        discountType: input.discountType,
        discountValue: input.discountValue,
        minQty: input.minQty,
        effectiveFrom: input.effectiveFrom ?? null,
        effectiveTo: input.effectiveTo ?? null,
        isActive: input.isActive,
        note: input.note ?? null,
      })
      .returning({ id: categoryDiscounts.id })
    if (!row) throw new ApiError('INTERNAL_ERROR', 'Không tạo được chiết khấu danh mục')
    const createdId = row.id

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'category_discount.created',
      targetType: 'category_discount',
      targetId: createdId,
      changes: {
        categoryId: input.categoryId,
        customerId: input.customerId ?? null,
        customerGroupId: input.customerGroupId ?? null,
        discountType: input.discountType,
        discountValue: input.discountValue,
        minQty: input.minQty,
        effectiveFrom: input.effectiveFrom ?? null,
        effectiveTo: input.effectiveTo ?? null,
        isActive: input.isActive,
        note: input.note ?? null,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    const created = await getCategoryDiscountRow({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      id: createdId,
      today: new Date(),
    })
    if (!created) {
      throw new ApiError('INTERNAL_ERROR', 'Không lấy được chiết khấu vừa tạo')
    }
    return created
  })
}

export interface UpdateCategoryDiscountDeps {
  db: Db
  actor: CategoryDiscountsActor
  id: string
  input: UpdateCategoryDiscountInput
  meta?: RequestMeta
}

export async function updateCategoryDiscount({
  db,
  actor,
  id,
  input,
  meta,
}: UpdateCategoryDiscountDeps): Promise<CategoryDiscountListItem> {
  const target = await db.query.categoryDiscounts.findFirst({
    where: eq(categoryDiscounts.id, id),
  })
  if (!target || target.storeId !== actor.storeId) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy chiết khấu danh mục')
  }

  const updates: Partial<typeof categoryDiscounts.$inferInsert> = {}
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}

  const finalCategoryDiscountType = input.discountType ?? target.discountType
  const finalDiscountValue =
    input.discountValue !== undefined ? input.discountValue : Number(target.discountValue)
  if (finalCategoryDiscountType === 'percent' && finalDiscountValue > 100) {
    throw new ApiError('VALIDATION_ERROR', 'Phần trăm giảm phải ≤ 100', {
      field: 'discountValue',
    })
  }

  const finalEffectiveFrom =
    input.effectiveFrom !== undefined ? input.effectiveFrom : target.effectiveFrom
  const finalEffectiveTo = input.effectiveTo !== undefined ? input.effectiveTo : target.effectiveTo
  if (finalEffectiveFrom && finalEffectiveTo && finalEffectiveTo < finalEffectiveFrom) {
    throw new ApiError('VALIDATION_ERROR', 'Ngày kết thúc phải ≥ ngày bắt đầu', {
      field: 'effectiveTo',
    })
  }

  if (input.discountType !== undefined && input.discountType !== target.discountType) {
    updates.discountType = input.discountType
    before.discountType = target.discountType
    after.discountType = input.discountType
  }
  if (input.discountValue !== undefined && input.discountValue !== Number(target.discountValue)) {
    updates.discountValue = input.discountValue
    before.discountValue = Number(target.discountValue)
    after.discountValue = input.discountValue
  }
  if (input.minQty !== undefined && input.minQty !== target.minQty) {
    updates.minQty = input.minQty
    before.minQty = target.minQty
    after.minQty = input.minQty
  }
  if (input.effectiveFrom !== undefined && (input.effectiveFrom ?? null) !== target.effectiveFrom) {
    updates.effectiveFrom = input.effectiveFrom ?? null
    before.effectiveFrom = target.effectiveFrom
    after.effectiveFrom = input.effectiveFrom ?? null
  }
  if (input.effectiveTo !== undefined && (input.effectiveTo ?? null) !== target.effectiveTo) {
    updates.effectiveTo = input.effectiveTo ?? null
    before.effectiveTo = target.effectiveTo
    after.effectiveTo = input.effectiveTo ?? null
  }
  if (input.isActive !== undefined && input.isActive !== target.isActive) {
    updates.isActive = input.isActive
    before.isActive = target.isActive
    after.isActive = input.isActive
  }
  if (input.note !== undefined && (input.note ?? null) !== target.note) {
    updates.note = input.note ?? null
    before.note = target.note
    after.note = input.note ?? null
  }

  if (Object.keys(updates).length === 0) {
    return getCategoryDiscount({ db, storeId: actor.storeId, id })
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(categoryDiscounts)
      .set(updates)
      .where(and(eq(categoryDiscounts.id, id), eq(categoryDiscounts.storeId, actor.storeId)))
      .returning({ id: categoryDiscounts.id })
    if (!row) {
      throw new ApiError('INTERNAL_ERROR', 'Không cập nhật được chiết khấu danh mục')
    }

    const fieldDiff = diffObjects(before, after)
    if (Object.keys(fieldDiff).length > 0) {
      await logAction({
        db: tx as unknown as Db,
        storeId: actor.storeId,
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'category_discount.updated',
        targetType: 'category_discount',
        targetId: id,
        changes: fieldDiff,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      })
    }

    const updated = await getCategoryDiscountRow({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      id,
      today: new Date(),
    })
    if (!updated) {
      throw new ApiError('INTERNAL_ERROR', 'Không lấy được chiết khấu vừa cập nhật')
    }
    return updated
  })
}

export interface DeleteCategoryDiscountDeps {
  db: Db
  actor: CategoryDiscountsActor
  id: string
  meta?: RequestMeta
}

export async function deleteCategoryDiscount({
  db,
  actor,
  id,
  meta,
}: DeleteCategoryDiscountDeps): Promise<{ ok: true }> {
  const target = await db.query.categoryDiscounts.findFirst({
    where: eq(categoryDiscounts.id, id),
  })
  if (!target || target.storeId !== actor.storeId) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy chiết khấu danh mục')
  }

  return db.transaction(async (tx) => {
    await tx.delete(categoryDiscounts).where(eq(categoryDiscounts.id, id))

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'category_discount.deleted',
      targetType: 'category_discount',
      targetId: id,
      changes: {
        categoryId: target.categoryId,
        customerId: target.customerId,
        customerGroupId: target.customerGroupId,
        discountType: target.discountType,
        discountValue: Number(target.discountValue),
        minQty: target.minQty,
        effectiveFrom: target.effectiveFrom,
        effectiveTo: target.effectiveTo,
        isActive: target.isActive,
        note: target.note,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    return { ok: true as const }
  })
}

export interface FindApplicableCategoryDiscountInput {
  db: Db
  storeId: string
  productId: string
  customerId?: string | null
  customerGroupId?: string | null
  quantity: number
  date?: Date
}

export interface CategoryDiscountResolved {
  discountId: string
  discountType: CategoryDiscountType
  discountValue: number
  finalPrice: number
}

function applyDiscount(basePrice: number, type: CategoryDiscountType, value: number): number {
  if (type === 'percent') {
    return Math.round((basePrice * value) / 100)
  }
  return value
}

export async function findApplicableCategoryDiscount({
  db,
  storeId,
  productId,
  customerId,
  customerGroupId,
  quantity,
  date = new Date(),
  basePrice,
}: FindApplicableCategoryDiscountInput & {
  basePrice?: number
}): Promise<CategoryDiscountResolved | null> {
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
  })
  if (!product || product.storeId !== storeId || !product.categoryId) return null

  const todayStr = toIsoDate(date)
  const conditions: SQL[] = [
    eq(categoryDiscounts.storeId, storeId),
    eq(categoryDiscounts.categoryId, product.categoryId),
    eq(categoryDiscounts.isActive, true),
    sql`${categoryDiscounts.minQty} <= ${quantity}`,
    sql`(${categoryDiscounts.effectiveFrom} IS NULL OR ${categoryDiscounts.effectiveFrom} <= ${todayStr})`,
    sql`(${categoryDiscounts.effectiveTo} IS NULL OR ${categoryDiscounts.effectiveTo} >= ${todayStr})`,
  ]

  if (customerId && customerGroupId) {
    conditions.push(
      sql`(${categoryDiscounts.customerId} = ${customerId} OR ${categoryDiscounts.customerGroupId} = ${customerGroupId})`,
    )
  } else if (customerId) {
    conditions.push(eq(categoryDiscounts.customerId, customerId))
  } else if (customerGroupId) {
    conditions.push(eq(categoryDiscounts.customerGroupId, customerGroupId))
  } else {
    return null
  }

  const rows = await db
    .select({
      id: categoryDiscounts.id,
      customerId: categoryDiscounts.customerId,
      customerGroupId: categoryDiscounts.customerGroupId,
      discountType: categoryDiscounts.discountType,
      discountValue: categoryDiscounts.discountValue,
    })
    .from(categoryDiscounts)
    .where(and(...conditions))
    .orderBy(
      desc(sql`(${categoryDiscounts.customerId} IS NOT NULL)::int`),
      desc(categoryDiscounts.discountValue),
      asc(categoryDiscounts.id),
    )
    .limit(1)

  const winner = rows[0]
  if (!winner) return null

  const baseSellingPrice = basePrice ?? Number(product.sellingPrice)
  const discountType = winner.discountType as CategoryDiscountType
  const discountAmount = applyDiscount(baseSellingPrice, discountType, Number(winner.discountValue))

  return {
    discountId: winner.id,
    discountType,
    discountValue: Number(winner.discountValue),
    finalPrice: Math.max(0, baseSellingPrice - discountAmount),
  }
}

// Avoid unused import warning when isNull helper not used
void isNull

import { and, eq, inArray, isNull, sql } from 'drizzle-orm'

import {
  categories,
  type CategoryItem,
  type CreateCategoryInput,
  products,
  type ReorderCategoriesInput,
  type UpdateCategoryInput,
  type UserRole,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { diffObjects, logAction, type RequestMeta } from './audit.service.js'

export interface CategoriesActor {
  userId: string
  storeId: string
  role: UserRole
}

function toCategoryItem(row: typeof categories.$inferSelect): CategoryItem {
  return {
    id: row.id,
    storeId: row.storeId,
    name: row.name,
    parentId: row.parentId,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function unwrapDriverError(err: unknown): unknown {
  // Drizzle wraps PG errors in DrizzleQueryError; gốc nằm ở `cause`
  let current: unknown = err
  for (let i = 0; i < 5; i++) {
    if (!current || typeof current !== 'object') break
    if ('code' in current || 'constraint_name' in current || 'constraint' in current) return current
    if ('cause' in current) {
      current = (current as { cause: unknown }).cause
      continue
    }
    break
  }
  return current
}

function getPgErrorCode(err: unknown): string | undefined {
  const unwrapped = unwrapDriverError(err)
  if (unwrapped && typeof unwrapped === 'object' && 'code' in unwrapped) {
    const code = (unwrapped as { code: unknown }).code
    if (typeof code === 'string') return code
  }
  return undefined
}

function getPgConstraint(err: unknown): string | undefined {
  const unwrapped = unwrapDriverError(err)
  if (unwrapped && typeof unwrapped === 'object' && 'constraint_name' in unwrapped) {
    const name = (unwrapped as { constraint_name: unknown }).constraint_name
    if (typeof name === 'string') return name
  }
  if (unwrapped && typeof unwrapped === 'object' && 'constraint' in unwrapped) {
    const name = (unwrapped as { constraint: unknown }).constraint
    if (typeof name === 'string') return name
  }
  return undefined
}

function isUniqueNameViolation(err: unknown): boolean {
  if (getPgErrorCode(err) !== '23505') return false
  const constraint = getPgConstraint(err)
  return constraint === 'uniq_categories_store_parent_name'
}

type FkViolationKind = 'self-parent' | 'other' | null

function classifyFkViolation(err: unknown): FkViolationKind {
  if (getPgErrorCode(err) !== '23503') return null
  const constraint = getPgConstraint(err)
  // self-ref FK (parent → categories.id): còn danh mục con đang trỏ vào
  if (constraint === 'categories_parent_id_fkey') return 'self-parent'
  // FK khác (vd Story 2.2 products.category_id → categories.id): chứa sản phẩm
  return 'other'
}

export interface ListCategoriesDeps {
  db: Db
  storeId: string
}

export async function listCategories({ db, storeId }: ListCategoriesDeps): Promise<CategoryItem[]> {
  const rows = await db.query.categories.findMany({
    where: eq(categories.storeId, storeId),
  })
  // sort: parentId NULLS FIRST, sortOrder ASC, name ASC
  const sorted = [...rows].sort((a, b) => {
    const aRoot = a.parentId === null ? 0 : 1
    const bRoot = b.parentId === null ? 0 : 1
    if (aRoot !== bRoot) return aRoot - bRoot
    if (a.parentId !== b.parentId) {
      return (a.parentId ?? '').localeCompare(b.parentId ?? '')
    }
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.name.localeCompare(b.name, 'vi')
  })
  return sorted.map(toCategoryItem)
}

async function ensureParentValid({
  db,
  storeId,
  parentId,
}: {
  db: Db
  storeId: string
  parentId: string
}): Promise<typeof categories.$inferSelect> {
  const parent = await db.query.categories.findFirst({
    where: eq(categories.id, parentId),
  })
  if (!parent || parent.storeId !== storeId) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy danh mục cha')
  }
  if (parent.parentId !== null) {
    throw new ApiError('BUSINESS_RULE_VIOLATION', 'Không thể tạo danh mục cấp 3')
  }
  return parent
}

async function ensureNameUnique({
  db,
  storeId,
  parentId,
  name,
  excludeId,
}: {
  db: Db
  storeId: string
  parentId: string | null
  name: string
  excludeId?: string
}): Promise<void> {
  const lower = name.toLowerCase()
  const baseConds =
    parentId === null
      ? and(eq(categories.storeId, storeId), isNull(categories.parentId))
      : and(eq(categories.storeId, storeId), eq(categories.parentId, parentId))
  const rows = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(baseConds)
  for (const row of rows) {
    if (excludeId && row.id === excludeId) continue
    if (row.name.toLowerCase() === lower) {
      throw new ApiError('CONFLICT', 'Tên danh mục đã tồn tại trong cùng cấp', { field: 'name' })
    }
  }
}

async function nextSortOrder({
  db,
  storeId,
  parentId,
}: {
  db: Db
  storeId: string
  parentId: string | null
}): Promise<number> {
  const rows = await db
    .select({ max: sql<number | null>`MAX(${categories.sortOrder})::int` })
    .from(categories)
    .where(
      parentId === null
        ? and(eq(categories.storeId, storeId), isNull(categories.parentId))
        : and(eq(categories.storeId, storeId), eq(categories.parentId, parentId)),
    )
  const max = rows[0]?.max
  return (max ?? -1) + 1
}

export interface CreateCategoryDeps {
  db: Db
  actor: CategoriesActor
  input: CreateCategoryInput
  meta?: RequestMeta
}

export async function createCategory({
  db,
  actor,
  input,
  meta,
}: CreateCategoryDeps): Promise<CategoryItem> {
  const parentId = input.parentId ?? null

  if (parentId !== null) {
    await ensureParentValid({ db, storeId: actor.storeId, parentId })
  }

  await ensureNameUnique({
    db,
    storeId: actor.storeId,
    parentId,
    name: input.name,
  })

  return db.transaction(async (tx) => {
    const sortOrder = await nextSortOrder({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      parentId,
    })

    let created: typeof categories.$inferSelect
    try {
      const [row] = await tx
        .insert(categories)
        .values({
          storeId: actor.storeId,
          name: input.name,
          parentId,
          sortOrder,
        })
        .returning()

      if (!row) {
        throw new ApiError('INTERNAL_ERROR', 'Không tạo được danh mục')
      }
      created = row
    } catch (err) {
      if (err instanceof ApiError) throw err
      if (isUniqueNameViolation(err)) {
        throw new ApiError('CONFLICT', 'Tên danh mục đã tồn tại trong cùng cấp', { field: 'name' })
      }
      throw err
    }

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'category.created',
      targetType: 'category',
      targetId: created.id,
      changes: { name: input.name, parentId },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    return toCategoryItem(created)
  })
}

export interface UpdateCategoryDeps {
  db: Db
  actor: CategoriesActor
  targetId: string
  input: UpdateCategoryInput
  meta?: RequestMeta
}

export async function updateCategory({
  db,
  actor,
  targetId,
  input,
  meta,
}: UpdateCategoryDeps): Promise<CategoryItem> {
  const target = await db.query.categories.findFirst({
    where: eq(categories.id, targetId),
  })
  if (!target || target.storeId !== actor.storeId) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy danh mục')
  }

  const updates: Partial<typeof categories.$inferInsert> = {}
  let sortOrderChanged = false

  if (input.parentId !== undefined) {
    if (input.parentId === targetId) {
      throw new ApiError('BUSINESS_RULE_VIOLATION', 'Không thể đặt danh mục làm cha của chính nó')
    }
    if (input.parentId !== null) {
      // parent mới phải tồn tại + cùng store + là cấp 1
      await ensureParentValid({ db, storeId: actor.storeId, parentId: input.parentId })

      // nếu target hiện đang có con (target là cấp 1) → không thể chuyển xuống cấp 2
      const childCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(categories)
        .where(eq(categories.parentId, target.id))
      if ((childCount[0]?.count ?? 0) > 0) {
        throw new ApiError(
          'BUSINESS_RULE_VIOLATION',
          'Danh mục có danh mục con không thể chuyển thành cấp 2',
        )
      }
    }

    if (input.parentId !== target.parentId) {
      updates.parentId = input.parentId
      sortOrderChanged = true
    }
  }

  if (input.name !== undefined && input.name !== target.name) {
    updates.name = input.name
  }

  // Nếu name đổi hoặc parent đổi → kiểm tra trùng tên trong (store, parent) mới
  if (updates.name !== undefined || updates.parentId !== undefined) {
    const finalName = updates.name ?? target.name
    const finalParent =
      updates.parentId !== undefined ? (updates.parentId as string | null) : target.parentId
    await ensureNameUnique({
      db,
      storeId: actor.storeId,
      parentId: finalParent,
      name: finalName,
      excludeId: target.id,
    })
  }

  const before = { name: target.name, parentId: target.parentId, sortOrder: target.sortOrder }
  const after = {
    name: input.name ?? target.name,
    parentId: input.parentId !== undefined ? input.parentId : target.parentId,
    sortOrder: target.sortOrder,
  }

  if (Object.keys(updates).length === 0) {
    return toCategoryItem(target)
  }

  return db.transaction(async (tx) => {
    if (sortOrderChanged) {
      const newSort = await nextSortOrder({
        db: tx as unknown as Db,
        storeId: actor.storeId,
        parentId: updates.parentId ?? null,
      })
      updates.sortOrder = newSort
      after.sortOrder = newSort
    }

    let updated: typeof categories.$inferSelect
    try {
      const [row] = await tx
        .update(categories)
        .set(updates)
        .where(eq(categories.id, targetId))
        .returning()

      if (!row) {
        throw new ApiError('INTERNAL_ERROR', 'Không cập nhật được danh mục')
      }
      updated = row
    } catch (err) {
      if (err instanceof ApiError) throw err
      if (isUniqueNameViolation(err)) {
        throw new ApiError('CONFLICT', 'Tên danh mục đã tồn tại trong cùng cấp', { field: 'name' })
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
        action: 'category.updated',
        targetType: 'category',
        targetId,
        changes: fieldDiff,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      })
    }

    return toCategoryItem(updated)
  })
}

export interface ReorderCategoriesDeps {
  db: Db
  actor: CategoriesActor
  input: ReorderCategoriesInput
  meta?: RequestMeta
}

export async function reorderCategories({
  db,
  actor,
  input,
  meta,
}: ReorderCategoriesDeps): Promise<{ ok: true }> {
  const { parentId, orderedIds } = input

  // validate: tất cả id thuộc store và cùng parentId
  const rows = await db.query.categories.findMany({
    where: inArray(categories.id, orderedIds),
  })

  if (rows.length !== orderedIds.length) {
    throw new ApiError('BUSINESS_RULE_VIOLATION', 'Có danh mục không tồn tại hoặc khác cửa hàng')
  }

  for (const row of rows) {
    if (row.storeId !== actor.storeId) {
      throw new ApiError('BUSINESS_RULE_VIOLATION', 'Có danh mục không tồn tại hoặc khác cửa hàng')
    }
    if (row.parentId !== parentId) {
      throw new ApiError('BUSINESS_RULE_VIOLATION', 'Chỉ được sắp xếp các danh mục cùng cấp')
    }
  }

  return db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i]!
      await tx.update(categories).set({ sortOrder: i }).where(eq(categories.id, id))
    }

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'category.reordered',
      targetType: 'category',
      targetId: undefined,
      changes: { parentId, orderedIds },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    return { ok: true as const }
  })
}

export interface DeleteCategoryDeps {
  db: Db
  actor: CategoriesActor
  targetId: string
  meta?: RequestMeta
}

export async function deleteCategory({
  db,
  actor,
  targetId,
  meta,
}: DeleteCategoryDeps): Promise<{ ok: true }> {
  const target = await db.query.categories.findFirst({
    where: eq(categories.id, targetId),
  })
  if (!target || target.storeId !== actor.storeId) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy danh mục')
  }

  // Nếu là cấp 1 và có con
  if (target.parentId === null) {
    const childCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(categories)
      .where(eq(categories.parentId, targetId))
    if ((childCount[0]?.count ?? 0) > 0) {
      throw new ApiError('BUSINESS_RULE_VIOLATION', 'Vui lòng xoá danh mục con trước')
    }
  }

  // Story 2.2: đếm chính xác số sản phẩm sống đang gán vào danh mục
  const productCountRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(and(eq(products.categoryId, targetId), isNull(products.deletedAt)))
  const productCount = productCountRows[0]?.count ?? 0
  if (productCount > 0) {
    throw new ApiError(
      'BUSINESS_RULE_VIOLATION',
      `Danh mục đang chứa ${productCount} sản phẩm, không thể xoá`,
    )
  }

  // Defense-in-depth: nếu race condition giữa count và delete xảy ra, FK violation 23503 vẫn được catch ở dưới

  return db.transaction(async (tx) => {
    try {
      const [deleted] = await tx.delete(categories).where(eq(categories.id, targetId)).returning()
      if (!deleted) {
        throw new ApiError('INTERNAL_ERROR', 'Không xoá được danh mục')
      }
    } catch (err) {
      if (err instanceof ApiError) throw err
      const fkKind = classifyFkViolation(err)
      if (fkKind === 'self-parent') {
        throw new ApiError('BUSINESS_RULE_VIOLATION', 'Vui lòng xoá danh mục con trước')
      }
      if (fkKind === 'other') {
        throw new ApiError('BUSINESS_RULE_VIOLATION', 'Danh mục đang chứa sản phẩm, không thể xoá')
      }
      throw err
    }

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'category.deleted',
      targetType: 'category',
      targetId,
      changes: {
        name: target.name,
        parentId: target.parentId,
        sortOrder: target.sortOrder,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    return { ok: true as const }
  })
}

export { toCategoryItem }

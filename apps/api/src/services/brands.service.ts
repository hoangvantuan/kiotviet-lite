import { and, asc, eq, ilike, isNotNull, isNull, ne, sql } from 'drizzle-orm'

import {
  type BrandItem,
  brands,
  type CreateBrandInput,
  type ListBrandsQuery,
  type UpdateBrandInput,
  type UserRole,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { isUniqueViolation } from '../lib/pg-errors.js'
import { escapeLikePattern } from '../lib/strings.js'
import { logAction, type RequestMeta } from './audit.service.js'

const NAME_CONSTRAINT = 'uniq_brands_store_name_alive'
const NAME_CONFLICT = 'Tên thương hiệu đã được sử dụng'

export interface BrandsActor {
  userId: string
  storeId: string
  role: UserRole
}

export interface BrandMutationDeps {
  db: Db
  actor: BrandsActor
  meta?: RequestMeta
}

export interface BrandTargetDeps extends BrandMutationDeps {
  targetId: string
}

export interface BrandListResult {
  items: BrandItem[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

function toBrandItem(row: typeof brands.$inferSelect): BrandItem {
  return {
    id: row.id,
    storeId: row.storeId,
    name: row.name,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function ensureNameAvailable(db: Db, storeId: string, name: string, excludeId?: string) {
  const occupied = await db
    .select({ id: brands.id })
    .from(brands)
    .where(
      and(
        eq(brands.storeId, storeId),
        isNull(brands.deletedAt),
        sql`LOWER(${brands.name}) = LOWER(${name})`,
        excludeId ? ne(brands.id, excludeId) : undefined,
      ),
    )
    .limit(1)
  if (occupied.length) throw new ApiError('CONFLICT', NAME_CONFLICT, { field: 'name' })
}

function rethrowNameConflict(error: unknown): never {
  if (isUniqueViolation(error, NAME_CONSTRAINT)) {
    throw new ApiError('CONFLICT', NAME_CONFLICT, { field: 'name' })
  }
  throw error
}

export async function listBrands({
  db,
  storeId,
  query,
}: {
  db: Db
  storeId: string
  query: ListBrandsQuery
}): Promise<BrandListResult> {
  const { page, pageSize, search, status } = query
  const pattern = search ? `%${escapeLikePattern(search)}%` : undefined
  const where = and(
    eq(brands.storeId, storeId),
    status === 'trashed' ? isNotNull(brands.deletedAt) : isNull(brands.deletedAt),
    pattern ? ilike(brands.name, pattern) : undefined,
  )
  const [rows, counts] = await Promise.all([
    db
      .select()
      .from(brands)
      .where(where)
      .orderBy(asc(brands.name), asc(brands.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(brands)
      .where(where),
  ])
  const total = counts[0]?.total ?? 0
  return {
    items: rows.map(toBrandItem),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  }
}

export async function createBrand({
  db,
  actor,
  input,
  meta,
}: BrandMutationDeps & { input: CreateBrandInput }): Promise<BrandItem> {
  await ensureNameAvailable(db, actor.storeId, input.name)
  return db.transaction(async (tx) => {
    let row: typeof brands.$inferSelect
    try {
      const [created] = await tx
        .insert(brands)
        .values({ storeId: actor.storeId, name: input.name })
        .returning()
      if (!created) throw new ApiError('INTERNAL_ERROR', 'Không tạo được thương hiệu')
      row = created
    } catch (error) {
      rethrowNameConflict(error)
    }
    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'brand.created',
      targetType: 'brand',
      targetId: row.id,
      changes: { name: row.name },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })
    return toBrandItem(row)
  })
}

export async function updateBrand({
  db,
  actor,
  targetId,
  input,
  meta,
}: BrandTargetDeps & { input: UpdateBrandInput }): Promise<BrandItem> {
  const target = await db.query.brands.findFirst({
    where: and(
      eq(brands.id, targetId),
      eq(brands.storeId, actor.storeId),
      isNull(brands.deletedAt),
    ),
  })
  if (!target) throw new ApiError('NOT_FOUND', 'Không tìm thấy thương hiệu')
  if (target.name === input.name) return toBrandItem(target)
  await ensureNameAvailable(db, actor.storeId, input.name, targetId)
  return db.transaction(async (tx) => {
    let row: typeof brands.$inferSelect
    try {
      const [updated] = await tx
        .update(brands)
        .set({ name: input.name })
        .where(
          and(eq(brands.id, targetId), eq(brands.storeId, actor.storeId), isNull(brands.deletedAt)),
        )
        .returning()
      if (!updated) throw new ApiError('NOT_FOUND', 'Không tìm thấy thương hiệu')
      row = updated
    } catch (error) {
      rethrowNameConflict(error)
    }
    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'brand.updated',
      targetType: 'brand',
      targetId,
      changes: { name: { before: target.name, after: row.name } },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })
    return toBrandItem(row)
  })
}

export async function deleteBrand({
  db,
  actor,
  targetId,
  meta,
}: BrandTargetDeps): Promise<{ ok: true }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(brands)
      .set({ deletedAt: new Date() })
      .where(
        and(eq(brands.id, targetId), eq(brands.storeId, actor.storeId), isNull(brands.deletedAt)),
      )
      .returning()
    if (!row) throw new ApiError('NOT_FOUND', 'Không tìm thấy thương hiệu')
    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'brand.deleted',
      targetType: 'brand',
      targetId,
      changes: { name: row.name },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })
    return { ok: true }
  })
}

export async function restoreBrand({
  db,
  actor,
  targetId,
  meta,
}: BrandTargetDeps): Promise<BrandItem> {
  const target = await db.query.brands.findFirst({
    where: and(
      eq(brands.id, targetId),
      eq(brands.storeId, actor.storeId),
      isNotNull(brands.deletedAt),
    ),
  })
  if (!target) throw new ApiError('NOT_FOUND', 'Không tìm thấy thương hiệu đã xoá')
  await ensureNameAvailable(db, actor.storeId, target.name)
  return db.transaction(async (tx) => {
    let row: typeof brands.$inferSelect
    try {
      const [restored] = await tx
        .update(brands)
        .set({ deletedAt: null })
        .where(
          and(
            eq(brands.id, targetId),
            eq(brands.storeId, actor.storeId),
            isNotNull(brands.deletedAt),
          ),
        )
        .returning()
      if (!restored) throw new ApiError('NOT_FOUND', 'Không tìm thấy thương hiệu đã xoá')
      row = restored
    } catch (error) {
      rethrowNameConflict(error)
    }
    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'brand.restored',
      targetType: 'brand',
      targetId,
      changes: { name: row.name },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })
    return toBrandItem(row)
  })
}

import {
  aliasedTable,
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  type SQL,
  sql,
} from 'drizzle-orm'

import {
  applyFormula,
  applyRounding,
  type CreatePriceListInput,
  customerGroups,
  type FormulaType,
  type ListPriceListsQuery,
  type PriceListDetail,
  priceListItems,
  type PriceListListItem,
  priceLists,
  products,
  type RoundingRule,
  type UpdatePriceListInput,
  type UserRole,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { isFkViolation, isUniqueViolation } from '../lib/pg-errors.js'
import { escapeLikePattern } from '../lib/strings.js'
import { diffObjects, logAction, type RequestMeta } from './audit.service.js'

export interface PriceListsActor {
  userId: string
  storeId: string
  role: UserRole
}

interface PriceListJoinRow {
  id: string
  storeId: string
  name: string
  description: string | null
  method: string
  basePriceListId: string | null
  baseName: string | null
  formulaType: string | null
  formulaValue: number | null
  roundingRule: string
  effectiveFrom: string | null
  effectiveTo: string | null
  isActive: boolean
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
  itemCount: number
}

function todayString(): string {
  const d = new Date()
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function computeEffectiveActive(row: PriceListJoinRow, today: string = todayString()): boolean {
  if (row.deletedAt !== null) return false
  if (!row.isActive) return false
  if (row.effectiveFrom !== null && today < row.effectiveFrom) return false
  if (row.effectiveTo !== null && today > row.effectiveTo) return false
  return true
}

function toPriceListListItem(row: PriceListJoinRow): PriceListListItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    method: row.method as 'direct' | 'formula',
    baseListId: row.basePriceListId,
    baseName: row.baseName,
    formulaType: row.formulaType as PriceListListItem['formulaType'],
    formulaValue: row.formulaValue === null ? null : Number(row.formulaValue),
    roundingRule: row.roundingRule as RoundingRule,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    isActive: row.isActive,
    effectiveActive: computeEffectiveActive(row),
    itemCount: Number(row.itemCount),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toPriceListDetail(row: PriceListJoinRow): PriceListDetail {
  return {
    ...toPriceListListItem(row),
    storeId: row.storeId,
    deletedAt: row.deletedAt === null ? null : row.deletedAt.toISOString(),
  }
}

const baseAlias = aliasedTable(priceLists, 'base')

function buildSelectColumns() {
  return {
    id: priceLists.id,
    storeId: priceLists.storeId,
    name: priceLists.name,
    description: priceLists.description,
    method: priceLists.method,
    basePriceListId: priceLists.basePriceListId,
    baseName: baseAlias.name,
    formulaType: priceLists.formulaType,
    formulaValue: priceLists.formulaValue,
    roundingRule: priceLists.roundingRule,
    effectiveFrom: priceLists.effectiveFrom,
    effectiveTo: priceLists.effectiveTo,
    isActive: priceLists.isActive,
    deletedAt: priceLists.deletedAt,
    createdAt: priceLists.createdAt,
    updatedAt: priceLists.updatedAt,
    itemCount: sql<number>`(
      SELECT COUNT(*)::int FROM ${priceListItems}
      WHERE ${priceListItems.priceListId} = ${priceLists.id}
    )`,
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
    eq(priceLists.storeId, storeId),
    sql`LOWER(${priceLists.name}) = LOWER(${name})`,
    isNull(priceLists.deletedAt),
  ]
  if (excludeId) {
    conditions.push(sql`${priceLists.id} != ${excludeId}`)
  }
  const rows = await db
    .select({ id: priceLists.id })
    .from(priceLists)
    .where(and(...conditions))
    .limit(1)
  if (rows.length > 0) {
    throw new ApiError('CONFLICT', 'Tên bảng giá đã được sử dụng', { field: 'name' })
  }
}

export interface ListPriceListsDeps {
  db: Db
  storeId: string
  query: ListPriceListsQuery
}

export interface PriceListListResult {
  items: PriceListListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export async function listPriceLists({
  db,
  storeId,
  query,
}: ListPriceListsDeps): Promise<PriceListListResult> {
  const { page, pageSize, search, method, status } = query
  const today = todayString()

  const conditions: SQL[] = [eq(priceLists.storeId, storeId), isNull(priceLists.deletedAt)]

  const trimmed = search?.trim()
  if (trimmed) {
    const escaped = escapeLikePattern(trimmed)
    const pattern = `%${escaped}%`
    conditions.push(sql`LOWER(${priceLists.name}) LIKE LOWER(${pattern})`)
  }

  if (method) {
    conditions.push(eq(priceLists.method, method))
  }

  if (status === 'effective') {
    conditions.push(eq(priceLists.isActive, true))
    conditions.push(
      sql`(${priceLists.effectiveFrom} IS NULL OR ${priceLists.effectiveFrom} <= ${today}::date)`,
    )
    conditions.push(
      sql`(${priceLists.effectiveTo} IS NULL OR ${priceLists.effectiveTo} >= ${today}::date)`,
    )
  } else if (status === 'inactive') {
    conditions.push(eq(priceLists.isActive, false))
  } else if (status === 'expired') {
    conditions.push(isNotNull(priceLists.effectiveTo))
    conditions.push(sql`${priceLists.effectiveTo} < ${today}::date`)
  } else if (status === 'pending') {
    conditions.push(isNotNull(priceLists.effectiveFrom))
    conditions.push(sql`${priceLists.effectiveFrom} > ${today}::date`)
  }

  const whereClause = and(...conditions)

  const offset = (page - 1) * pageSize

  const rows = await db
    .select(buildSelectColumns())
    .from(priceLists)
    .leftJoin(baseAlias, eq(priceLists.basePriceListId, baseAlias.id))
    .where(whereClause)
    .orderBy(desc(priceLists.createdAt), asc(priceLists.name))
    .limit(pageSize)
    .offset(offset)

  const totalRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(priceLists)
    .where(whereClause)

  const total = totalRows[0]?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return {
    items: rows.map((row) => toPriceListListItem(row as PriceListJoinRow)),
    total,
    page,
    pageSize,
    totalPages,
  }
}

export interface ListTrashedPriceListsDeps {
  db: Db
  storeId: string
  page: number
  pageSize: number
}

export async function listTrashedPriceLists({
  db,
  storeId,
  page,
  pageSize,
}: ListTrashedPriceListsDeps): Promise<PriceListListResult> {
  const whereClause = and(eq(priceLists.storeId, storeId), isNotNull(priceLists.deletedAt))

  const offset = (page - 1) * pageSize

  const rows = await db
    .select(buildSelectColumns())
    .from(priceLists)
    .leftJoin(baseAlias, eq(priceLists.basePriceListId, baseAlias.id))
    .where(whereClause)
    .orderBy(desc(priceLists.deletedAt))
    .limit(pageSize)
    .offset(offset)

  const totalRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(priceLists)
    .where(whereClause)

  const total = totalRows[0]?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return {
    items: rows.map((row) => toPriceListListItem(row as PriceListJoinRow)),
    total,
    page,
    pageSize,
    totalPages,
  }
}

export interface GetPriceListDeps {
  db: Db
  storeId: string
  targetId: string
  includeDeleted?: boolean
}

export async function getPriceList({
  db,
  storeId,
  targetId,
  includeDeleted = false,
}: GetPriceListDeps): Promise<PriceListDetail> {
  const conditions: SQL[] = [eq(priceLists.id, targetId), eq(priceLists.storeId, storeId)]
  if (!includeDeleted) {
    conditions.push(isNull(priceLists.deletedAt))
  }

  const rows = await db
    .select(buildSelectColumns())
    .from(priceLists)
    .leftJoin(baseAlias, eq(priceLists.basePriceListId, baseAlias.id))
    .where(and(...conditions))
    .limit(1)

  const row = rows[0] as PriceListJoinRow | undefined
  if (!row) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy bảng giá')
  }
  return toPriceListDetail(row)
}

async function validateProductsAlive({
  db,
  storeId,
  productIds,
}: {
  db: Db
  storeId: string
  productIds: string[]
}): Promise<void> {
  if (productIds.length === 0) return
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(
      and(
        eq(products.storeId, storeId),
        inArray(products.id, productIds),
        isNull(products.deletedAt),
      ),
    )
  const found = new Set(rows.map((r) => r.id))
  const missing = productIds.filter((id) => !found.has(id))
  if (missing.length > 0) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'Một hoặc nhiều sản phẩm không hợp lệ hoặc không cùng cửa hàng',
      {
        field: 'items',
        missing,
      },
    )
  }
}

function detectDuplicateProducts(items: { productId: string }[]): string | null {
  const seen = new Set<string>()
  for (const it of items) {
    if (seen.has(it.productId)) return it.productId
    seen.add(it.productId)
  }
  return null
}

export interface CreatePriceListDeps {
  db: Db
  actor: PriceListsActor
  input: CreatePriceListInput
  meta?: RequestMeta
}

export async function createPriceList({
  db,
  actor,
  input,
  meta,
}: CreatePriceListDeps): Promise<PriceListDetail> {
  await ensureNameUnique({ db, storeId: actor.storeId, name: input.name })

  if (input.method === 'direct') {
    const dup = detectDuplicateProducts(input.items)
    if (dup) {
      throw new ApiError('VALIDATION_ERROR', 'Sản phẩm bị trùng trong danh sách giá', {
        field: 'items',
        productId: dup,
      })
    }
    await validateProductsAlive({
      db,
      storeId: actor.storeId,
      productIds: input.items.map((i) => i.productId),
    })

    return db.transaction(async (tx) => {
      let createdId: string
      try {
        const [row] = await tx
          .insert(priceLists)
          .values({
            storeId: actor.storeId,
            name: input.name,
            description: input.description ?? null,
            method: 'direct',
            basePriceListId: null,
            formulaType: null,
            formulaValue: null,
            roundingRule: input.roundingRule,
            effectiveFrom: input.effectiveFrom ?? null,
            effectiveTo: input.effectiveTo ?? null,
            isActive: input.isActive,
          })
          .returning({ id: priceLists.id })
        if (!row) throw new ApiError('INTERNAL_ERROR', 'Không tạo được bảng giá')
        createdId = row.id
      } catch (err) {
        if (err instanceof ApiError) throw err
        if (isUniqueViolation(err, 'uniq_price_lists_store_name_alive')) {
          throw new ApiError('CONFLICT', 'Tên bảng giá đã được sử dụng', { field: 'name' })
        }
        throw err
      }

      if (input.items.length > 0) {
        await tx.insert(priceListItems).values(
          input.items.map((it) => ({
            priceListId: createdId,
            productId: it.productId,
            price: applyRounding(it.price, input.roundingRule),
            isOverridden: false,
          })),
        )
      }

      await logAction({
        db: tx as unknown as Db,
        storeId: actor.storeId,
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'price_list.created',
        targetType: 'price_list',
        targetId: createdId,
        changes: {
          name: input.name,
          method: 'direct',
          itemCount: input.items.length,
          effectiveFrom: input.effectiveFrom ?? null,
          effectiveTo: input.effectiveTo ?? null,
          isActive: input.isActive,
          roundingRule: input.roundingRule,
        },
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      })

      return getPriceList({
        db: tx as unknown as Db,
        storeId: actor.storeId,
        targetId: createdId,
      })
    })
  }

  // ===== formula =====
  const baseList = await db.query.priceLists.findFirst({
    where: eq(priceLists.id, input.baseListId),
  })
  if (!baseList || baseList.storeId !== actor.storeId || baseList.deletedAt !== null) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy bảng giá nền')
  }
  if (baseList.method !== 'direct') {
    throw new ApiError(
      'BUSINESS_RULE_VIOLATION',
      "Bảng giá nền phải có phương thức 'direct'. Bảng giá nối chuỗi sẽ hỗ trợ ở Story 4.3b",
    )
  }

  const overrideDup = detectDuplicateProducts(input.overrides)
  if (overrideDup) {
    throw new ApiError('VALIDATION_ERROR', 'Sản phẩm bị trùng trong danh sách override', {
      field: 'overrides',
      productId: overrideDup,
    })
  }
  await validateProductsAlive({
    db,
    storeId: actor.storeId,
    productIds: input.overrides.map((o) => o.productId),
  })

  return db.transaction(async (tx) => {
    const baseItems = await tx
      .select({ productId: priceListItems.productId, price: priceListItems.price })
      .from(priceListItems)
      .where(eq(priceListItems.priceListId, input.baseListId))

    const overrideMap = new Map(input.overrides.map((o) => [o.productId, o.price]))
    const productIdsAccumulated = new Set<string>()
    const itemsToInsert: { productId: string; price: number; isOverridden: boolean }[] = []

    for (const baseItem of baseItems) {
      productIdsAccumulated.add(baseItem.productId)
      const override = overrideMap.get(baseItem.productId)
      if (override !== undefined) {
        itemsToInsert.push({ productId: baseItem.productId, price: override, isOverridden: true })
      } else {
        const computed = applyFormula(
          Number(baseItem.price),
          input.formulaType as FormulaType,
          input.formulaValue,
        )
        const final = Math.max(0, applyRounding(computed, input.roundingRule))
        itemsToInsert.push({ productId: baseItem.productId, price: final, isOverridden: false })
      }
    }

    for (const o of input.overrides) {
      if (!productIdsAccumulated.has(o.productId)) {
        itemsToInsert.push({ productId: o.productId, price: o.price, isOverridden: true })
        productIdsAccumulated.add(o.productId)
      }
    }

    let createdId: string
    try {
      const [row] = await tx
        .insert(priceLists)
        .values({
          storeId: actor.storeId,
          name: input.name,
          description: input.description ?? null,
          method: 'formula',
          basePriceListId: input.baseListId,
          formulaType: input.formulaType,
          formulaValue: input.formulaValue,
          roundingRule: input.roundingRule,
          effectiveFrom: input.effectiveFrom ?? null,
          effectiveTo: input.effectiveTo ?? null,
          isActive: input.isActive,
        })
        .returning({ id: priceLists.id })
      if (!row) throw new ApiError('INTERNAL_ERROR', 'Không tạo được bảng giá')
      createdId = row.id
    } catch (err) {
      if (err instanceof ApiError) throw err
      if (isUniqueViolation(err, 'uniq_price_lists_store_name_alive')) {
        throw new ApiError('CONFLICT', 'Tên bảng giá đã được sử dụng', { field: 'name' })
      }
      throw err
    }

    if (itemsToInsert.length > 0) {
      await tx.insert(priceListItems).values(
        itemsToInsert.map((it) => ({
          priceListId: createdId,
          productId: it.productId,
          price: it.price,
          isOverridden: it.isOverridden,
        })),
      )
    }

    const overrideCount = itemsToInsert.filter((it) => it.isOverridden).length

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'price_list.created',
      targetType: 'price_list',
      targetId: createdId,
      changes: {
        name: input.name,
        method: 'formula',
        baseListId: input.baseListId,
        formulaType: input.formulaType,
        formulaValue: input.formulaValue,
        roundingRule: input.roundingRule,
        itemCount: itemsToInsert.length,
        overrideCount,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    return getPriceList({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      targetId: createdId,
    })
  })
}

export interface UpdatePriceListDeps {
  db: Db
  actor: PriceListsActor
  targetId: string
  input: UpdatePriceListInput
  meta?: RequestMeta
}

export async function updatePriceList({
  db,
  actor,
  targetId,
  input,
  meta,
}: UpdatePriceListDeps): Promise<PriceListDetail> {
  const target = await db.query.priceLists.findFirst({
    where: eq(priceLists.id, targetId),
  })
  if (!target || target.storeId !== actor.storeId || target.deletedAt !== null) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy bảng giá')
  }

  const updates: Partial<typeof priceLists.$inferInsert> = {}
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}

  if (input.name !== undefined && input.name !== target.name) {
    await ensureNameUnique({
      db,
      storeId: actor.storeId,
      name: input.name,
      excludeId: targetId,
    })
    updates.name = input.name
    before.name = target.name
    after.name = input.name
  }
  if (input.description !== undefined && input.description !== target.description) {
    updates.description = input.description
    before.description = target.description
    after.description = input.description
  }
  if (input.roundingRule !== undefined && input.roundingRule !== target.roundingRule) {
    updates.roundingRule = input.roundingRule
    before.roundingRule = target.roundingRule
    after.roundingRule = input.roundingRule
  }

  // effectiveFrom & effectiveTo: validate after merging
  const nextEffectiveFrom =
    input.effectiveFrom !== undefined ? input.effectiveFrom : target.effectiveFrom
  const nextEffectiveTo = input.effectiveTo !== undefined ? input.effectiveTo : target.effectiveTo

  if (nextEffectiveFrom && nextEffectiveTo && nextEffectiveTo < nextEffectiveFrom) {
    throw new ApiError('VALIDATION_ERROR', 'Ngày kết thúc phải sau ngày bắt đầu', {
      field: 'effectiveTo',
    })
  }

  if (input.effectiveFrom !== undefined && input.effectiveFrom !== target.effectiveFrom) {
    updates.effectiveFrom = input.effectiveFrom
    before.effectiveFrom = target.effectiveFrom
    after.effectiveFrom = input.effectiveFrom
  }
  if (input.effectiveTo !== undefined && input.effectiveTo !== target.effectiveTo) {
    updates.effectiveTo = input.effectiveTo
    before.effectiveTo = target.effectiveTo
    after.effectiveTo = input.effectiveTo
  }
  if (input.isActive !== undefined && input.isActive !== target.isActive) {
    updates.isActive = input.isActive
    before.isActive = target.isActive
    after.isActive = input.isActive
  }

  if (Object.keys(updates).length === 0) {
    return getPriceList({ db, storeId: actor.storeId, targetId })
  }

  return db.transaction(async (tx) => {
    try {
      const [row] = await tx
        .update(priceLists)
        .set(updates)
        .where(eq(priceLists.id, targetId))
        .returning({ id: priceLists.id })
      if (!row) {
        throw new ApiError('INTERNAL_ERROR', 'Không cập nhật được bảng giá')
      }
    } catch (err) {
      if (err instanceof ApiError) throw err
      if (isUniqueViolation(err, 'uniq_price_lists_store_name_alive')) {
        throw new ApiError('CONFLICT', 'Tên bảng giá đã được sử dụng', { field: 'name' })
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
        action: 'price_list.updated',
        targetType: 'price_list',
        targetId,
        changes: fieldDiff,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      })
    }

    return getPriceList({ db: tx as unknown as Db, storeId: actor.storeId, targetId })
  })
}

export interface DeletePriceListDeps {
  db: Db
  actor: PriceListsActor
  targetId: string
  meta?: RequestMeta
}

export async function deletePriceList({
  db,
  actor,
  targetId,
  meta,
}: DeletePriceListDeps): Promise<{ ok: true }> {
  const target = await db.query.priceLists.findFirst({
    where: eq(priceLists.id, targetId),
  })
  if (!target || target.storeId !== actor.storeId || target.deletedAt !== null) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy bảng giá')
  }

  const groupRefs = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customerGroups)
    .where(and(eq(customerGroups.defaultPriceListId, targetId), isNull(customerGroups.deletedAt)))
  const groupRefCount = groupRefs[0]?.count ?? 0
  if (groupRefCount > 0) {
    throw new ApiError(
      'BUSINESS_RULE_VIOLATION',
      `Bảng giá đang được ${groupRefCount} nhóm khách hàng dùng làm mặc định, không thể xoá. Vui lòng đổi bảng giá mặc định của các nhóm trước`,
    )
  }

  return db.transaction(async (tx) => {
    try {
      const [row] = await tx
        .update(priceLists)
        .set({ deletedAt: new Date() })
        .where(eq(priceLists.id, targetId))
        .returning({ id: priceLists.id })
      if (!row) {
        throw new ApiError('INTERNAL_ERROR', 'Không xoá được bảng giá')
      }
    } catch (err) {
      if (err instanceof ApiError) throw err
      if (isFkViolation(err)) {
        throw new ApiError('BUSINESS_RULE_VIOLATION', 'Bảng giá đang được sử dụng, không thể xoá')
      }
      throw err
    }

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'price_list.deleted',
      targetType: 'price_list',
      targetId,
      changes: {
        name: target.name,
        method: target.method,
        baseListId: target.basePriceListId,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    return { ok: true as const }
  })
}

export interface RestorePriceListDeps {
  db: Db
  actor: PriceListsActor
  targetId: string
  meta?: RequestMeta
}

export async function restorePriceList({
  db,
  actor,
  targetId,
  meta,
}: RestorePriceListDeps): Promise<PriceListDetail> {
  const target = await db.query.priceLists.findFirst({
    where: eq(priceLists.id, targetId),
  })
  if (!target || target.storeId !== actor.storeId || target.deletedAt === null) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy bảng giá đã xoá')
  }

  await ensureNameUnique({ db, storeId: actor.storeId, name: target.name, excludeId: targetId })

  if (target.method === 'formula' && target.basePriceListId) {
    const base = await db.query.priceLists.findFirst({
      where: eq(priceLists.id, target.basePriceListId),
    })
    if (!base || base.deletedAt !== null) {
      throw new ApiError(
        'BUSINESS_RULE_VIOLATION',
        'Bảng giá nền đã bị xoá. Vui lòng khôi phục bảng giá nền trước hoặc tạo bảng giá mới',
      )
    }
  }

  return db.transaction(async (tx) => {
    try {
      const [row] = await tx
        .update(priceLists)
        .set({ deletedAt: null })
        .where(eq(priceLists.id, targetId))
        .returning({ id: priceLists.id })
      if (!row) {
        throw new ApiError('INTERNAL_ERROR', 'Không khôi phục được bảng giá')
      }
    } catch (err) {
      if (err instanceof ApiError) throw err
      if (isUniqueViolation(err, 'uniq_price_lists_store_name_alive')) {
        throw new ApiError(
          'CONFLICT',
          'Tên bảng giá đã được dùng cho bảng giá khác, vui lòng đổi tên trước khi khôi phục',
          { field: 'name' },
        )
      }
      throw err
    }

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'price_list.restored',
      targetType: 'price_list',
      targetId,
      changes: { name: target.name, method: target.method },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    return getPriceList({ db: tx as unknown as Db, storeId: actor.storeId, targetId })
  })
}

export interface RecalculatePriceListDeps {
  db: Db
  actor: PriceListsActor
  targetId: string
  meta?: RequestMeta
}

export interface RecalculateResult {
  updatedCount: number
  addedCount: number
  removedCount: number
  preservedOverrideCount: number
}

export async function recalculatePriceList({
  db,
  actor,
  targetId,
  meta,
}: RecalculatePriceListDeps): Promise<RecalculateResult> {
  const target = await db.query.priceLists.findFirst({
    where: eq(priceLists.id, targetId),
  })
  if (!target || target.storeId !== actor.storeId || target.deletedAt !== null) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy bảng giá')
  }
  if (target.method !== 'formula') {
    throw new ApiError('BUSINESS_RULE_VIOLATION', 'Chỉ bảng giá công thức mới có thể tính lại')
  }
  if (!target.basePriceListId || !target.formulaType || target.formulaValue === null) {
    throw new ApiError('INTERNAL_ERROR', 'Bảng giá thiếu thông tin công thức')
  }

  const base = await db.query.priceLists.findFirst({
    where: eq(priceLists.id, target.basePriceListId),
  })
  if (!base || base.deletedAt !== null) {
    throw new ApiError('BUSINESS_RULE_VIOLATION', 'Bảng giá nền không hợp lệ hoặc đã bị xoá')
  }

  const formulaType = target.formulaType as FormulaType
  const formulaValue = Number(target.formulaValue)
  const roundingRule = target.roundingRule as RoundingRule

  return db.transaction(async (tx) => {
    const baseItems = await tx
      .select({ productId: priceListItems.productId, price: priceListItems.price })
      .from(priceListItems)
      .where(eq(priceListItems.priceListId, target.basePriceListId as string))

    const existingItems = await tx
      .select({
        id: priceListItems.id,
        productId: priceListItems.productId,
        price: priceListItems.price,
        isOverridden: priceListItems.isOverridden,
      })
      .from(priceListItems)
      .where(eq(priceListItems.priceListId, targetId))

    const existingMap = new Map(existingItems.map((it) => [it.productId, it]))
    const baseMap = new Map(baseItems.map((it) => [it.productId, Number(it.price)]))

    let updatedCount = 0
    let addedCount = 0
    let removedCount = 0
    let preservedOverrideCount = 0

    const inserts: { productId: string; price: number; isOverridden: boolean }[] = []
    const updates: { id: string; price: number }[] = []
    const deletes: string[] = []

    for (const [productId, basePrice] of baseMap.entries()) {
      const computed = applyFormula(basePrice, formulaType, formulaValue)
      const final = Math.max(0, applyRounding(computed, roundingRule))
      const existing = existingMap.get(productId)
      if (!existing) {
        inserts.push({ productId, price: final, isOverridden: false })
        addedCount++
      } else if (existing.isOverridden) {
        preservedOverrideCount++
      } else if (Number(existing.price) !== final) {
        updates.push({ id: existing.id, price: final })
        updatedCount++
      }
    }

    for (const existing of existingItems) {
      if (!baseMap.has(existing.productId) && !existing.isOverridden) {
        deletes.push(existing.id)
        removedCount++
      }
    }

    if (inserts.length > 0) {
      await tx.insert(priceListItems).values(
        inserts.map((it) => ({
          priceListId: targetId,
          productId: it.productId,
          price: it.price,
          isOverridden: it.isOverridden,
        })),
      )
    }
    for (const u of updates) {
      await tx.update(priceListItems).set({ price: u.price }).where(eq(priceListItems.id, u.id))
    }
    if (deletes.length > 0) {
      await tx.delete(priceListItems).where(inArray(priceListItems.id, deletes))
    }

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'price_list.recalculated',
      targetType: 'price_list',
      targetId,
      changes: { updatedCount, addedCount, removedCount, preservedOverrideCount },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    return { updatedCount, addedCount, removedCount, preservedOverrideCount }
  })
}

// Re-export gte/lte/gt to silence unused warnings in case future need
export const _internal = { gte, lte, gt }

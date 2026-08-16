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
  type ClonePriceListInput,
  type ComparePriceListsResponse,
  computeCompareRow,
  computeCompareSummary,
  type CreatePriceListInput,
  customerGroups,
  type FormulaType,
  type ImportPriceListInput,
  type ImportPriceListSummary,
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
    method: row.method as 'direct' | 'formula' | 'chain',
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

function buildBaseSelectColumns() {
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
  }
}

function buildSelectColumns() {
  return {
    ...buildBaseSelectColumns(),
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

// Max 10 cấp tổng cộng (bao gồm cả bảng giá mới + tổ tiên).
const MAX_CHAIN_DEPTH = 10

async function validateChainDepth({
  db,
  storeId,
  baseListId,
  maxDepth = MAX_CHAIN_DEPTH,
}: {
  db: Db
  storeId: string
  baseListId: string
  maxDepth?: number
}): Promise<void> {
  const visited = new Set<string>()
  const path: string[] = []
  let currentId: string | null = baseListId
  let ancestorCount = 0
  while (currentId !== null) {
    if (visited.has(currentId)) {
      throw new ApiError(
        'BUSINESS_RULE_VIOLATION',
        `Phát hiện vòng lặp công thức: ${path.join(' -> ')}`,
      )
    }
    visited.add(currentId)
    const row: typeof priceLists.$inferSelect | undefined = await db.query.priceLists.findFirst({
      where: eq(priceLists.id, currentId),
    })
    if (!row || row.storeId !== storeId || row.deletedAt !== null) break
    path.push(row.name)
    ancestorCount++
    // ancestorCount + 1 = tổng số cấp khi tạo bảng mới (1 cho bảng mới + ancestors).
    if (ancestorCount + 1 > maxDepth) {
      throw new ApiError(
        'BUSINESS_RULE_VIOLATION',
        `Chuỗi công thức quá sâu (>${maxDepth} cấp), vui lòng đơn giản hoá`,
      )
    }
    currentId = row.basePriceListId
  }
}

async function resolveChainPrices({
  tx,
  storeId,
  listId,
  memo,
  visited = new Set<string>(),
  depth = 0,
}: {
  tx: Db
  storeId: string
  listId: string
  memo: Map<string, Map<string, number>>
  visited?: Set<string>
  depth?: number
}): Promise<Map<string, number>> {
  const cached = memo.get(listId)
  if (cached) return cached
  if (visited.has(listId)) {
    throw new ApiError('BUSINESS_RULE_VIOLATION', 'Phát hiện vòng lặp công thức')
  }
  if (depth >= MAX_CHAIN_DEPTH) {
    throw new ApiError(
      'BUSINESS_RULE_VIOLATION',
      `Chuỗi công thức quá sâu (>${MAX_CHAIN_DEPTH} cấp), vui lòng đơn giản hoá`,
    )
  }
  visited.add(listId)

  const row = await tx.query.priceLists.findFirst({ where: eq(priceLists.id, listId) })
  if (!row || row.storeId !== storeId || row.deletedAt !== null) {
    throw new ApiError('BUSINESS_RULE_VIOLATION', 'Bảng giá nền không hợp lệ hoặc đã bị xoá')
  }

  if (row.method === 'direct') {
    const items = await tx
      .select({ productId: priceListItems.productId, price: priceListItems.price })
      .from(priceListItems)
      .where(eq(priceListItems.priceListId, listId))
    const map = new Map<string, number>(items.map((it) => [it.productId, Number(it.price)]))
    memo.set(listId, map)
    return map
  }

  if (row.method !== 'formula' && row.method !== 'chain') {
    throw new ApiError(
      'BUSINESS_RULE_VIOLATION',
      `Phương thức bảng giá không hợp lệ: ${row.method}`,
    )
  }
  if (!row.basePriceListId || !row.formulaType || row.formulaValue === null) {
    throw new ApiError('INTERNAL_ERROR', 'Bảng giá thiếu thông tin công thức')
  }

  const basePrices = await resolveChainPrices({
    tx,
    storeId,
    listId: row.basePriceListId,
    memo,
    visited: new Set(visited),
    depth: depth + 1,
  })

  const formulaType = row.formulaType as FormulaType
  const formulaValue = Number(row.formulaValue)
  const roundingRule = row.roundingRule as RoundingRule

  const result = new Map<string, number>()
  for (const [productId, basePrice] of basePrices.entries()) {
    const computed = applyFormula(basePrice, formulaType, formulaValue)
    const final = Math.max(0, applyRounding(computed, roundingRule))
    result.set(productId, final)
  }

  memo.set(listId, result)
  return result
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

  // ===== formula or chain =====
  const baseList = await db.query.priceLists.findFirst({
    where: eq(priceLists.id, input.baseListId),
  })
  if (!baseList || baseList.storeId !== actor.storeId || baseList.deletedAt !== null) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy bảng giá nền')
  }
  if (input.method === 'formula' && baseList.method !== 'direct') {
    throw new ApiError(
      'BUSINESS_RULE_VIOLATION',
      "Bảng giá nền phải có phương thức 'direct'. Vui lòng dùng phương thức 'chain' nếu muốn nối chuỗi",
    )
  }
  if (input.method === 'chain') {
    if (
      baseList.method !== 'direct' &&
      baseList.method !== 'formula' &&
      baseList.method !== 'chain'
    ) {
      throw new ApiError(
        'BUSINESS_RULE_VIOLATION',
        'Bảng giá nền không hợp lệ cho phương thức nối chuỗi',
      )
    }
    await validateChainDepth({ db, storeId: actor.storeId, baseListId: input.baseListId })
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

  const persistedMethod = input.method

  return db.transaction(async (tx) => {
    let basePriceMap: Map<string, number>
    if (input.method === 'chain') {
      basePriceMap = await resolveChainPrices({
        tx: tx as unknown as Db,
        storeId: actor.storeId,
        listId: input.baseListId,
        memo: new Map(),
      })
    } else {
      const baseItems = await tx
        .select({ productId: priceListItems.productId, price: priceListItems.price })
        .from(priceListItems)
        .where(eq(priceListItems.priceListId, input.baseListId))
      basePriceMap = new Map(baseItems.map((it) => [it.productId, Number(it.price)]))
    }

    const overrideMap = new Map(input.overrides.map((o) => [o.productId, o.price]))
    const productIdsAccumulated = new Set<string>()
    const itemsToInsert: { productId: string; price: number; isOverridden: boolean }[] = []

    for (const [productId, basePrice] of basePriceMap.entries()) {
      productIdsAccumulated.add(productId)
      const override = overrideMap.get(productId)
      if (override !== undefined) {
        itemsToInsert.push({ productId, price: override, isOverridden: true })
      } else {
        const computed = applyFormula(
          basePrice,
          input.formulaType as FormulaType,
          input.formulaValue,
        )
        const final = Math.max(0, applyRounding(computed, input.roundingRule))
        itemsToInsert.push({ productId, price: final, isOverridden: false })
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
          method: persistedMethod,
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
        method: persistedMethod,
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

  const dependentWhere = and(
    eq(priceLists.storeId, actor.storeId),
    eq(priceLists.basePriceListId, targetId),
    isNull(priceLists.deletedAt),
  )
  const dependentLists = await db
    .select({ id: priceLists.id, name: priceLists.name })
    .from(priceLists)
    .where(dependentWhere)
    .limit(5)
  if (dependentLists.length > 0) {
    const dependentTotalRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(priceLists)
      .where(dependentWhere)
    const dependentTotal = dependentTotalRows[0]?.count ?? dependentLists.length
    throw new ApiError(
      'CONFLICT',
      'Bảng giá đang là nền của 1 bảng giá khác. Vui lòng xoá hoặc sửa các bảng phụ thuộc trước.',
      { dependentLists, dependentTotal },
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

  if ((target.method === 'formula' || target.method === 'chain') && target.basePriceListId) {
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
  if (target.method !== 'formula' && target.method !== 'chain') {
    throw new ApiError(
      'BUSINESS_RULE_VIOLATION',
      'Chỉ bảng giá công thức hoặc nối chuỗi mới có thể tính lại',
    )
  }
  if (!target.basePriceListId || !target.formulaType || target.formulaValue === null) {
    throw new ApiError('INTERNAL_ERROR', 'Bảng giá thiếu thông tin công thức')
  }

  const base = await db.query.priceLists.findFirst({
    where: and(eq(priceLists.id, target.basePriceListId), eq(priceLists.storeId, actor.storeId)),
  })
  if (!base || base.deletedAt !== null) {
    throw new ApiError('BUSINESS_RULE_VIOLATION', 'Bảng giá nền không hợp lệ hoặc đã bị xoá')
  }

  const formulaType = target.formulaType as FormulaType
  const formulaValue = Number(target.formulaValue)
  const roundingRule = target.roundingRule as RoundingRule

  return db.transaction(async (tx) => {
    let baseMap: Map<string, number>
    if (target.method === 'chain') {
      baseMap = await resolveChainPrices({
        tx: tx as unknown as Db,
        storeId: actor.storeId,
        listId: target.basePriceListId as string,
        memo: new Map(),
      })
    } else {
      const baseItems = await tx
        .select({ productId: priceListItems.productId, price: priceListItems.price })
        .from(priceListItems)
        .where(eq(priceListItems.priceListId, target.basePriceListId as string))
      baseMap = new Map(baseItems.map((it) => [it.productId, Number(it.price)]))
    }

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

export interface ComparePriceListsDeps {
  db: Db
  storeId: string
  listAId: string
  listBId: string
}

export async function comparePriceLists({
  db,
  storeId,
  listAId,
  listBId,
}: ComparePriceListsDeps): Promise<ComparePriceListsResponse> {
  if (listAId === listBId) {
    throw new ApiError('VALIDATION_ERROR', 'Hai bảng giá so sánh phải khác nhau', {
      field: 'listBId',
    })
  }

  const [listA, listB] = await Promise.all([
    getPriceList({ db, storeId, targetId: listAId }),
    getPriceList({ db, storeId, targetId: listBId }),
  ])

  const [itemsA, itemsB] = await Promise.all([
    db
      .select({ productId: priceListItems.productId, price: priceListItems.price })
      .from(priceListItems)
      .where(eq(priceListItems.priceListId, listAId)),
    db
      .select({ productId: priceListItems.productId, price: priceListItems.price })
      .from(priceListItems)
      .where(eq(priceListItems.priceListId, listBId)),
  ])

  const mapA = new Map<string, number>(itemsA.map((it) => [it.productId, Number(it.price)]))
  const mapB = new Map<string, number>(itemsB.map((it) => [it.productId, Number(it.price)]))

  const productIds = Array.from(new Set([...mapA.keys(), ...mapB.keys()]))

  if (productIds.length === 0) {
    return {
      listA,
      listB,
      rows: [],
      summary: {
        totalProducts: 0,
        bothCount: 0,
        onlyACount: 0,
        onlyBCount: 0,
        diffOver10Count: 0,
        belowCostBCount: 0,
        belowCostACount: 0,
      },
    }
  }

  const productRows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      imageUrl: products.imageUrl,
      sellingPrice: products.sellingPrice,
      costPrice: products.costPrice,
    })
    .from(products)
    .where(
      and(
        inArray(products.id, productIds),
        eq(products.storeId, storeId),
        isNull(products.deletedAt),
      ),
    )

  const rows = productRows.map((p) =>
    computeCompareRow({
      productId: p.id,
      productName: p.name,
      productSku: p.sku,
      productImageUrl: p.imageUrl ?? null,
      productSellingPrice: Number(p.sellingPrice),
      productCostPrice: p.costPrice === null ? null : Number(p.costPrice),
      priceA: mapA.has(p.id) ? (mapA.get(p.id) as number) : null,
      priceB: mapB.has(p.id) ? (mapB.get(p.id) as number) : null,
    }),
  )

  rows.sort((a, b) => a.productName.localeCompare(b.productName, 'vi'))

  const summary = computeCompareSummary(rows)

  return { listA, listB, rows, summary }
}

export interface ClonePriceListDeps {
  db: Db
  actor: PriceListsActor
  sourceId: string
  input: ClonePriceListInput
  meta?: RequestMeta
}

export async function clonePriceList({
  db,
  actor,
  sourceId,
  input,
  meta,
}: ClonePriceListDeps): Promise<PriceListDetail> {
  const source = await db.query.priceLists.findFirst({
    where: eq(priceLists.id, sourceId),
  })
  if (!source || source.storeId !== actor.storeId || source.deletedAt !== null) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy bảng giá nguồn')
  }

  await ensureNameUnique({ db, storeId: actor.storeId, name: input.name })

  const description =
    input.description !== undefined && input.description !== null
      ? input.description
      : `Bản sao của ${source.name}`

  return db.transaction(async (tx) => {
    let createdId: string
    try {
      const [row] = await tx
        .insert(priceLists)
        .values({
          storeId: actor.storeId,
          name: input.name,
          description,
          method: 'direct',
          basePriceListId: null,
          formulaType: null,
          formulaValue: null,
          roundingRule: 'none',
          effectiveFrom: null,
          effectiveTo: null,
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

    const sourceItems = await tx
      .select({ productId: priceListItems.productId, price: priceListItems.price })
      .from(priceListItems)
      .where(eq(priceListItems.priceListId, sourceId))

    if (sourceItems.length > 0) {
      await tx.insert(priceListItems).values(
        sourceItems.map((it) => ({
          priceListId: createdId,
          productId: it.productId,
          price: Number(it.price),
          isOverridden: false,
        })),
      )
    }

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'price_list.cloned',
      targetType: 'price_list',
      targetId: createdId,
      changes: {
        name: input.name,
        sourceListId: sourceId,
        sourceName: source.name,
        itemCount: sourceItems.length,
        isActive: input.isActive,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    return getPriceList({ db: tx as unknown as Db, storeId: actor.storeId, targetId: createdId })
  })
}

export interface ImportPriceListDeps {
  db: Db
  actor: PriceListsActor
  priceListId: string
  input: ImportPriceListInput
  meta?: RequestMeta
}

export interface ImportPriceListResult {
  summary: ImportPriceListSummary
  priceList: PriceListDetail
}

const MAX_CSV_ROWS = 5000

interface CsvParsedRow {
  rowNumber: number
  cells: string[]
}

interface CsvParseResult {
  headers: string[]
  rows: CsvParsedRow[]
}

// Strip dấu nháy bao bọc đơn giản. Không hỗ trợ embedded comma trong quoted field.
function stripQuotes(cell: string): string {
  const trimmed = cell.trim()
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"')
  }
  return trimmed
}

function parseCsv(text: string): CsvParseResult {
  const stripped = text.replace(/^\uFEFF/, '')
  const allLines = stripped.split(/\r?\n/)
  let headerIndex = -1
  for (let i = 0; i < allLines.length; i++) {
    if ((allLines[i] ?? '').trim().length > 0) {
      headerIndex = i
      break
    }
  }
  if (headerIndex < 0) {
    throw new ApiError('VALIDATION_ERROR', 'File CSV trống hoặc không có dòng dữ liệu')
  }
  const headerLine = allLines[headerIndex] as string
  const headers = headerLine.split(',').map((h) => stripQuotes(h).toLowerCase())

  const rows: CsvParsedRow[] = []
  for (let i = headerIndex + 1; i < allLines.length; i++) {
    const line = allLines[i] ?? ''
    if (line.trim().length === 0) continue
    // rowNumber theo file gốc (1-based), giữ nguyên dù có dòng trắng giữa file.
    rows.push({ rowNumber: i + 1, cells: line.split(',').map((c) => stripQuotes(c)) })
  }
  if (rows.length === 0) {
    throw new ApiError('VALIDATION_ERROR', 'File CSV trống hoặc không có dòng dữ liệu')
  }
  return { headers, rows }
}

export async function importPriceList({
  db,
  actor,
  priceListId,
  input,
  meta,
}: ImportPriceListDeps): Promise<ImportPriceListResult> {
  const target = await db.query.priceLists.findFirst({
    where: eq(priceLists.id, priceListId),
  })
  if (!target || target.storeId !== actor.storeId || target.deletedAt !== null) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy bảng giá')
  }
  if (target.method !== 'direct') {
    throw new ApiError('BUSINESS_RULE_VIOLATION', 'Chỉ có thể import vào bảng giá Trực tiếp')
  }

  const { headers, rows } = parseCsv(input.csvText)
  const codeIdx = headers.indexOf('product_code')
  const priceIdx = headers.indexOf('price')
  if (codeIdx < 0 || priceIdx < 0) {
    throw new ApiError('VALIDATION_ERROR', 'CSV phải có header: product_code,price')
  }
  if (rows.length > MAX_CSV_ROWS) {
    throw new ApiError('VALIDATION_ERROR', `Số dòng vượt giới hạn ${MAX_CSV_ROWS}`)
  }

  const totalRows = rows.length
  const errors: ImportPriceListSummary['errors'] = []
  const validInputs: { row: number; code: string; price: number }[] = []

  rows.forEach(({ rowNumber, cells }) => {
    const rawCode = (cells[codeIdx] ?? '').trim()
    const rawPrice = (cells[priceIdx] ?? '').trim()
    if (!rawCode) {
      errors.push({ row: rowNumber, code: rawCode, reason: 'Mã sản phẩm trống' })
      return
    }
    if (!/^\d+$/.test(rawPrice)) {
      errors.push({ row: rowNumber, code: rawCode, reason: `Giá không hợp lệ: '${rawPrice}'` })
      return
    }
    const priceNum = Number(rawPrice)
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      errors.push({ row: rowNumber, code: rawCode, reason: `Giá không hợp lệ: '${rawPrice}'` })
      return
    }
    validInputs.push({ row: rowNumber, code: rawCode, price: priceNum })
  })

  // Lookup theo LOWER(sku) vì DB index dùng LOWER(sku) - SKU lookup phải case-insensitive.
  const codes = Array.from(new Set(validInputs.map((v) => v.code.toLowerCase())))
  let codeToProductId = new Map<string, string>()
  if (codes.length > 0) {
    const productRows = await db
      .select({ id: products.id, sku: products.sku })
      .from(products)
      .where(
        and(
          eq(products.storeId, actor.storeId),
          sql`LOWER(${products.sku}) IN (${sql.join(
            codes.map((c) => sql`${c}`),
            sql`, `,
          )})`,
          isNull(products.deletedAt),
        ),
      )
    codeToProductId = new Map(productRows.map((p) => [p.sku.toLowerCase(), p.id]))
  }

  const roundingRule = target.roundingRule as RoundingRule

  const itemsByProductId = new Map<string, number>()
  const seenProductIds = new Set<string>()
  for (const v of validInputs) {
    const productId = codeToProductId.get(v.code.toLowerCase())
    if (!productId) {
      errors.push({ row: v.row, code: v.code, reason: 'Không tìm thấy SKU' })
      continue
    }
    if (seenProductIds.has(productId)) {
      errors.push({ row: v.row, code: v.code, reason: 'SKU trùng dòng trước' })
      continue
    }
    seenProductIds.add(productId)
    const finalPrice = Math.max(0, applyRounding(v.price, roundingRule))
    itemsByProductId.set(productId, finalPrice)
  }

  const imported = itemsByProductId.size
  const skipped = totalRows - imported

  // Guard: replace mode cần ít nhất 1 dòng hợp lệ - tránh wipe data khi CSV toàn invalid.
  if (input.mode === 'replace' && itemsByProductId.size === 0) {
    throw new ApiError('VALIDATION_ERROR', 'Chế độ thay thế yêu cầu ít nhất 1 dòng hợp lệ', {
      errors: errors.slice(0, 20),
    })
  }

  const summary: ImportPriceListSummary = { totalRows, imported, skipped, errors }

  const priceList = await db.transaction(async (tx) => {
    if (input.mode === 'replace') {
      await tx.delete(priceListItems).where(eq(priceListItems.priceListId, priceListId))
    }

    if (itemsByProductId.size > 0) {
      const values = Array.from(itemsByProductId.entries()).map(([productId, price]) => ({
        priceListId,
        productId,
        price,
        isOverridden: false,
      }))

      await tx
        .insert(priceListItems)
        .values(values)
        .onConflictDoUpdate({
          target: [priceListItems.priceListId, priceListItems.productId],
          set: {
            price: sql`EXCLUDED.price`,
            isOverridden: sql`false`,
          },
        })
    }

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'price_list.imported',
      targetType: 'price_list',
      targetId: priceListId,
      changes: {
        mode: input.mode,
        totalRows,
        imported,
        skipped,
        errors: errors.slice(0, 20),
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    return getPriceList({ db: tx as unknown as Db, storeId: actor.storeId, targetId: priceListId })
  })

  return { summary, priceList }
}

// Re-export gte/lte/gt to silence unused warnings in case future need
export const _internal = { gte, lte, gt }

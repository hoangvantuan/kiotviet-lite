import { and, asc, desc, eq, isNotNull, isNull, ne, or, type SQL, sql } from 'drizzle-orm'

import {
  categories,
  type CreateProductInput,
  inventoryTransactions,
  type ListProductsQuery,
  type ProductDetail,
  type ProductListItem,
  products,
  type ProductStatus,
  type UpdateProductInput,
  type UserRole,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { diffObjects, logAction, type RequestMeta } from './audit.service.js'

export interface ProductsActor {
  userId: string
  storeId: string
  role: UserRole
}

interface ProductRow {
  id: string
  storeId: string
  name: string
  sku: string
  barcode: string | null
  categoryId: string | null
  sellingPrice: number
  costPrice: number | null
  unit: string
  imageUrl: string | null
  status: string
  hasVariants: boolean
  trackInventory: boolean
  currentStock: number
  minStock: number
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

function toProductDetail(row: ProductRow, categoryName: string | null = null): ProductDetail {
  return {
    id: row.id,
    storeId: row.storeId,
    name: row.name,
    sku: row.sku,
    barcode: row.barcode,
    categoryId: row.categoryId,
    categoryName,
    sellingPrice: Number(row.sellingPrice),
    costPrice: row.costPrice === null ? null : Number(row.costPrice),
    unit: row.unit,
    imageUrl: row.imageUrl,
    status: (row.status as ProductStatus) ?? 'active',
    hasVariants: row.hasVariants,
    trackInventory: row.trackInventory,
    currentStock: row.currentStock,
    minStock: row.minStock,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toProductListItem(row: ProductRow, categoryName: string | null): ProductListItem {
  const detail = toProductDetail(row, categoryName)
  // ProductListItem là subset của ProductDetail (không có storeId, deletedAt)
  return {
    id: detail.id,
    name: detail.name,
    sku: detail.sku,
    barcode: detail.barcode,
    categoryId: detail.categoryId,
    categoryName: detail.categoryName,
    sellingPrice: detail.sellingPrice,
    costPrice: detail.costPrice,
    unit: detail.unit,
    imageUrl: detail.imageUrl,
    status: detail.status,
    trackInventory: detail.trackInventory,
    currentStock: detail.currentStock,
    minStock: detail.minStock,
    hasVariants: detail.hasVariants,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
  }
}

function unwrapDriverError(err: unknown): unknown {
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

interface UniqueProductViolation {
  field: 'sku' | 'barcode'
}

function classifyUniqueProductViolation(err: unknown): UniqueProductViolation | null {
  if (getPgErrorCode(err) !== '23505') return null
  const constraint = getPgConstraint(err)
  if (constraint === 'uniq_products_store_sku_alive') return { field: 'sku' }
  if (constraint === 'uniq_products_store_barcode_alive') return { field: 'barcode' }
  return null
}

function isCategoryFkViolation(err: unknown): boolean {
  if (getPgErrorCode(err) !== '23503') return false
  const constraint = getPgConstraint(err)
  return constraint === 'products_category_id_categories_id_fk'
}

async function ensureCategoryInStore({
  db,
  storeId,
  categoryId,
}: {
  db: Db
  storeId: string
  categoryId: string
}): Promise<void> {
  const cat = await db.query.categories.findFirst({
    where: eq(categories.id, categoryId),
  })
  if (!cat || cat.storeId !== storeId) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy danh mục')
  }
}

async function isSkuTaken({
  db,
  storeId,
  sku,
  excludeId,
}: {
  db: Db
  storeId: string
  sku: string
  excludeId?: string
}): Promise<boolean> {
  const conds: SQL[] = [
    eq(products.storeId, storeId),
    isNull(products.deletedAt),
    sql`LOWER(${products.sku}) = LOWER(${sku})`,
  ]
  if (excludeId) conds.push(ne(products.id, excludeId))
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(and(...conds))
    .limit(1)
  return rows.length > 0
}

async function isBarcodeTaken({
  db,
  storeId,
  barcode,
  excludeId,
}: {
  db: Db
  storeId: string
  barcode: string
  excludeId?: string
}): Promise<boolean> {
  const conds: SQL[] = [
    eq(products.storeId, storeId),
    isNull(products.deletedAt),
    eq(products.barcode, barcode),
  ]
  if (excludeId) conds.push(ne(products.id, excludeId))
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(and(...conds))
    .limit(1)
  return rows.length > 0
}

function randomSkuSuffix(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')
}

async function generateUniqueSku({
  db,
  storeId,
  prefix = 'SP-',
  maxRetry = 5,
}: {
  db: Db
  storeId: string
  prefix?: string
  maxRetry?: number
}): Promise<string> {
  for (let i = 0; i < maxRetry; i++) {
    const candidate = `${prefix}${randomSkuSuffix()}`
    const taken = await isSkuTaken({ db, storeId, sku: candidate })
    if (!taken) return candidate
  }
  throw new ApiError('INTERNAL_ERROR', 'Không tạo được SKU duy nhất, vui lòng nhập tay')
}

async function fetchCategoryName({
  db,
  categoryId,
}: {
  db: Db
  categoryId: string | null
}): Promise<string | null> {
  if (!categoryId) return null
  const cat = await db.query.categories.findFirst({
    where: eq(categories.id, categoryId),
  })
  return cat?.name ?? null
}

export interface ListProductsDeps {
  db: Db
  storeId: string
  query: ListProductsQuery
}

export interface ListProductsResult {
  items: ProductListItem[]
  total: number
}

function buildListConditions({
  storeId,
  query,
  trashed,
}: {
  storeId: string
  query: ListProductsQuery
  trashed: boolean
}): SQL[] {
  const conds: SQL[] = [eq(products.storeId, storeId)]
  conds.push(trashed ? isNotNull(products.deletedAt) : isNull(products.deletedAt))

  if (query.search && query.search.length > 0) {
    const escaped = query.search.toLowerCase().replace(/[%_\\]/g, '\\$&')
    const like = `%${escaped}%`
    const searchCond = or(
      sql`LOWER(${products.name}) LIKE ${like}`,
      sql`LOWER(${products.sku}) LIKE ${like}`,
      eq(products.barcode, query.search),
    )
    if (searchCond) conds.push(searchCond)
  }

  if (query.categoryId) {
    if (query.categoryId === 'none') {
      conds.push(isNull(products.categoryId))
    } else {
      conds.push(eq(products.categoryId, query.categoryId))
    }
  }

  if (query.status === 'active' || query.status === 'inactive') {
    conds.push(eq(products.status, query.status))
  }

  if (query.stockFilter) {
    conds.push(eq(products.trackInventory, true))
    if (query.stockFilter === 'in_stock') {
      conds.push(sql`${products.currentStock} > 0`)
    } else if (query.stockFilter === 'out_of_stock') {
      conds.push(sql`${products.currentStock} = 0`)
    } else if (query.stockFilter === 'below_min') {
      conds.push(sql`${products.currentStock} <= ${products.minStock}`)
      conds.push(sql`${products.minStock} > 0`)
    }
  }

  return conds
}

async function queryProductsList({
  db,
  storeId,
  query,
  trashed,
}: {
  db: Db
  storeId: string
  query: ListProductsQuery
  trashed: boolean
}): Promise<ListProductsResult> {
  const conds = buildListConditions({ storeId, query, trashed })
  const whereClause = conds.length === 1 ? conds[0]! : and(...conds)!
  const offset = (query.page - 1) * query.pageSize

  const rows = await db
    .select({
      id: products.id,
      storeId: products.storeId,
      name: products.name,
      sku: products.sku,
      barcode: products.barcode,
      categoryId: products.categoryId,
      sellingPrice: products.sellingPrice,
      costPrice: products.costPrice,
      unit: products.unit,
      imageUrl: products.imageUrl,
      status: products.status,
      hasVariants: products.hasVariants,
      trackInventory: products.trackInventory,
      currentStock: products.currentStock,
      minStock: products.minStock,
      deletedAt: products.deletedAt,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      categoryName: categories.name,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(whereClause)
    .orderBy(desc(products.createdAt), asc(products.name))
    .limit(query.pageSize)
    .offset(offset)

  const totalRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(whereClause)
  const total = totalRows[0]?.count ?? 0

  const items = rows.map((row) =>
    toProductListItem(
      {
        id: row.id,
        storeId: row.storeId,
        name: row.name,
        sku: row.sku,
        barcode: row.barcode,
        categoryId: row.categoryId,
        sellingPrice: row.sellingPrice,
        costPrice: row.costPrice,
        unit: row.unit,
        imageUrl: row.imageUrl,
        status: row.status,
        hasVariants: row.hasVariants,
        trackInventory: row.trackInventory,
        currentStock: row.currentStock,
        minStock: row.minStock,
        deletedAt: row.deletedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      row.categoryName,
    ),
  )

  return { items, total }
}

export async function listProducts({
  db,
  storeId,
  query,
}: ListProductsDeps): Promise<ListProductsResult> {
  return queryProductsList({ db, storeId, query, trashed: false })
}

export async function listTrashed({
  db,
  storeId,
  query,
}: ListProductsDeps): Promise<ListProductsResult> {
  return queryProductsList({ db, storeId, query, trashed: true })
}

export interface GetProductDeps {
  db: Db
  storeId: string
  productId: string
  includeDeleted?: boolean
}

export async function getProduct({
  db,
  storeId,
  productId,
  includeDeleted = false,
}: GetProductDeps): Promise<ProductDetail> {
  const target = await db.query.products.findFirst({
    where: eq(products.id, productId),
  })
  if (!target || target.storeId !== storeId) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy sản phẩm')
  }
  if (!includeDeleted && target.deletedAt !== null) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy sản phẩm')
  }
  const categoryName = await fetchCategoryName({ db, categoryId: target.categoryId })
  return toProductDetail(target as ProductRow, categoryName)
}

export interface CreateProductDeps {
  db: Db
  actor: ProductsActor
  input: CreateProductInput
  meta?: RequestMeta
}

export async function createProduct({
  db,
  actor,
  input,
  meta,
}: CreateProductDeps): Promise<ProductDetail> {
  const trackInventory = input.trackInventory ?? false
  const initialStock = trackInventory ? (input.initialStock ?? 0) : 0
  const minStock = input.minStock ?? 0

  if (input.categoryId) {
    await ensureCategoryInStore({ db, storeId: actor.storeId, categoryId: input.categoryId })
  }

  let sku = input.sku?.trim()
  if (!sku) {
    sku = await generateUniqueSku({ db, storeId: actor.storeId })
  } else {
    if (await isSkuTaken({ db, storeId: actor.storeId, sku })) {
      throw new ApiError('CONFLICT', 'Mã SKU đã tồn tại trong cửa hàng', { field: 'sku' })
    }
  }

  const barcode = input.barcode?.trim() || null
  if (barcode) {
    if (await isBarcodeTaken({ db, storeId: actor.storeId, barcode })) {
      throw new ApiError('CONFLICT', 'Barcode đã tồn tại trong cửa hàng', { field: 'barcode' })
    }
  }

  return db.transaction(async (tx) => {
    let created: typeof products.$inferSelect
    try {
      const [row] = await tx
        .insert(products)
        .values({
          storeId: actor.storeId,
          name: input.name,
          sku,
          barcode,
          categoryId: input.categoryId ?? null,
          sellingPrice: input.sellingPrice,
          costPrice: input.costPrice ?? null,
          unit: input.unit ?? 'Cái',
          imageUrl: input.imageUrl ?? null,
          status: input.status ?? 'active',
          trackInventory,
          minStock,
          currentStock: trackInventory ? initialStock : 0,
        })
        .returning()
      if (!row) {
        throw new ApiError('INTERNAL_ERROR', 'Không tạo được sản phẩm')
      }
      created = row
    } catch (err) {
      if (err instanceof ApiError) throw err
      const violation = classifyUniqueProductViolation(err)
      if (violation) {
        const msg =
          violation.field === 'sku'
            ? 'Mã SKU đã tồn tại trong cửa hàng'
            : 'Barcode đã tồn tại trong cửa hàng'
        throw new ApiError('CONFLICT', msg, { field: violation.field })
      }
      if (isCategoryFkViolation(err)) {
        throw new ApiError('NOT_FOUND', 'Không tìm thấy danh mục')
      }
      throw err
    }

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'product.created',
      targetType: 'product',
      targetId: created.id,
      changes: {
        name: created.name,
        sku: created.sku,
        sellingPrice: Number(created.sellingPrice),
        categoryId: created.categoryId,
        trackInventory: created.trackInventory,
        initialStock: trackInventory ? initialStock : 0,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    if (trackInventory && initialStock > 0) {
      await tx.insert(inventoryTransactions).values({
        storeId: actor.storeId,
        productId: created.id,
        type: 'initial_stock',
        quantity: initialStock,
        createdBy: actor.userId,
        note: 'Khởi tạo tồn kho lúc tạo sản phẩm',
      })

      await logAction({
        db: tx as unknown as Db,
        storeId: actor.storeId,
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'product.stock_initialized',
        targetType: 'product',
        targetId: created.id,
        changes: { quantity: initialStock },
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      })
    }

    const categoryName = await fetchCategoryName({
      db: tx as unknown as Db,
      categoryId: created.categoryId,
    })
    return toProductDetail(created as ProductRow, categoryName)
  })
}

export interface UpdateProductDeps {
  db: Db
  actor: ProductsActor
  productId: string
  input: UpdateProductInput
  meta?: RequestMeta
}

export async function updateProduct({
  db,
  actor,
  productId,
  input,
  meta,
}: UpdateProductDeps): Promise<ProductDetail> {
  const target = await db.query.products.findFirst({
    where: eq(products.id, productId),
  })
  if (!target || target.storeId !== actor.storeId || target.deletedAt !== null) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy sản phẩm')
  }

  const updates: Partial<typeof products.$inferInsert> = {}

  if (input.sku !== undefined) {
    const newSku = input.sku.trim()
    if (newSku !== target.sku) {
      if (await isSkuTaken({ db, storeId: actor.storeId, sku: newSku, excludeId: target.id })) {
        throw new ApiError('CONFLICT', 'Mã SKU đã tồn tại trong cửa hàng', { field: 'sku' })
      }
      updates.sku = newSku
    }
  }

  if (input.barcode !== undefined) {
    const newBarcode = input.barcode === null ? null : input.barcode.trim() || null
    if (newBarcode !== target.barcode) {
      if (newBarcode !== null) {
        if (
          await isBarcodeTaken({
            db,
            storeId: actor.storeId,
            barcode: newBarcode,
            excludeId: target.id,
          })
        ) {
          throw new ApiError('CONFLICT', 'Barcode đã tồn tại trong cửa hàng', {
            field: 'barcode',
          })
        }
      }
      updates.barcode = newBarcode
    }
  }

  if (input.categoryId !== undefined) {
    if (input.categoryId === null) {
      if (target.categoryId !== null) updates.categoryId = null
    } else {
      await ensureCategoryInStore({
        db,
        storeId: actor.storeId,
        categoryId: input.categoryId,
      })
      if (input.categoryId !== target.categoryId) updates.categoryId = input.categoryId
    }
  }

  if (input.name !== undefined && input.name !== target.name) updates.name = input.name
  if (input.sellingPrice !== undefined && input.sellingPrice !== Number(target.sellingPrice))
    updates.sellingPrice = input.sellingPrice
  if (input.costPrice !== undefined) {
    const newCost = input.costPrice
    const cur = target.costPrice === null ? null : Number(target.costPrice)
    if (newCost !== cur) updates.costPrice = newCost
  }
  if (input.unit !== undefined && input.unit !== target.unit) updates.unit = input.unit
  if (input.imageUrl !== undefined && input.imageUrl !== target.imageUrl)
    updates.imageUrl = input.imageUrl
  if (input.status !== undefined && input.status !== target.status) updates.status = input.status
  if (input.minStock !== undefined && input.minStock !== target.minStock)
    updates.minStock = input.minStock

  if (input.trackInventory !== undefined && input.trackInventory !== target.trackInventory) {
    if (target.trackInventory && !input.trackInventory && target.currentStock > 0) {
      throw new ApiError(
        'BUSINESS_RULE_VIOLATION',
        'Vui lòng kiểm kho về 0 trước khi tắt theo dõi tồn kho',
      )
    }
    updates.trackInventory = input.trackInventory
  }

  if (Object.keys(updates).length === 0) {
    const categoryName = await fetchCategoryName({ db, categoryId: target.categoryId })
    return toProductDetail(target as ProductRow, categoryName)
  }

  const before: Record<string, unknown> = {
    name: target.name,
    sku: target.sku,
    barcode: target.barcode,
    categoryId: target.categoryId,
    sellingPrice: Number(target.sellingPrice),
    costPrice: target.costPrice === null ? null : Number(target.costPrice),
    unit: target.unit,
    imageUrl: target.imageUrl,
    status: target.status,
    trackInventory: target.trackInventory,
    minStock: target.minStock,
  }
  const after: Record<string, unknown> = {
    name: updates.name ?? target.name,
    sku: updates.sku ?? target.sku,
    barcode: updates.barcode !== undefined ? updates.barcode : target.barcode,
    categoryId: updates.categoryId !== undefined ? updates.categoryId : target.categoryId,
    sellingPrice:
      updates.sellingPrice !== undefined ? updates.sellingPrice : Number(target.sellingPrice),
    costPrice:
      updates.costPrice !== undefined
        ? updates.costPrice
        : target.costPrice === null
          ? null
          : Number(target.costPrice),
    unit: updates.unit ?? target.unit,
    imageUrl: updates.imageUrl !== undefined ? updates.imageUrl : target.imageUrl,
    status: updates.status ?? target.status,
    trackInventory:
      updates.trackInventory !== undefined ? updates.trackInventory : target.trackInventory,
    minStock: updates.minStock ?? target.minStock,
  }

  return db.transaction(async (tx) => {
    let updated: typeof products.$inferSelect
    try {
      const [row] = await tx
        .update(products)
        .set(updates)
        .where(eq(products.id, productId))
        .returning()
      if (!row) {
        throw new ApiError('INTERNAL_ERROR', 'Không cập nhật được sản phẩm')
      }
      updated = row
    } catch (err) {
      if (err instanceof ApiError) throw err
      const violation = classifyUniqueProductViolation(err)
      if (violation) {
        const msg =
          violation.field === 'sku'
            ? 'Mã SKU đã tồn tại trong cửa hàng'
            : 'Barcode đã tồn tại trong cửa hàng'
        throw new ApiError('CONFLICT', msg, { field: violation.field })
      }
      if (isCategoryFkViolation(err)) {
        throw new ApiError('NOT_FOUND', 'Không tìm thấy danh mục')
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
        action: 'product.updated',
        targetType: 'product',
        targetId: productId,
        changes: fieldDiff,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      })
    }

    const categoryName = await fetchCategoryName({
      db: tx as unknown as Db,
      categoryId: updated.categoryId,
    })
    return toProductDetail(updated as ProductRow, categoryName)
  })
}

export interface DeleteProductDeps {
  db: Db
  actor: ProductsActor
  productId: string
  meta?: RequestMeta
}

export async function deleteProduct({
  db,
  actor,
  productId,
  meta,
}: DeleteProductDeps): Promise<{ ok: true }> {
  const target = await db.query.products.findFirst({
    where: eq(products.id, productId),
  })
  if (!target || target.storeId !== actor.storeId || target.deletedAt !== null) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy sản phẩm')
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(products)
      .set({ deletedAt: new Date() })
      .where(eq(products.id, productId))
      .returning()
    if (!updated) {
      throw new ApiError('INTERNAL_ERROR', 'Không xoá được sản phẩm')
    }

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'product.deleted',
      targetType: 'product',
      targetId: productId,
      changes: {
        name: target.name,
        sku: target.sku,
        barcode: target.barcode,
        categoryId: target.categoryId,
        sellingPrice: Number(target.sellingPrice),
        currentStock: target.currentStock,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    return { ok: true as const }
  })
}

export interface RestoreProductDeps {
  db: Db
  actor: ProductsActor
  productId: string
  meta?: RequestMeta
}

export async function restoreProduct({
  db,
  actor,
  productId,
  meta,
}: RestoreProductDeps): Promise<ProductDetail> {
  const target = await db.query.products.findFirst({
    where: eq(products.id, productId),
  })
  if (!target || target.storeId !== actor.storeId || target.deletedAt === null) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy sản phẩm đã xoá')
  }

  // Vì partial unique chỉ enforce alive rows, kiểm tra SKU/barcode không bị chiếm
  if (await isSkuTaken({ db, storeId: actor.storeId, sku: target.sku, excludeId: target.id })) {
    throw new ApiError(
      'CONFLICT',
      'SKU đã được dùng cho sản phẩm khác, vui lòng đổi SKU sản phẩm cũ trước khi khôi phục',
      { field: 'sku' },
    )
  }
  if (target.barcode) {
    if (
      await isBarcodeTaken({
        db,
        storeId: actor.storeId,
        barcode: target.barcode,
        excludeId: target.id,
      })
    ) {
      throw new ApiError(
        'CONFLICT',
        'Barcode đã được dùng cho sản phẩm khác, vui lòng đổi barcode sản phẩm cũ trước khi khôi phục',
        { field: 'barcode' },
      )
    }
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(products)
      .set({ deletedAt: null })
      .where(eq(products.id, productId))
      .returning()
    if (!updated) {
      throw new ApiError('INTERNAL_ERROR', 'Không khôi phục được sản phẩm')
    }

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'product.restored',
      targetType: 'product',
      targetId: productId,
      changes: { name: updated.name, sku: updated.sku },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    const categoryName = await fetchCategoryName({
      db: tx as unknown as Db,
      categoryId: updated.categoryId,
    })
    return toProductDetail(updated as ProductRow, categoryName)
  })
}

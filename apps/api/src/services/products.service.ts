import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or, type SQL, sql } from 'drizzle-orm'

import {
  categories,
  type CreateProductInput,
  inventoryTransactions,
  type ListProductsQuery,
  type ProductDetail,
  type ProductListItem,
  products,
  type ProductStatus,
  productUnitConversions,
  productVariants,
  type UnitConversionItem,
  type UpdateProductInput,
  type UserRole,
  type VariantInput,
  type VariantItem,
  type VariantsConfig,
  type VariantsConfigResponse,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { diffObjects, logAction, type RequestMeta } from './audit.service.js'
import {
  classifyVariantViolation,
  findTakenVariantBarcodes,
  findTakenVariantSkus,
  findVariantsWithTransactions,
  generateUniqueVariantSku,
  hasVariantTransactions,
  toVariantItem,
} from './product-variants.service.js'
import { createUnitConversion, toUnitConversionItem } from './unit-conversions.service.js'

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

function toProductDetail(
  row: ProductRow,
  categoryName: string | null = null,
  variantsConfig: VariantsConfigResponse | null = null,
  effectiveStock?: number,
  unitConversions: UnitConversionItem[] = [],
): ProductDetail {
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
    currentStock: effectiveStock !== undefined ? effectiveStock : row.currentStock,
    minStock: row.minStock,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    variantsConfig,
    unitConversions,
  }
}

async function loadUnitConversionsForProduct({
  db,
  productId,
}: {
  db: Db
  productId: string
}): Promise<UnitConversionItem[]> {
  const rows = await db
    .select()
    .from(productUnitConversions)
    .where(eq(productUnitConversions.productId, productId))
    .orderBy(asc(productUnitConversions.sortOrder), asc(productUnitConversions.createdAt))
  return rows.map((r) => toUnitConversionItem(r))
}

function toProductListItem(
  row: ProductRow,
  categoryName: string | null,
  effectiveStock: number,
): ProductListItem {
  return {
    id: row.id,
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
    trackInventory: row.trackInventory,
    currentStock: effectiveStock,
    minStock: row.minStock,
    hasVariants: row.hasVariants,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
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

function mapVariantViolationToApiError(err: unknown, variantIndex?: number): ApiError | null {
  const v = classifyVariantViolation(err)
  if (!v) return null
  if (v.field === 'sku') {
    return new ApiError('CONFLICT', 'SKU biến thể đã tồn tại trong cửa hàng', {
      field: 'sku',
      variantIndex,
    })
  }
  if (v.field === 'barcode') {
    return new ApiError('CONFLICT', 'Barcode biến thể đã tồn tại trong cửa hàng', {
      field: 'barcode',
      variantIndex,
    })
  }
  return new ApiError('BUSINESS_RULE_VIOLATION', 'Tổ hợp giá trị thuộc tính bị trùng', {
    variantIndex,
  })
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

async function aggregateVariantStock({
  db,
  productIds,
}: {
  db: Db
  productIds: string[]
}): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map()
  const rows = await db
    .select({
      productId: productVariants.productId,
      total: sql<number>`COALESCE(SUM(${productVariants.stockQuantity}), 0)::int`,
    })
    .from(productVariants)
    .where(and(inArray(productVariants.productId, productIds), isNull(productVariants.deletedAt)))
    .groupBy(productVariants.productId)
  const map = new Map<string, number>()
  for (const r of rows) map.set(r.productId, Number(r.total))
  return map
}

async function loadVariantsForProduct({
  db,
  productId,
}: {
  db: Db
  productId: string
}): Promise<VariantItem[]> {
  const rows = await db
    .select()
    .from(productVariants)
    .where(and(eq(productVariants.productId, productId), isNull(productVariants.deletedAt)))
    .orderBy(asc(productVariants.createdAt))
  if (rows.length === 0) return []
  const withTx = await findVariantsWithTransactions({
    db,
    variantIds: rows.map((r) => r.id),
  })
  return rows.map((r) => toVariantItem(r, withTx.has(r.id)))
}

function buildVariantsConfigResponse(items: VariantItem[]): VariantsConfigResponse | null {
  if (items.length === 0) return null
  const first = items[0]!
  return {
    attribute1Name: first.attribute1Name,
    attribute2Name: first.attribute2Name,
    variants: items,
  }
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
    // effectiveStock = COALESCE(SUM(variants.stock_quantity) WHERE deleted_at IS NULL, current_stock)
    const effective = sql`(CASE WHEN ${products.hasVariants} THEN COALESCE((SELECT SUM(${productVariants.stockQuantity}) FROM ${productVariants} WHERE ${productVariants.productId} = ${products.id} AND ${productVariants.deletedAt} IS NULL), 0) ELSE ${products.currentStock} END)`
    if (query.stockFilter === 'in_stock') {
      conds.push(sql`${effective} > 0`)
    } else if (query.stockFilter === 'out_of_stock') {
      conds.push(sql`${effective} = 0`)
    } else if (query.stockFilter === 'below_min') {
      conds.push(sql`${effective} <= ${products.minStock}`)
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

  const variantProductIds = rows.filter((r) => r.hasVariants).map((r) => r.id)
  const stockMap = await aggregateVariantStock({ db, productIds: variantProductIds })

  const items = rows.map((row) => {
    const baseRow: ProductRow = {
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
    }
    const effectiveStock = row.hasVariants ? (stockMap.get(row.id) ?? 0) : row.currentStock
    return toProductListItem(baseRow, row.categoryName, effectiveStock)
  })

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

  let variantsConfig: VariantsConfigResponse | null = null
  let effectiveStock: number | undefined
  if (target.hasVariants) {
    const items = await loadVariantsForProduct({ db, productId: target.id })
    variantsConfig = buildVariantsConfigResponse(items)
    effectiveStock = items.reduce((s, v) => s + v.stockQuantity, 0)
  }

  const unitConversions = await loadUnitConversionsForProduct({ db, productId: target.id })

  return toProductDetail(
    target as ProductRow,
    categoryName,
    variantsConfig,
    effectiveStock,
    unitConversions,
  )
}

interface InsertVariantRowsArgs {
  tx: Db
  storeId: string
  productId: string
  parentSku: string
  config: VariantsConfig
  trackInventory: boolean
  actor: ProductsActor
  meta?: RequestMeta
}

async function insertVariantsBatch({
  tx,
  storeId,
  productId,
  parentSku,
  config,
  trackInventory,
  actor,
  meta,
}: InsertVariantRowsArgs): Promise<VariantItem[]> {
  // Pre-validate uniqueness in batch
  const reservedSkus = new Set<string>()
  const explicitSkus: { sku: string; index: number }[] = []
  config.variants.forEach((v, i) => {
    const trimmed = v.sku?.trim()
    if (trimmed) {
      explicitSkus.push({ sku: trimmed, index: i })
      reservedSkus.add(trimmed.toLowerCase())
    }
  })

  // Check explicit SKUs against DB
  if (explicitSkus.length > 0) {
    const taken = await findTakenVariantSkus({
      db: tx,
      storeId,
      skus: explicitSkus.map((x) => x.sku),
      excludeIds: [],
    })
    if (taken.size > 0) {
      const conflicting = explicitSkus.find((x) => taken.has(x.sku.toLowerCase()))
      if (conflicting) {
        throw new ApiError('CONFLICT', 'SKU biến thể đã tồn tại trong cửa hàng', {
          field: 'sku',
          variantIndex: conflicting.index,
        })
      }
    }
  }

  // Check explicit barcodes against DB
  const explicitBarcodes: { barcode: string; index: number }[] = []
  config.variants.forEach((v, i) => {
    if (v.barcode) explicitBarcodes.push({ barcode: v.barcode, index: i })
  })
  if (explicitBarcodes.length > 0) {
    const taken = await findTakenVariantBarcodes({
      db: tx,
      storeId,
      barcodes: explicitBarcodes.map((x) => x.barcode),
      excludeIds: [],
    })
    if (taken.size > 0) {
      const conflicting = explicitBarcodes.find((x) => taken.has(x.barcode))
      if (conflicting) {
        throw new ApiError('CONFLICT', 'Barcode biến thể đã tồn tại trong cửa hàng', {
          field: 'barcode',
          variantIndex: conflicting.index,
        })
      }
    }
  }

  // Auto-gen SKU for variants without explicit (defensive: schema requires sku)
  const finalRows: Array<{
    sku: string
    barcode: string | null
    attribute1Value: string
    attribute2Value: string | null
    sellingPrice: number
    costPrice: number | null
    stockQuantity: number
    status: string
    index: number
  }> = []
  for (let i = 0; i < config.variants.length; i++) {
    const v = config.variants[i]!
    let sku = v.sku?.trim()
    if (!sku) {
      sku = await generateUniqueVariantSku({
        db: tx,
        storeId,
        parentSku,
        value1: v.attribute1Value,
        value2: v.attribute2Value ?? null,
        index: i,
        reserved: reservedSkus,
      })
    }
    finalRows.push({
      sku,
      barcode: v.barcode ?? null,
      attribute1Value: v.attribute1Value,
      attribute2Value: v.attribute2Value ?? null,
      sellingPrice: v.sellingPrice,
      costPrice: v.costPrice ?? null,
      stockQuantity: v.stockQuantity ?? 0,
      status: v.status ?? 'active',
      index: i,
    })
  }

  let inserted: Array<typeof productVariants.$inferSelect>
  try {
    inserted = await tx
      .insert(productVariants)
      .values(
        finalRows.map((r) => ({
          storeId,
          productId,
          sku: r.sku,
          barcode: r.barcode,
          attribute1Name: config.attribute1Name,
          attribute1Value: r.attribute1Value,
          attribute2Name: config.attribute2Name ?? null,
          attribute2Value: r.attribute2Value,
          sellingPrice: r.sellingPrice,
          costPrice: r.costPrice,
          stockQuantity: r.stockQuantity,
          status: r.status,
        })),
      )
      .returning()
  } catch (err) {
    const apiErr = mapVariantViolationToApiError(err)
    if (apiErr) throw apiErr
    throw err
  }

  const items = inserted.map((r) => toVariantItem(r))

  for (let i = 0; i < items.length; i++) {
    const variant = items[i]!
    const original = finalRows[i]!

    await logAction({
      db: tx,
      storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'product.variant_created',
      targetType: 'product_variant',
      targetId: variant.id,
      changes: {
        sku: variant.sku,
        attribute1Name: config.attribute1Name,
        attribute1Value: variant.attribute1Value,
        attribute2Name: config.attribute2Name ?? null,
        attribute2Value: variant.attribute2Value,
        sellingPrice: variant.sellingPrice,
        costPrice: variant.costPrice,
        stockQuantity: variant.stockQuantity,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    if (trackInventory && original.stockQuantity > 0) {
      await tx.insert(inventoryTransactions).values({
        storeId,
        productId,
        variantId: variant.id,
        type: 'initial_stock',
        quantity: original.stockQuantity,
        createdBy: actor.userId,
        note: 'Khởi tạo tồn kho biến thể',
      })

      await logAction({
        db: tx,
        storeId,
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'product.stock_initialized',
        targetType: 'product_variant',
        targetId: variant.id,
        changes: { quantity: original.stockQuantity },
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      })
    }
  }

  return items
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
  const hasVariantsConfig = input.variantsConfig !== null && input.variantsConfig !== undefined
  const trackInventory = input.trackInventory ?? false
  const initialStock = !hasVariantsConfig && trackInventory ? (input.initialStock ?? 0) : 0
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

  // Khi has variants → product-level barcode bị set null
  const productBarcode = hasVariantsConfig ? null : input.barcode?.trim() || null
  if (productBarcode) {
    if (await isBarcodeTaken({ db, storeId: actor.storeId, barcode: productBarcode })) {
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
          barcode: productBarcode,
          categoryId: input.categoryId ?? null,
          sellingPrice: hasVariantsConfig ? 0 : input.sellingPrice,
          costPrice: hasVariantsConfig ? null : (input.costPrice ?? null),
          unit: input.unit ?? 'Cái',
          imageUrl: input.imageUrl ?? null,
          status: input.status ?? 'active',
          hasVariants: hasVariantsConfig,
          trackInventory,
          minStock,
          currentStock: hasVariantsConfig ? 0 : trackInventory ? initialStock : 0,
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
        hasVariants: created.hasVariants,
        initialStock: hasVariantsConfig ? 0 : trackInventory ? initialStock : 0,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    if (!hasVariantsConfig && trackInventory && initialStock > 0) {
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

    let variantsConfig: VariantsConfigResponse | null = null
    let effectiveStock: number | undefined
    if (hasVariantsConfig && input.variantsConfig) {
      const items = await insertVariantsBatch({
        tx: tx as unknown as Db,
        storeId: actor.storeId,
        productId: created.id,
        parentSku: created.sku,
        config: input.variantsConfig,
        trackInventory,
        actor,
        meta,
      })

      await logAction({
        db: tx as unknown as Db,
        storeId: actor.storeId,
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'product.variants_enabled',
        targetType: 'product',
        targetId: created.id,
        changes: {
          variantCount: items.length,
          attribute1Name: input.variantsConfig.attribute1Name,
          attribute2Name: input.variantsConfig.attribute2Name ?? null,
        },
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      })

      variantsConfig = buildVariantsConfigResponse(items)
      effectiveStock = items.reduce((s, v) => s + v.stockQuantity, 0)
    }

    const unitConversionsResult: UnitConversionItem[] = []
    if (input.unitConversions && input.unitConversions.length > 0) {
      if (input.unitConversions.length > 3) {
        throw new ApiError('BUSINESS_RULE_VIOLATION', 'Tối đa 3 đơn vị quy đổi/sản phẩm')
      }
      const seen = new Set<string>()
      for (let i = 0; i < input.unitConversions.length; i++) {
        const uc = input.unitConversions[i]!
        const key = uc.unit.trim().toLowerCase()
        if (seen.has(key)) {
          throw new ApiError('CONFLICT', 'Đơn vị quy đổi đã tồn tại', {
            field: 'unit',
            index: i,
          })
        }
        seen.add(key)
        const item = await createUnitConversion({
          db: tx as unknown as Db,
          actor,
          productId: created.id,
          input: uc,
          meta,
          skipCountCheck: true,
        })
        unitConversionsResult.push(item)
      }
    }

    const categoryName = await fetchCategoryName({
      db: tx as unknown as Db,
      categoryId: created.categoryId,
    })
    return toProductDetail(
      created as ProductRow,
      categoryName,
      variantsConfig,
      effectiveStock,
      unitConversionsResult,
    )
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

  const variantsConfigField = Object.prototype.hasOwnProperty.call(input, 'variantsConfig')
    ? input.variantsConfig
    : undefined
  const hasVariantsConfigField = variantsConfigField !== undefined

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
  if (input.unit !== undefined && input.unit !== target.unit) {
    // Validate đơn vị mới không trùng đơn vị quy đổi hiện có (case-insensitive)
    const newUnitLower = input.unit.trim().toLowerCase()
    const existingConversions = await db
      .select({ unit: productUnitConversions.unit })
      .from(productUnitConversions)
      .where(eq(productUnitConversions.productId, target.id))
    const conflict = existingConversions.find((c) => c.unit.trim().toLowerCase() === newUnitLower)
    if (conflict) {
      throw new ApiError(
        'BUSINESS_RULE_VIOLATION',
        'Đơn vị tính mới đang trùng với một đơn vị quy đổi đã có. Vui lòng đổi/xoá đơn vị quy đổi đó trước.',
        { field: 'unit', conflictWith: conflict.unit },
      )
    }
    updates.unit = input.unit
  }
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

  // Pre-checks for variant transitions
  if (hasVariantsConfigField) {
    if (variantsConfigField === null && target.hasVariants) {
      // TURN OFF variants
      const existing = await db
        .select({ id: productVariants.id, stockQuantity: productVariants.stockQuantity })
        .from(productVariants)
        .where(and(eq(productVariants.productId, target.id), isNull(productVariants.deletedAt)))
      const totalStock = existing.reduce((s, r) => s + r.stockQuantity, 0)
      if (totalStock > 0) {
        throw new ApiError(
          'BUSINESS_RULE_VIOLATION',
          'Vui lòng kiểm kho biến thể về 0 trước khi tắt biến thể',
        )
      }
      for (const e of existing) {
        if (await hasVariantTransactions({ db, variantId: e.id })) {
          throw new ApiError(
            'BUSINESS_RULE_VIOLATION',
            'Có biến thể đã được dùng, không thể tắt biến thể',
          )
        }
      }
    } else if (variantsConfigField !== null && !target.hasVariants) {
      // TURN ON variants from non-variant product
      if (target.currentStock > 0) {
        throw new ApiError(
          'BUSINESS_RULE_VIOLATION',
          'Vui lòng kiểm kho về 0 trước khi bật biến thể',
        )
      }
    }
  }

  return db.transaction(async (tx) => {
    let updated: typeof products.$inferSelect = target
    let variantUpdateRan = false

    // Handle variants transitions
    if (hasVariantsConfigField) {
      if (variantsConfigField === null && target.hasVariants) {
        // TURN OFF: hard delete all variants (validated no transactions above)
        const existing = await tx
          .select()
          .from(productVariants)
          .where(and(eq(productVariants.productId, target.id), isNull(productVariants.deletedAt)))
        for (const e of existing) {
          await tx.delete(productVariants).where(eq(productVariants.id, e.id))
          await logAction({
            db: tx as unknown as Db,
            storeId: actor.storeId,
            actorId: actor.userId,
            actorRole: actor.role,
            action: 'product.variant_deleted',
            targetType: 'product_variant',
            targetId: e.id,
            changes: { softDelete: false, sku: e.sku },
            ipAddress: meta?.ipAddress,
            userAgent: meta?.userAgent,
          })
        }
        updates.hasVariants = false
        updates.currentStock = 0
        variantUpdateRan = true
      } else if (variantsConfigField !== null && !target.hasVariants) {
        // TURN ON
        updates.hasVariants = true
        updates.sellingPrice = 0
        updates.costPrice = null
        updates.barcode = null
        updates.currentStock = 0
        variantUpdateRan = true
      } else if (variantsConfigField !== null && target.hasVariants) {
        // CRUD on existing variants
        variantUpdateRan = true
      }
    }

    if (Object.keys(updates).length > 0) {
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
    }

    // Audit product fields
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
      name: updated.name,
      sku: updated.sku,
      barcode: updated.barcode,
      categoryId: updated.categoryId,
      sellingPrice: Number(updated.sellingPrice),
      costPrice: updated.costPrice === null ? null : Number(updated.costPrice),
      unit: updated.unit,
      imageUrl: updated.imageUrl,
      status: updated.status,
      trackInventory: updated.trackInventory,
      minStock: updated.minStock,
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

    // Variants CRUD detail
    if (variantUpdateRan && hasVariantsConfigField) {
      const cfg = variantsConfigField as VariantsConfig | null
      if (cfg === null && target.hasVariants) {
        await logAction({
          db: tx as unknown as Db,
          storeId: actor.storeId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'product.variants_disabled',
          targetType: 'product',
          targetId: productId,
          changes: {},
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
        })
      } else if (cfg !== null && !target.hasVariants) {
        await insertVariantsBatch({
          tx: tx as unknown as Db,
          storeId: actor.storeId,
          productId: updated.id,
          parentSku: updated.sku,
          config: cfg,
          trackInventory: updated.trackInventory,
          actor,
          meta,
        })

        await logAction({
          db: tx as unknown as Db,
          storeId: actor.storeId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'product.variants_enabled',
          targetType: 'product',
          targetId: productId,
          changes: {
            variantCount: cfg.variants.length,
            attribute1Name: cfg.attribute1Name,
            attribute2Name: cfg.attribute2Name ?? null,
          },
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
        })
      } else if (cfg !== null && target.hasVariants) {
        await applyVariantDiff({
          tx: tx as unknown as Db,
          storeId: actor.storeId,
          productId: updated.id,
          parentSku: updated.sku,
          config: cfg,
          trackInventory: updated.trackInventory,
          actor,
          meta,
        })
      }
    }

    const categoryName = await fetchCategoryName({
      db: tx as unknown as Db,
      categoryId: updated.categoryId,
    })

    let variantsConfigResp: VariantsConfigResponse | null = null
    let effectiveStock: number | undefined
    if (updated.hasVariants) {
      const items = await loadVariantsForProduct({ db: tx as unknown as Db, productId: updated.id })
      variantsConfigResp = buildVariantsConfigResponse(items)
      effectiveStock = items.reduce((s, v) => s + v.stockQuantity, 0)
    }

    const unitConversions = await loadUnitConversionsForProduct({
      db: tx as unknown as Db,
      productId: updated.id,
    })

    return toProductDetail(
      updated as ProductRow,
      categoryName,
      variantsConfigResp,
      effectiveStock,
      unitConversions,
    )
  })
}

interface ApplyVariantDiffArgs {
  tx: Db
  storeId: string
  productId: string
  parentSku: string
  config: VariantsConfig
  trackInventory: boolean
  actor: ProductsActor
  meta?: RequestMeta
}

async function applyVariantDiff({
  tx,
  storeId,
  productId,
  parentSku,
  config,
  trackInventory,
  actor,
  meta,
}: ApplyVariantDiffArgs): Promise<void> {
  // Load alive existing variants
  const existing = await tx
    .select()
    .from(productVariants)
    .where(and(eq(productVariants.productId, productId), isNull(productVariants.deletedAt)))

  const existingMap = new Map(existing.map((e) => [e.id, e]))
  const incomingMap = new Map<string, VariantInput>()
  for (const v of config.variants) {
    if (v.id) incomingMap.set(v.id, v)
  }

  const toInsert: Array<{ v: VariantInput; index: number }> = []
  const toUpdate: Array<{ v: VariantInput; existing: (typeof existing)[number]; index: number }> =
    []
  config.variants.forEach((v, i) => {
    if (!v.id) {
      toInsert.push({ v, index: i })
      return
    }
    const ex = existingMap.get(v.id)
    if (!ex) return
    toUpdate.push({ v, existing: ex, index: i })
  })

  const incomingIds = new Set([...incomingMap.keys()])
  const toDelete = existing.filter((e) => !incomingIds.has(e.id))

  // Pre-validate uniqueness for new SKUs/barcodes (against DB excluding all involved variant ids)
  const allInvolvedIds = existing.map((e) => e.id)
  const updateSkuConflicts = toUpdate.filter(
    (x) => x.v.sku && x.v.sku.toLowerCase() !== x.existing.sku.toLowerCase(),
  )
  const insertSkus = toInsert.filter((x) => x.v.sku).map((x) => ({ sku: x.v.sku!, index: x.index }))
  const allSkuChecks = [
    ...insertSkus,
    ...updateSkuConflicts.map((x) => ({ sku: x.v.sku!, index: x.index })),
  ]
  if (allSkuChecks.length > 0) {
    const taken = await findTakenVariantSkus({
      db: tx,
      storeId,
      skus: allSkuChecks.map((x) => x.sku),
      excludeIds: allInvolvedIds,
    })
    if (taken.size > 0) {
      const conflicting = allSkuChecks.find((x) => taken.has(x.sku.toLowerCase()))
      if (conflicting) {
        throw new ApiError('CONFLICT', 'SKU biến thể đã tồn tại trong cửa hàng', {
          field: 'sku',
          variantIndex: conflicting.index,
        })
      }
    }
  }

  const insertBarcodes = toInsert
    .filter((x) => x.v.barcode)
    .map((x) => ({ barcode: x.v.barcode!, index: x.index }))
  const updateBarcodes = toUpdate
    .filter((x) => x.v.barcode && x.v.barcode !== x.existing.barcode)
    .map((x) => ({ barcode: x.v.barcode!, index: x.index }))
  const allBarcodeChecks = [...insertBarcodes, ...updateBarcodes]
  if (allBarcodeChecks.length > 0) {
    const taken = await findTakenVariantBarcodes({
      db: tx,
      storeId,
      barcodes: allBarcodeChecks.map((x) => x.barcode),
      excludeIds: allInvolvedIds,
    })
    if (taken.size > 0) {
      const conflicting = allBarcodeChecks.find((x) => taken.has(x.barcode))
      if (conflicting) {
        throw new ApiError('CONFLICT', 'Barcode biến thể đã tồn tại trong cửa hàng', {
          field: 'barcode',
          variantIndex: conflicting.index,
        })
      }
    }
  }

  // INSERT new variants
  if (toInsert.length > 0) {
    const reservedSkus = new Set<string>()
    existing.forEach((e) => reservedSkus.add(e.sku.toLowerCase()))
    toInsert.forEach((x) => {
      if (x.v.sku) reservedSkus.add(x.v.sku.toLowerCase())
    })
    toUpdate.forEach((x) => {
      const sku = x.v.sku ?? x.existing.sku
      reservedSkus.add(sku.toLowerCase())
    })

    const insertRows: Array<{
      sku: string
      barcode: string | null
      attribute1Value: string
      attribute2Value: string | null
      sellingPrice: number
      costPrice: number | null
      stockQuantity: number
      status: string
      index: number
    }> = []

    for (const item of toInsert) {
      let sku = item.v.sku?.trim()
      if (!sku) {
        sku = await generateUniqueVariantSku({
          db: tx,
          storeId,
          parentSku,
          value1: item.v.attribute1Value,
          value2: item.v.attribute2Value ?? null,
          index: item.index,
          reserved: reservedSkus,
        })
      }
      insertRows.push({
        sku,
        barcode: item.v.barcode ?? null,
        attribute1Value: item.v.attribute1Value,
        attribute2Value: item.v.attribute2Value ?? null,
        sellingPrice: item.v.sellingPrice,
        costPrice: item.v.costPrice ?? null,
        stockQuantity: item.v.stockQuantity ?? 0,
        status: item.v.status ?? 'active',
        index: item.index,
      })
    }

    let inserted: Array<typeof productVariants.$inferSelect>
    try {
      inserted = await tx
        .insert(productVariants)
        .values(
          insertRows.map((r) => ({
            storeId,
            productId,
            sku: r.sku,
            barcode: r.barcode,
            attribute1Name: config.attribute1Name,
            attribute1Value: r.attribute1Value,
            attribute2Name: config.attribute2Name ?? null,
            attribute2Value: r.attribute2Value,
            sellingPrice: r.sellingPrice,
            costPrice: r.costPrice,
            stockQuantity: r.stockQuantity,
            status: r.status,
          })),
        )
        .returning()
    } catch (err) {
      const apiErr = mapVariantViolationToApiError(err)
      if (apiErr) throw apiErr
      throw err
    }

    for (let i = 0; i < inserted.length; i++) {
      const v = inserted[i]!
      const original = insertRows[i]!

      await logAction({
        db: tx,
        storeId,
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'product.variant_created',
        targetType: 'product_variant',
        targetId: v.id,
        changes: {
          sku: v.sku,
          attribute1Name: config.attribute1Name,
          attribute1Value: v.attribute1Value,
          attribute2Name: config.attribute2Name ?? null,
          attribute2Value: v.attribute2Value,
          sellingPrice: Number(v.sellingPrice),
          costPrice: v.costPrice === null ? null : Number(v.costPrice),
          stockQuantity: v.stockQuantity,
        },
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      })

      if (trackInventory && original.stockQuantity > 0) {
        await tx.insert(inventoryTransactions).values({
          storeId,
          productId,
          variantId: v.id,
          type: 'initial_stock',
          quantity: original.stockQuantity,
          createdBy: actor.userId,
          note: 'Khởi tạo tồn kho biến thể',
        })

        await logAction({
          db: tx,
          storeId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'product.stock_initialized',
          targetType: 'product_variant',
          targetId: v.id,
          changes: { quantity: original.stockQuantity },
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
        })
      }
    }
  }

  // UPDATE existing variants
  for (const item of toUpdate) {
    const ex = item.existing
    const v = item.v
    const setObj: Partial<typeof productVariants.$inferInsert> = {}
    const beforeRec: Record<string, unknown> = {}
    const afterRec: Record<string, unknown> = {}

    if (v.sku && v.sku !== ex.sku) {
      setObj.sku = v.sku
      beforeRec.sku = ex.sku
      afterRec.sku = v.sku
    }
    const newBarcode = v.barcode ?? null
    if (newBarcode !== ex.barcode) {
      setObj.barcode = newBarcode
      beforeRec.barcode = ex.barcode
      afterRec.barcode = newBarcode
    }
    if (v.attribute1Value !== ex.attribute1Value) {
      setObj.attribute1Value = v.attribute1Value
      beforeRec.attribute1Value = ex.attribute1Value
      afterRec.attribute1Value = v.attribute1Value
    }
    const newAttr2 = v.attribute2Value ?? null
    if (newAttr2 !== ex.attribute2Value) {
      setObj.attribute2Value = newAttr2
      beforeRec.attribute2Value = ex.attribute2Value
      afterRec.attribute2Value = newAttr2
    }
    if (v.sellingPrice !== Number(ex.sellingPrice)) {
      setObj.sellingPrice = v.sellingPrice
      beforeRec.sellingPrice = Number(ex.sellingPrice)
      afterRec.sellingPrice = v.sellingPrice
    }
    const newCost = v.costPrice ?? null
    const exCost = ex.costPrice === null ? null : Number(ex.costPrice)
    if (newCost !== exCost) {
      setObj.costPrice = newCost
      beforeRec.costPrice = exCost
      afterRec.costPrice = newCost
    }
    if (v.status && v.status !== ex.status) {
      setObj.status = v.status
      beforeRec.status = ex.status
      afterRec.status = v.status
    }
    // Sync attribute names too if config changed
    if (config.attribute1Name !== ex.attribute1Name) {
      setObj.attribute1Name = config.attribute1Name
    }
    const cfgAttr2 = config.attribute2Name ?? null
    if (cfgAttr2 !== ex.attribute2Name) {
      setObj.attribute2Name = cfgAttr2
    }

    if (Object.keys(setObj).length > 0) {
      try {
        await tx.update(productVariants).set(setObj).where(eq(productVariants.id, ex.id))
      } catch (err) {
        const apiErr = mapVariantViolationToApiError(err, item.index)
        if (apiErr) throw apiErr
        throw err
      }
    }

    const diff = diffObjects(beforeRec, afterRec)
    if (Object.keys(diff).length > 0) {
      await logAction({
        db: tx,
        storeId,
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'product.variant_updated',
        targetType: 'product_variant',
        targetId: ex.id,
        changes: diff,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      })
    }
  }

  // DELETE variants not in incoming
  for (const e of toDelete) {
    const hasTx = await hasVariantTransactions({ db: tx, variantId: e.id })
    if (hasTx) {
      await tx
        .update(productVariants)
        .set({ deletedAt: new Date(), status: 'inactive' })
        .where(eq(productVariants.id, e.id))
      await logAction({
        db: tx,
        storeId,
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'product.variant_deleted',
        targetType: 'product_variant',
        targetId: e.id,
        changes: { softDelete: true, sku: e.sku },
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      })
    } else {
      await tx.delete(productVariants).where(eq(productVariants.id, e.id))
      await logAction({
        db: tx,
        storeId,
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'product.variant_deleted',
        targetType: 'product_variant',
        targetId: e.id,
        changes: { softDelete: false, sku: e.sku },
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      })
    }
  }
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

    let variantsConfigResp: VariantsConfigResponse | null = null
    let effectiveStock: number | undefined
    if (updated.hasVariants) {
      const items = await loadVariantsForProduct({ db: tx as unknown as Db, productId: updated.id })
      variantsConfigResp = buildVariantsConfigResponse(items)
      effectiveStock = items.reduce((s, v) => s + v.stockQuantity, 0)
    }

    const unitConversions = await loadUnitConversionsForProduct({
      db: tx as unknown as Db,
      productId: updated.id,
    })

    return toProductDetail(
      updated as ProductRow,
      categoryName,
      variantsConfigResp,
      effectiveStock,
      unitConversions,
    )
  })
}

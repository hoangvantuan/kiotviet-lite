import { and, asc, eq, inArray, isNull, type SQL, sql } from 'drizzle-orm'

import {
  type ListVolumePricesQuery,
  products,
  productVariants,
  type ReplaceVolumePricesInput,
  type UserRole,
  volumePrices,
  type VolumePricesForProduct,
  type VolumePricesListItem,
  type VolumePriceTier,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { escapeLikePattern } from '../lib/strings.js'
import { logAction, type RequestMeta } from './audit.service.js'
import {
  aliveVariantCondition,
  effectiveCostPriceSql,
  effectiveSellingPriceSql,
  variantNameSql,
} from './price-variant-scope.js'
export interface VolumePricesActor {
  userId: string
  storeId: string
  role: UserRole
}

interface VolumePriceRow {
  id: string
  minQty: number
  price: number
  createdAt: Date
  updatedAt: Date
}

function toVolumePriceTier(row: VolumePriceRow): VolumePriceTier {
  return {
    id: row.id,
    minQty: Number(row.minQty),
    price: Number(row.price),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** POS-08: bộ bậc giá của biến thể, hoặc bộ bậc theo sản phẩm (variant_id null) */
function tierScope(productId: string, storeId: string, variantId: string | null): SQL {
  return and(
    eq(volumePrices.productId, productId),
    eq(volumePrices.storeId, storeId),
    variantId ? eq(volumePrices.variantId, variantId) : isNull(volumePrices.variantId),
  )!
}

/** Biến thể phải thuộc sản phẩm; trả tên, giá bán và giá vốn hiệu lực của dòng */
async function resolveVariant({
  db,
  storeId,
  product,
  variantId,
}: {
  db: Db
  storeId: string
  product: { sellingPrice: number; costPrice: number | null; id: string }
  variantId: string | null
}): Promise<{ variantName: string | null; sellingPrice: number; costPrice: number | null }> {
  if (!variantId) {
    return { variantName: null, sellingPrice: product.sellingPrice, costPrice: product.costPrice }
  }
  const [row] = await db
    .select({
      name: variantNameSql,
      sellingPrice: productVariants.sellingPrice,
      costPrice: productVariants.costPrice,
    })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.id, variantId),
        eq(productVariants.productId, product.id),
        eq(productVariants.storeId, storeId),
        isNull(productVariants.deletedAt),
      ),
    )
    .limit(1)
  if (!row) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy biến thể của sản phẩm này', {
      field: 'variantId',
    })
  }
  return {
    variantName: row.name,
    sellingPrice: Number(row.sellingPrice) > 0 ? Number(row.sellingPrice) : product.sellingPrice,
    costPrice: row.costPrice === null ? product.costPrice : Number(row.costPrice),
  }
}

async function ensureProductAlive({
  db,
  storeId,
  productId,
}: {
  db: Db
  storeId: string
  productId: string
}): Promise<{
  id: string
  name: string
  sku: string
  imageUrl: string | null
  sellingPrice: number
  costPrice: number | null
}> {
  const target = await db.query.products.findFirst({
    where: eq(products.id, productId),
  })
  if (!target || target.storeId !== storeId || target.deletedAt !== null) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy sản phẩm')
  }
  return {
    id: target.id,
    name: target.name,
    sku: target.sku,
    imageUrl: target.imageUrl,
    sellingPrice: Number(target.sellingPrice),
    costPrice: target.costPrice === null ? null : Number(target.costPrice),
  }
}

export interface ListVolumePricesDeps {
  db: Db
  storeId: string
  query: ListVolumePricesQuery
}

export interface VolumePricesListResult {
  items: VolumePricesListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export async function listVolumePrices({
  db,
  storeId,
  query,
}: ListVolumePricesDeps): Promise<VolumePricesListResult> {
  const { page, pageSize, search } = query

  const conditions: SQL[] = [
    eq(volumePrices.storeId, storeId),
    isNull(products.deletedAt),
    aliveVariantCondition(volumePrices.variantId),
  ]

  const trimmed = search?.trim()
  if (trimmed) {
    const escaped = escapeLikePattern(trimmed)
    const pattern = `%${escaped}%`
    conditions.push(
      sql`(LOWER(${products.name}) LIKE LOWER(${pattern}) OR LOWER(${products.sku}) LIKE LOWER(${pattern}))`,
    )
  }

  const whereClause = and(...conditions)

  const offset = (page - 1) * pageSize

  // Gom theo sản phẩm và biến thể (POS-08)
  const aggRows = await db
    .select({
      productId: volumePrices.productId,
      variantId: volumePrices.variantId,
      variantName: variantNameSql,
      productName: products.name,
      productSku: products.sku,
      productImageUrl: products.imageUrl,
      productSellingPrice: effectiveSellingPriceSql(products.sellingPrice),
      productCostPrice: effectiveCostPriceSql(products.costPrice),
      tierCount: sql<number>`count(${volumePrices.id})::int`,
      minPrice: sql<number>`min(${volumePrices.price})::int`,
      maxPrice: sql<number>`max(${volumePrices.price})::int`,
    })
    .from(volumePrices)
    .innerJoin(products, eq(volumePrices.productId, products.id))
    .leftJoin(productVariants, eq(volumePrices.variantId, productVariants.id))
    .where(whereClause)
    .groupBy(
      volumePrices.productId,
      volumePrices.variantId,
      productVariants.id,
      products.name,
      products.sku,
      products.imageUrl,
      products.sellingPrice,
      products.costPrice,
    )
    .orderBy(asc(products.name), sql`${volumePrices.variantId} NULLS FIRST`)
    .limit(pageSize)
    .offset(offset)

  const totalRows = await db
    .select({
      count: sql<number>`count(distinct (${volumePrices.productId}, ${volumePrices.variantId}))::int`,
    })
    .from(volumePrices)
    .innerJoin(products, eq(volumePrices.productId, products.id))
    .leftJoin(productVariants, eq(volumePrices.variantId, productVariants.id))
    .where(whereClause)

  const total = totalRows[0]?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  // Load full tiers for products in current page, then pick top 3 by minQty ASC
  const productIds = aggRows.map((r) => r.productId)
  const tiersByProduct = new Map<string, VolumePriceTier[]>()
  if (productIds.length > 0) {
    const tierRows = await db
      .select({
        id: volumePrices.id,
        productId: volumePrices.productId,
        variantId: volumePrices.variantId,
        minQty: volumePrices.minQty,
        price: volumePrices.price,
        createdAt: volumePrices.createdAt,
        updatedAt: volumePrices.updatedAt,
      })
      .from(volumePrices)
      .where(and(eq(volumePrices.storeId, storeId), inArray(volumePrices.productId, productIds)))
      .orderBy(asc(volumePrices.minQty))

    for (const row of tierRows) {
      const key = `${row.productId}:${row.variantId ?? ''}`
      const list = tiersByProduct.get(key) ?? []
      list.push(toVolumePriceTier(row as VolumePriceRow))
      tiersByProduct.set(key, list)
    }
  }

  const items: VolumePricesListItem[] = aggRows.map((r) => {
    const tiers = tiersByProduct.get(`${r.productId}:${r.variantId ?? ''}`) ?? []
    return {
      productId: r.productId,
      variantId: r.variantId,
      variantName: r.variantName,
      productName: r.productName,
      productSku: r.productSku,
      productImageUrl: r.productImageUrl,
      productSellingPrice: Number(r.productSellingPrice),
      productCostPrice: r.productCostPrice === null ? null : Number(r.productCostPrice),
      tierCount: Number(r.tierCount),
      minPrice: Number(r.minPrice),
      maxPrice: Number(r.maxPrice),
      topTiers: tiers.slice(0, 3),
    }
  })

  return { items, total, page, pageSize, totalPages }
}

export interface ListVolumePricesForProductDeps {
  db: Db
  storeId: string
  productId: string
  variantId?: string | null
}

export async function listVolumePricesForProduct({
  db,
  storeId,
  productId,
  variantId = null,
}: ListVolumePricesForProductDeps): Promise<VolumePricesForProduct> {
  const product = await ensureProductAlive({ db, storeId, productId })
  const scope = await resolveVariant({ db, storeId, product, variantId })

  const rows = await db
    .select({
      id: volumePrices.id,
      minQty: volumePrices.minQty,
      price: volumePrices.price,
      createdAt: volumePrices.createdAt,
      updatedAt: volumePrices.updatedAt,
    })
    .from(volumePrices)
    .where(tierScope(productId, storeId, variantId))
    .orderBy(asc(volumePrices.minQty))

  const tiers = rows.map((row) => toVolumePriceTier(row as VolumePriceRow))

  return {
    productId: product.id,
    productName: product.name,
    productSku: product.sku,
    productImageUrl: product.imageUrl,
    variantId,
    variantName: scope.variantName,
    productSellingPrice: scope.sellingPrice,
    productCostPrice: scope.costPrice,
    tiers,
  }
}

export interface ReplaceVolumePricesDeps {
  db: Db
  actor: VolumePricesActor
  productId: string
  input: ReplaceVolumePricesInput
  meta?: RequestMeta
}

export async function replaceVolumePricesForProduct({
  db,
  actor,
  productId,
  input,
  meta,
}: ReplaceVolumePricesDeps): Promise<VolumePricesForProduct> {
  const product = await ensureProductAlive({ db, storeId: actor.storeId, productId })
  const variantId = input.variantId ?? null
  const scope = await resolveVariant({ db, storeId: actor.storeId, product, variantId })

  const sortedTiers = [...input.tiers].sort((a, b) => a.minQty - b.minQty)

  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: volumePrices.id })
      .from(volumePrices)
      .where(tierScope(productId, actor.storeId, variantId))
    const tierCountBefore = existing.length

    await tx.delete(volumePrices).where(tierScope(productId, actor.storeId, variantId))

    if (sortedTiers.length > 0) {
      await tx.insert(volumePrices).values(
        sortedTiers.map((t) => ({
          storeId: actor.storeId,
          productId,
          variantId,
          minQty: t.minQty,
          price: t.price,
        })),
      )
    }

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'volume_prices.replaced',
      targetType: 'volume_prices',
      targetId: productId,
      changes: {
        productId,
        variantId,
        tierCountBefore,
        tierCountAfter: sortedTiers.length,
        tiers: sortedTiers.map((t) => ({ minQty: t.minQty, price: t.price })),
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    const rows = await tx
      .select({
        id: volumePrices.id,
        minQty: volumePrices.minQty,
        price: volumePrices.price,
        createdAt: volumePrices.createdAt,
        updatedAt: volumePrices.updatedAt,
      })
      .from(volumePrices)
      .where(tierScope(productId, actor.storeId, variantId))
      .orderBy(asc(volumePrices.minQty))

    return {
      productId: product.id,
      productName: product.name,
      productSku: product.sku,
      productImageUrl: product.imageUrl,
      variantId,
      variantName: scope.variantName,
      productSellingPrice: scope.sellingPrice,
      productCostPrice: scope.costPrice,
      tiers: rows.map((row) => toVolumePriceTier(row as VolumePriceRow)),
    }
  })
}

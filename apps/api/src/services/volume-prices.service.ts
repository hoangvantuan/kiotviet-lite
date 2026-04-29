import { and, asc, eq, inArray, isNull, type SQL, sql } from 'drizzle-orm'

import {
  type ListVolumePricesQuery,
  products,
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

  const conditions: SQL[] = [eq(volumePrices.storeId, storeId), isNull(products.deletedAt)]

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

  // Aggregate by product_id
  const aggRows = await db
    .select({
      productId: volumePrices.productId,
      productName: products.name,
      productSku: products.sku,
      productImageUrl: products.imageUrl,
      productSellingPrice: products.sellingPrice,
      productCostPrice: products.costPrice,
      tierCount: sql<number>`count(${volumePrices.id})::int`,
      minPrice: sql<number>`min(${volumePrices.price})::int`,
      maxPrice: sql<number>`max(${volumePrices.price})::int`,
    })
    .from(volumePrices)
    .innerJoin(products, eq(volumePrices.productId, products.id))
    .where(whereClause)
    .groupBy(
      volumePrices.productId,
      products.name,
      products.sku,
      products.imageUrl,
      products.sellingPrice,
      products.costPrice,
    )
    .orderBy(asc(products.name))
    .limit(pageSize)
    .offset(offset)

  const totalRows = await db
    .select({
      count: sql<number>`count(distinct ${volumePrices.productId})::int`,
    })
    .from(volumePrices)
    .innerJoin(products, eq(volumePrices.productId, products.id))
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
        minQty: volumePrices.minQty,
        price: volumePrices.price,
        createdAt: volumePrices.createdAt,
        updatedAt: volumePrices.updatedAt,
      })
      .from(volumePrices)
      .where(and(eq(volumePrices.storeId, storeId), inArray(volumePrices.productId, productIds)))
      .orderBy(asc(volumePrices.minQty))

    for (const row of tierRows) {
      const list = tiersByProduct.get(row.productId) ?? []
      list.push(toVolumePriceTier(row as VolumePriceRow))
      tiersByProduct.set(row.productId, list)
    }
  }

  const items: VolumePricesListItem[] = aggRows.map((r) => {
    const tiers = tiersByProduct.get(r.productId) ?? []
    return {
      productId: r.productId,
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
}

export async function listVolumePricesForProduct({
  db,
  storeId,
  productId,
}: ListVolumePricesForProductDeps): Promise<VolumePricesForProduct> {
  const product = await ensureProductAlive({ db, storeId, productId })

  const rows = await db
    .select({
      id: volumePrices.id,
      minQty: volumePrices.minQty,
      price: volumePrices.price,
      createdAt: volumePrices.createdAt,
      updatedAt: volumePrices.updatedAt,
    })
    .from(volumePrices)
    .where(and(eq(volumePrices.productId, productId), eq(volumePrices.storeId, storeId)))
    .orderBy(asc(volumePrices.minQty))

  const tiers = rows.map((row) => toVolumePriceTier(row as VolumePriceRow))

  return {
    productId: product.id,
    productName: product.name,
    productSku: product.sku,
    productImageUrl: product.imageUrl,
    productSellingPrice: product.sellingPrice,
    productCostPrice: product.costPrice,
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

  const sortedTiers = [...input.tiers].sort((a, b) => a.minQty - b.minQty)

  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: volumePrices.id })
      .from(volumePrices)
      .where(and(eq(volumePrices.productId, productId), eq(volumePrices.storeId, actor.storeId)))
    const tierCountBefore = existing.length

    await tx
      .delete(volumePrices)
      .where(and(eq(volumePrices.productId, productId), eq(volumePrices.storeId, actor.storeId)))

    if (sortedTiers.length > 0) {
      await tx.insert(volumePrices).values(
        sortedTiers.map((t) => ({
          storeId: actor.storeId,
          productId,
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
      .where(and(eq(volumePrices.productId, productId), eq(volumePrices.storeId, actor.storeId)))
      .orderBy(asc(volumePrices.minQty))

    return {
      productId: product.id,
      productName: product.name,
      productSku: product.sku,
      productImageUrl: product.imageUrl,
      productSellingPrice: product.sellingPrice,
      productCostPrice: product.costPrice,
      tiers: rows.map((row) => toVolumePriceTier(row as VolumePriceRow)),
    }
  })
}

import { and, asc, eq, isNull, type SQL, sql } from 'drizzle-orm'

import {
  applyRounding,
  type CreatePriceListItemInput,
  type PriceListItemListItem,
  priceListItems,
  priceLists,
  products,
  type RoundingRule,
  type UpdatePriceListItemInput,
  type UserRole,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { isUniqueViolation } from '../lib/pg-errors.js'
import { escapeLikePattern } from '../lib/strings.js'
import { logAction, type RequestMeta } from './audit.service.js'

export interface PriceListItemsActor {
  userId: string
  storeId: string
  role: UserRole
}

interface PriceListItemRow {
  id: string
  productId: string
  productName: string
  productSku: string
  productImageUrl: string | null
  productSellingPrice: number
  productCostPrice: number | null
  price: number
  isOverridden: boolean
  createdAt: Date
  updatedAt: Date
}

function toItem(row: PriceListItemRow): PriceListItemListItem {
  return {
    id: row.id,
    productId: row.productId,
    productName: row.productName,
    productSku: row.productSku,
    productImageUrl: row.productImageUrl,
    productSellingPrice: Number(row.productSellingPrice),
    productCostPrice: row.productCostPrice === null ? null : Number(row.productCostPrice),
    price: Number(row.price),
    isOverridden: row.isOverridden,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function ensurePriceListAlive({
  db,
  storeId,
  priceListId,
}: {
  db: Db
  storeId: string
  priceListId: string
}): Promise<{ method: string; roundingRule: RoundingRule }> {
  const target = await db.query.priceLists.findFirst({
    where: eq(priceLists.id, priceListId),
  })
  if (!target || target.storeId !== storeId || target.deletedAt !== null) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy bảng giá')
  }
  return { method: target.method, roundingRule: target.roundingRule as RoundingRule }
}

export interface ListPriceListItemsDeps {
  db: Db
  storeId: string
  priceListId: string
  query: { page: number; pageSize: number; search?: string }
}

export interface PriceListItemsResult {
  items: PriceListItemListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export async function listPriceListItems({
  db,
  storeId,
  priceListId,
  query,
}: ListPriceListItemsDeps): Promise<PriceListItemsResult> {
  await ensurePriceListAlive({ db, storeId, priceListId })

  const { page, pageSize, search } = query

  const conditions: SQL[] = [
    eq(priceListItems.priceListId, priceListId),
    isNull(products.deletedAt),
  ]

  const trimmed = search?.trim()
  if (trimmed) {
    const escaped = escapeLikePattern(trimmed)
    const pattern = `%${escaped}%`
    conditions.push(sql`LOWER(${products.name}) LIKE LOWER(${pattern})`)
  }

  const whereClause = and(...conditions)

  const offset = (page - 1) * pageSize

  const rows = await db
    .select({
      id: priceListItems.id,
      productId: priceListItems.productId,
      productName: products.name,
      productSku: products.sku,
      productImageUrl: products.imageUrl,
      productSellingPrice: products.sellingPrice,
      productCostPrice: products.costPrice,
      price: priceListItems.price,
      isOverridden: priceListItems.isOverridden,
      createdAt: priceListItems.createdAt,
      updatedAt: priceListItems.updatedAt,
    })
    .from(priceListItems)
    .innerJoin(products, eq(priceListItems.productId, products.id))
    .where(whereClause)
    .orderBy(asc(products.name))
    .limit(pageSize)
    .offset(offset)

  const totalRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(priceListItems)
    .innerJoin(products, eq(priceListItems.productId, products.id))
    .where(whereClause)

  const total = totalRows[0]?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return {
    items: rows.map((row) => toItem(row as PriceListItemRow)),
    total,
    page,
    pageSize,
    totalPages,
  }
}

async function getItemRow({
  db,
  priceListId,
  itemId,
}: {
  db: Db
  priceListId: string
  itemId: string
}): Promise<PriceListItemListItem | null> {
  const rows = await db
    .select({
      id: priceListItems.id,
      productId: priceListItems.productId,
      productName: products.name,
      productSku: products.sku,
      productImageUrl: products.imageUrl,
      productSellingPrice: products.sellingPrice,
      productCostPrice: products.costPrice,
      price: priceListItems.price,
      isOverridden: priceListItems.isOverridden,
      createdAt: priceListItems.createdAt,
      updatedAt: priceListItems.updatedAt,
    })
    .from(priceListItems)
    .innerJoin(products, eq(priceListItems.productId, products.id))
    .where(and(eq(priceListItems.priceListId, priceListId), eq(priceListItems.id, itemId)))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return toItem(row as PriceListItemRow)
}

export interface CreatePriceListItemDeps {
  db: Db
  actor: PriceListItemsActor
  priceListId: string
  input: CreatePriceListItemInput
  meta?: RequestMeta
}

export async function createPriceListItem({
  db,
  actor,
  priceListId,
  input,
  meta,
}: CreatePriceListItemDeps): Promise<PriceListItemListItem> {
  const { method, roundingRule } = await ensurePriceListAlive({
    db,
    storeId: actor.storeId,
    priceListId,
  })

  const product = await db.query.products.findFirst({
    where: eq(products.id, input.productId),
  })
  if (!product || product.storeId !== actor.storeId || product.deletedAt !== null) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy sản phẩm')
  }

  const finalPrice = applyRounding(input.price, roundingRule)
  const isOverridden = method === 'formula'

  return db.transaction(async (tx) => {
    let createdId: string
    try {
      const [row] = await tx
        .insert(priceListItems)
        .values({
          priceListId,
          productId: input.productId,
          price: finalPrice,
          isOverridden,
        })
        .returning({ id: priceListItems.id })
      if (!row) throw new ApiError('INTERNAL_ERROR', 'Không thêm được sản phẩm vào bảng giá')
      createdId = row.id
    } catch (err) {
      if (err instanceof ApiError) throw err
      if (isUniqueViolation(err, 'uniq_price_list_items_list_product')) {
        throw new ApiError('CONFLICT', 'Sản phẩm đã có trong bảng giá', { field: 'productId' })
      }
      throw err
    }

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'price_list_item.created',
      targetType: 'price_list_item',
      targetId: createdId,
      changes: {
        priceListId,
        productId: input.productId,
        price: finalPrice,
        isOverridden,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    const created = await getItemRow({ db: tx as unknown as Db, priceListId, itemId: createdId })
    if (!created) {
      throw new ApiError('INTERNAL_ERROR', 'Không lấy được item vừa tạo')
    }
    return created
  })
}

export interface UpdatePriceListItemDeps {
  db: Db
  actor: PriceListItemsActor
  priceListId: string
  itemId: string
  input: UpdatePriceListItemInput
  meta?: RequestMeta
}

export async function updatePriceListItem({
  db,
  actor,
  priceListId,
  itemId,
  input,
  meta,
}: UpdatePriceListItemDeps): Promise<PriceListItemListItem> {
  const { method, roundingRule } = await ensurePriceListAlive({
    db,
    storeId: actor.storeId,
    priceListId,
  })

  const target = await db.query.priceListItems.findFirst({
    where: and(eq(priceListItems.id, itemId), eq(priceListItems.priceListId, priceListId)),
  })
  if (!target) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy sản phẩm trong bảng giá')
  }

  const finalPrice = applyRounding(input.price, roundingRule)
  const nextIsOverridden = method === 'formula' ? true : target.isOverridden

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(priceListItems)
      .set({ price: finalPrice, isOverridden: nextIsOverridden })
      .where(eq(priceListItems.id, itemId))
      .returning({ id: priceListItems.id })
    if (!row) {
      throw new ApiError('INTERNAL_ERROR', 'Không cập nhật được giá')
    }

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'price_list_item.updated',
      targetType: 'price_list_item',
      targetId: itemId,
      changes: {
        before: { price: Number(target.price), isOverridden: target.isOverridden },
        after: { price: finalPrice, isOverridden: nextIsOverridden },
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    const updated = await getItemRow({ db: tx as unknown as Db, priceListId, itemId })
    if (!updated) {
      throw new ApiError('INTERNAL_ERROR', 'Không lấy được item vừa cập nhật')
    }
    return updated
  })
}

export interface DeletePriceListItemDeps {
  db: Db
  actor: PriceListItemsActor
  priceListId: string
  itemId: string
  meta?: RequestMeta
}

export async function deletePriceListItem({
  db,
  actor,
  priceListId,
  itemId,
  meta,
}: DeletePriceListItemDeps): Promise<{ ok: true }> {
  const { method } = await ensurePriceListAlive({
    db,
    storeId: actor.storeId,
    priceListId,
  })

  const target = await db.query.priceListItems.findFirst({
    where: and(eq(priceListItems.id, itemId), eq(priceListItems.priceListId, priceListId)),
  })
  if (!target) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy sản phẩm trong bảng giá')
  }

  if (method === 'formula' && !target.isOverridden) {
    throw new ApiError(
      'BUSINESS_RULE_VIOLATION',
      'Sản phẩm thuộc bảng giá nền, không thể xoá lẻ. Hãy xoá khỏi bảng giá nền hoặc tạm tắt bảng giá này',
    )
  }

  return db.transaction(async (tx) => {
    await tx.delete(priceListItems).where(eq(priceListItems.id, itemId))

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'price_list_item.deleted',
      targetType: 'price_list_item',
      targetId: itemId,
      changes: {
        priceListId,
        productId: target.productId,
        price: Number(target.price),
        isOverridden: target.isOverridden,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    return { ok: true as const }
  })
}

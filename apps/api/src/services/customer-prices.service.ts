import { and, asc, desc, eq, isNull, type SQL, sql } from 'drizzle-orm'

import {
  type CreateCustomerPriceInput,
  type CustomerPriceListItem,
  customerPrices,
  customers,
  type ListCustomerPricesQuery,
  products,
  type UpdateCustomerPriceInput,
  type UserRole,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { isUniqueViolation } from '../lib/pg-errors.js'
import { escapeLikePattern } from '../lib/strings.js'
import { diffObjects, logAction, type RequestMeta } from './audit.service.js'

export interface CustomerPricesActor {
  userId: string
  storeId: string
  role: UserRole
}

interface CustomerPriceRow {
  id: string
  customerId: string
  customerName: string
  customerPhone: string
  productId: string
  productName: string
  productSku: string
  productImageUrl: string | null
  productSellingPrice: number
  productCostPrice: number | null
  price: number
  note: string | null
  createdAt: Date
  updatedAt: Date
}

function toCustomerPriceListItem(row: CustomerPriceRow): CustomerPriceListItem {
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    productId: row.productId,
    productName: row.productName,
    productSku: row.productSku,
    productImageUrl: row.productImageUrl,
    productSellingPrice: Number(row.productSellingPrice),
    productCostPrice: row.productCostPrice === null ? null : Number(row.productCostPrice),
    price: Number(row.price),
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function buildSelectColumns() {
  return {
    id: customerPrices.id,
    customerId: customerPrices.customerId,
    customerName: customers.name,
    customerPhone: customers.phone,
    productId: customerPrices.productId,
    productName: products.name,
    productSku: products.sku,
    productImageUrl: products.imageUrl,
    productSellingPrice: products.sellingPrice,
    productCostPrice: products.costPrice,
    price: customerPrices.price,
    note: customerPrices.note,
    createdAt: customerPrices.createdAt,
    updatedAt: customerPrices.updatedAt,
  }
}

export interface ListCustomerPricesDeps {
  db: Db
  storeId: string
  query: ListCustomerPricesQuery
}

export interface CustomerPriceListResult {
  items: CustomerPriceListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export async function listCustomerPrices({
  db,
  storeId,
  query,
}: ListCustomerPricesDeps): Promise<CustomerPriceListResult> {
  const { page, pageSize, customerId, productId, search } = query

  const conditions: SQL[] = [
    eq(customerPrices.storeId, storeId),
    isNull(customers.deletedAt),
    isNull(products.deletedAt),
  ]

  if (customerId) {
    conditions.push(eq(customerPrices.customerId, customerId))
  }
  if (productId) {
    conditions.push(eq(customerPrices.productId, productId))
  }

  const trimmed = search?.trim()
  if (trimmed) {
    const escaped = escapeLikePattern(trimmed)
    const pattern = `%${escaped}%`
    conditions.push(
      sql`(LOWER(${customers.name}) LIKE LOWER(${pattern}) OR LOWER(${products.name}) LIKE LOWER(${pattern}) OR LOWER(${products.sku}) LIKE LOWER(${pattern}))`,
    )
  }

  const whereClause = and(...conditions)

  const offset = (page - 1) * pageSize

  const rows = await db
    .select(buildSelectColumns())
    .from(customerPrices)
    .innerJoin(customers, eq(customerPrices.customerId, customers.id))
    .innerJoin(products, eq(customerPrices.productId, products.id))
    .where(whereClause)
    .orderBy(desc(customerPrices.createdAt), asc(customers.name))
    .limit(pageSize)
    .offset(offset)

  const totalRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customerPrices)
    .innerJoin(customers, eq(customerPrices.customerId, customers.id))
    .innerJoin(products, eq(customerPrices.productId, products.id))
    .where(whereClause)

  const total = totalRows[0]?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return {
    items: rows.map((row) => toCustomerPriceListItem(row as CustomerPriceRow)),
    total,
    page,
    pageSize,
    totalPages,
  }
}

async function getCustomerPriceRow({
  db,
  storeId,
  id,
}: {
  db: Db
  storeId: string
  id: string
}): Promise<CustomerPriceListItem | null> {
  const rows = await db
    .select(buildSelectColumns())
    .from(customerPrices)
    .innerJoin(customers, eq(customerPrices.customerId, customers.id))
    .innerJoin(products, eq(customerPrices.productId, products.id))
    .where(and(eq(customerPrices.id, id), eq(customerPrices.storeId, storeId)))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return toCustomerPriceListItem(row as CustomerPriceRow)
}

export interface GetCustomerPriceDeps {
  db: Db
  storeId: string
  id: string
}

export async function getCustomerPrice({
  db,
  storeId,
  id,
}: GetCustomerPriceDeps): Promise<CustomerPriceListItem> {
  const row = await getCustomerPriceRow({ db, storeId, id })
  if (!row) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy giá riêng')
  }
  return row
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

async function ensureProductAlive({
  db,
  storeId,
  productId,
}: {
  db: Db
  storeId: string
  productId: string
}): Promise<void> {
  const target = await db.query.products.findFirst({
    where: eq(products.id, productId),
  })
  if (!target || target.storeId !== storeId || target.deletedAt !== null) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy sản phẩm')
  }
}

export interface CreateCustomerPriceDeps {
  db: Db
  actor: CustomerPricesActor
  input: CreateCustomerPriceInput
  meta?: RequestMeta
}

export async function createCustomerPrice({
  db,
  actor,
  input,
  meta,
}: CreateCustomerPriceDeps): Promise<CustomerPriceListItem> {
  await ensureCustomerAlive({ db, storeId: actor.storeId, customerId: input.customerId })
  await ensureProductAlive({ db, storeId: actor.storeId, productId: input.productId })

  return db.transaction(async (tx) => {
    let createdId: string
    try {
      const [row] = await tx
        .insert(customerPrices)
        .values({
          storeId: actor.storeId,
          customerId: input.customerId,
          productId: input.productId,
          price: input.price,
          note: input.note ?? null,
        })
        .returning({ id: customerPrices.id })
      if (!row) throw new ApiError('INTERNAL_ERROR', 'Không tạo được giá riêng')
      createdId = row.id
    } catch (err) {
      if (err instanceof ApiError) throw err
      if (isUniqueViolation(err, 'uniq_customer_prices_customer_product')) {
        throw new ApiError('CONFLICT', 'Khách hàng đã có giá riêng cho sản phẩm này', {
          field: 'productId',
        })
      }
      throw err
    }

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'customer_price.created',
      targetType: 'customer_price',
      targetId: createdId,
      changes: {
        customerId: input.customerId,
        productId: input.productId,
        price: input.price,
        note: input.note ?? null,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    const created = await getCustomerPriceRow({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      id: createdId,
    })
    if (!created) {
      throw new ApiError('INTERNAL_ERROR', 'Không lấy được giá riêng vừa tạo')
    }
    return created
  })
}

export interface UpdateCustomerPriceDeps {
  db: Db
  actor: CustomerPricesActor
  id: string
  input: UpdateCustomerPriceInput
  meta?: RequestMeta
}

export async function updateCustomerPrice({
  db,
  actor,
  id,
  input,
  meta,
}: UpdateCustomerPriceDeps): Promise<CustomerPriceListItem> {
  const target = await db.query.customerPrices.findFirst({
    where: eq(customerPrices.id, id),
  })
  if (!target || target.storeId !== actor.storeId) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy giá riêng')
  }

  const updates: Partial<typeof customerPrices.$inferInsert> = {}
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}

  if (input.price !== undefined && input.price !== Number(target.price)) {
    updates.price = input.price
    before.price = Number(target.price)
    after.price = input.price
  }
  if (input.note !== undefined && (input.note ?? null) !== target.note) {
    updates.note = input.note ?? null
    before.note = target.note
    after.note = input.note ?? null
  }

  if (Object.keys(updates).length === 0) {
    return getCustomerPrice({ db, storeId: actor.storeId, id })
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(customerPrices)
      .set(updates)
      .where(and(eq(customerPrices.id, id), eq(customerPrices.storeId, actor.storeId)))
      .returning({ id: customerPrices.id })
    if (!row) {
      throw new ApiError('INTERNAL_ERROR', 'Không cập nhật được giá riêng')
    }

    const fieldDiff = diffObjects(before, after)
    if (Object.keys(fieldDiff).length > 0) {
      await logAction({
        db: tx as unknown as Db,
        storeId: actor.storeId,
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'customer_price.updated',
        targetType: 'customer_price',
        targetId: id,
        changes: fieldDiff,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      })
    }

    const updated = await getCustomerPriceRow({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      id,
    })
    if (!updated) {
      throw new ApiError('INTERNAL_ERROR', 'Không lấy được giá riêng vừa cập nhật')
    }
    return updated
  })
}

export interface DeleteCustomerPriceDeps {
  db: Db
  actor: CustomerPricesActor
  id: string
  meta?: RequestMeta
}

export async function deleteCustomerPrice({
  db,
  actor,
  id,
  meta,
}: DeleteCustomerPriceDeps): Promise<{ ok: true }> {
  const target = await db.query.customerPrices.findFirst({
    where: eq(customerPrices.id, id),
  })
  if (!target || target.storeId !== actor.storeId) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy giá riêng')
  }

  return db.transaction(async (tx) => {
    await tx.delete(customerPrices).where(eq(customerPrices.id, id))

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'customer_price.deleted',
      targetType: 'customer_price',
      targetId: id,
      changes: {
        customerId: target.customerId,
        productId: target.productId,
        price: Number(target.price),
        note: target.note,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    return { ok: true as const }
  })
}

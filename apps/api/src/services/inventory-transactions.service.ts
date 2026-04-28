import { and, desc, eq, isNull, sql } from 'drizzle-orm'

import {
  type InventoryTransactionItem,
  inventoryTransactions,
  type ListInventoryTransactionsQuery,
  type ProductDetail,
  type ProductListItem,
  products,
  productVariants,
  type RecordManualAdjustInput,
  type RecordPurchaseInput,
  type UserRole,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { logAction, type RequestMeta } from './audit.service.js'
import { getProduct } from './products.service.js'

export interface InventoryActor {
  userId: string
  storeId: string
  role: UserRole
}

interface InventoryTransactionRow {
  id: string
  storeId: string
  productId: string
  variantId: string | null
  type: string
  quantity: number
  unitCost: number | null
  costAfter: number | null
  stockAfter: number | null
  note: string | null
  createdBy: string
  createdAt: Date
}

export function toInventoryTransactionItem(row: InventoryTransactionRow): InventoryTransactionItem {
  return {
    id: row.id,
    productId: row.productId,
    variantId: row.variantId,
    type: row.type as InventoryTransactionItem['type'],
    quantity: row.quantity,
    unitCost: row.unitCost === null ? null : Number(row.unitCost),
    costAfter: row.costAfter === null ? null : Number(row.costAfter),
    stockAfter: row.stockAfter,
    note: row.note,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  }
}

async function loadProductForUpdate({
  tx,
  storeId,
  productId,
}: {
  tx: Db
  storeId: string
  productId: string
}) {
  const rows = await tx
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .for('update')
    .limit(1)
  const target = rows[0]
  if (!target || target.storeId !== storeId || target.deletedAt !== null) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy sản phẩm')
  }
  return target
}

async function aggregateVariantStock({
  tx,
  productId,
}: {
  tx: Db
  productId: string
}): Promise<number> {
  const rows = await tx
    .select({
      total: sql<number>`COALESCE(SUM(${productVariants.stockQuantity}), 0)::int`,
    })
    .from(productVariants)
    .where(and(eq(productVariants.productId, productId), isNull(productVariants.deletedAt)))
  return Number(rows[0]?.total ?? 0)
}

async function loadVariantForUpdate({
  tx,
  productId,
  variantId,
}: {
  tx: Db
  productId: string
  variantId: string
}) {
  const rows = await tx
    .select()
    .from(productVariants)
    .where(eq(productVariants.id, variantId))
    .for('update')
    .limit(1)
  const v = rows[0]
  if (!v || v.productId !== productId || v.deletedAt !== null) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy biến thể')
  }
  return v
}

export interface RecordPurchaseDeps {
  db: Db
  actor: InventoryActor
  productId: string
  input: RecordPurchaseInput
  meta?: RequestMeta
}

export interface RecordPurchaseResult {
  product: ProductDetail
  transaction: InventoryTransactionItem
}

export async function recordPurchaseTransaction({
  db,
  actor,
  productId,
  input,
  meta,
}: RecordPurchaseDeps): Promise<RecordPurchaseResult> {
  if (input.quantity <= 0) {
    throw new ApiError('BUSINESS_RULE_VIOLATION', 'Số lượng nhập phải > 0')
  }

  const txResult = await db.transaction(async (tx) => {
    const product = await loadProductForUpdate({
      tx: tx as unknown as Db,
      storeId: actor.storeId,
      productId,
    })

    const variantId = input.variantId ?? null
    if (product.hasVariants && !variantId) {
      throw new ApiError('VALIDATION_ERROR', 'Sản phẩm có biến thể, vui lòng chọn biến thể nhập')
    }
    if (!product.hasVariants && variantId) {
      throw new ApiError('VALIDATION_ERROR', 'Sản phẩm không có biến thể')
    }

    let stockBefore: number
    let variantStockAfter: number | null = null

    if (product.hasVariants && variantId) {
      const variant = await loadVariantForUpdate({
        tx: tx as unknown as Db,
        productId,
        variantId,
      })
      stockBefore = await aggregateVariantStock({
        tx: tx as unknown as Db,
        productId,
      })
      variantStockAfter = variant.stockQuantity + input.quantity
      await tx
        .update(productVariants)
        .set({ stockQuantity: variantStockAfter })
        .where(eq(productVariants.id, variantId))
    } else {
      stockBefore = product.currentStock
    }

    const costBefore = product.costPrice === null ? null : Number(product.costPrice)
    const newStock = stockBefore + input.quantity
    let costAfter: number
    if (costBefore === null || stockBefore <= 0) {
      costAfter = input.unitCost
    } else {
      costAfter = Math.round(
        (stockBefore * costBefore + input.quantity * input.unitCost) / newStock,
      )
    }

    const productUpdates: Partial<typeof products.$inferInsert> = { costPrice: costAfter }
    if (!product.hasVariants) {
      productUpdates.currentStock = newStock
    }
    await tx.update(products).set(productUpdates).where(eq(products.id, productId))

    const stockAfterSnapshot = product.hasVariants ? variantStockAfter : newStock

    const [txRow] = await tx
      .insert(inventoryTransactions)
      .values({
        storeId: actor.storeId,
        productId,
        variantId,
        type: 'purchase',
        quantity: input.quantity,
        unitCost: input.unitCost,
        costAfter,
        stockAfter: stockAfterSnapshot,
        note: input.note ?? null,
        createdBy: actor.userId,
      })
      .returning()
    if (!txRow) throw new ApiError('INTERNAL_ERROR', 'Không tạo được giao dịch nhập')

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'inventory.purchase_recorded',
      targetType: 'product',
      targetId: productId,
      changes: {
        variantId,
        quantity: input.quantity,
        unitCost: input.unitCost,
        // stockBefore/stockAfter ở cấp product (sum khi hasVariants)
        stockBefore,
        stockAfter: newStock,
        // Snapshot cấp variant để khớp với inventory_transactions.stockAfter
        variantStockAfter,
        costBefore,
        costAfter,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    return { transactionRow: txRow as InventoryTransactionRow }
  })

  const productDetail = await getProduct({
    db,
    storeId: actor.storeId,
    productId,
  })

  return {
    product: productDetail,
    transaction: toInventoryTransactionItem(txResult.transactionRow),
  }
}

export interface RecordManualAdjustDeps {
  db: Db
  actor: InventoryActor
  productId: string
  input: RecordManualAdjustInput
  meta?: RequestMeta
}

export async function recordManualAdjustment({
  db,
  actor,
  productId,
  input,
  meta,
}: RecordManualAdjustDeps): Promise<RecordPurchaseResult> {
  if (input.delta === 0) {
    throw new ApiError('VALIDATION_ERROR', 'Delta phải khác 0')
  }

  const txResult = await db.transaction(async (tx) => {
    const product = await loadProductForUpdate({
      tx: tx as unknown as Db,
      storeId: actor.storeId,
      productId,
    })

    const variantId = input.variantId ?? null
    if (product.hasVariants && !variantId) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'Sản phẩm có biến thể, vui lòng chọn biến thể điều chỉnh',
      )
    }
    if (!product.hasVariants && variantId) {
      throw new ApiError('VALIDATION_ERROR', 'Sản phẩm không có biến thể')
    }

    let stockBefore: number
    let stockAfter: number

    if (product.hasVariants && variantId) {
      const variant = await loadVariantForUpdate({
        tx: tx as unknown as Db,
        productId,
        variantId,
      })
      stockBefore = variant.stockQuantity
      stockAfter = stockBefore + input.delta
      if (stockAfter < 0) {
        throw new ApiError('BUSINESS_RULE_VIOLATION', 'Điều chỉnh khiến tồn về âm')
      }
      await tx
        .update(productVariants)
        .set({ stockQuantity: stockAfter })
        .where(eq(productVariants.id, variantId))
    } else {
      stockBefore = product.currentStock
      stockAfter = stockBefore + input.delta
      if (stockAfter < 0) {
        throw new ApiError('BUSINESS_RULE_VIOLATION', 'Điều chỉnh khiến tồn về âm')
      }
      await tx.update(products).set({ currentStock: stockAfter }).where(eq(products.id, productId))
    }

    const noteText = input.note ? `${input.reason} - ${input.note}` : input.reason

    const [txRow] = await tx
      .insert(inventoryTransactions)
      .values({
        storeId: actor.storeId,
        productId,
        variantId,
        type: 'manual_adjustment',
        quantity: input.delta,
        unitCost: null,
        costAfter: null,
        stockAfter,
        note: noteText,
        createdBy: actor.userId,
      })
      .returning()
    if (!txRow) throw new ApiError('INTERNAL_ERROR', 'Không tạo được giao dịch điều chỉnh')

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'inventory.manual_adjusted',
      targetType: 'product',
      targetId: productId,
      changes: {
        variantId,
        delta: input.delta,
        reason: input.reason,
        stockBefore,
        stockAfter,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    return { transactionRow: txRow as InventoryTransactionRow }
  })

  const productDetail = await getProduct({
    db,
    storeId: actor.storeId,
    productId,
  })

  return {
    product: productDetail,
    transaction: toInventoryTransactionItem(txResult.transactionRow),
  }
}

export interface ListInventoryTransactionsDeps {
  db: Db
  storeId: string
  productId: string
  query: ListInventoryTransactionsQuery
}

export interface ListInventoryTransactionsResult {
  items: InventoryTransactionItem[]
  total: number
}

export async function listInventoryTransactions({
  db,
  storeId,
  productId,
  query,
}: ListInventoryTransactionsDeps): Promise<ListInventoryTransactionsResult> {
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
  })
  if (!product || product.storeId !== storeId) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy sản phẩm')
  }

  const offset = (query.page - 1) * query.pageSize
  const rows = await db
    .select()
    .from(inventoryTransactions)
    .where(
      and(
        eq(inventoryTransactions.productId, productId),
        eq(inventoryTransactions.storeId, storeId),
      ),
    )
    .orderBy(desc(inventoryTransactions.createdAt))
    .limit(query.pageSize)
    .offset(offset)

  const totalRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryTransactions)
    .where(
      and(
        eq(inventoryTransactions.productId, productId),
        eq(inventoryTransactions.storeId, storeId),
      ),
    )
  const total = totalRows[0]?.count ?? 0

  return {
    items: rows.map((r) => toInventoryTransactionItem(r as InventoryTransactionRow)),
    total,
  }
}

export interface LowStockDeps {
  db: Db
  storeId: string
}

export interface LowStockListDeps extends LowStockDeps {
  page?: number
  pageSize?: number
}

function lowStockEffectiveSql() {
  return sql`(CASE WHEN ${products.hasVariants} THEN COALESCE((SELECT SUM(${productVariants.stockQuantity}) FROM ${productVariants} WHERE ${productVariants.productId} = ${products.id} AND ${productVariants.deletedAt} IS NULL), 0) ELSE ${products.currentStock} END)`
}

export async function getLowStockCount({ db, storeId }: LowStockDeps): Promise<number> {
  const effective = lowStockEffectiveSql()
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(
      and(
        eq(products.storeId, storeId),
        isNull(products.deletedAt),
        eq(products.trackInventory, true),
        sql`${products.minStock} > 0`,
        sql`${effective} <= ${products.minStock}`,
      ),
    )
  return rows[0]?.count ?? 0
}

export interface LowStockListResult {
  items: ProductListItem[]
  total: number
}

export async function listLowStockProducts({
  db,
  storeId,
  page = 1,
  pageSize = 50,
}: LowStockListDeps): Promise<LowStockListResult> {
  const effective = lowStockEffectiveSql()
  const whereClause = and(
    eq(products.storeId, storeId),
    isNull(products.deletedAt),
    eq(products.trackInventory, true),
    sql`${products.minStock} > 0`,
    sql`${effective} <= ${products.minStock}`,
  )

  const offset = (page - 1) * pageSize
  const rows = await db
    .select({
      id: products.id,
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
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      effectiveStock: sql<number>`${effective}::int`,
    })
    .from(products)
    .where(whereClause)
    .orderBy(sql`(${effective} - ${products.minStock}) ASC`, desc(products.updatedAt))
    .limit(pageSize)
    .offset(offset)

  const totalRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(whereClause)
  const total = totalRows[0]?.count ?? 0

  const items: ProductListItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    sku: r.sku,
    barcode: r.barcode,
    categoryId: r.categoryId,
    categoryName: null,
    sellingPrice: Number(r.sellingPrice),
    costPrice: r.costPrice === null ? null : Number(r.costPrice),
    unit: r.unit,
    imageUrl: r.imageUrl,
    status: (r.status as ProductListItem['status']) ?? 'active',
    trackInventory: r.trackInventory,
    currentStock: Number(r.effectiveStock),
    minStock: r.minStock,
    hasVariants: r.hasVariants,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }))

  return { items, total }
}

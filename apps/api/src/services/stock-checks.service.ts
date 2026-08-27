import { and, asc, desc, eq, gte, ilike, isNull, like, lte, type SQL, sql } from 'drizzle-orm'

import {
  type CreateStockCheckInput,
  inventoryTransactions,
  type ListStockChecksQuery,
  type NegativeStockDetail,
  products,
  productVariants,
  type StockCheckCounts,
  type StockCheckDetail,
  type StockCheckItemDetail,
  type StockCheckItemInput,
  stockCheckItems,
  type StockCheckListItem,
  stockCheckLogs,
  stockChecks,
  type StockCheckStatus,
  type UpdateStockCheckInput,
  type UserRole,
  users,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'
import { isUniqueViolation } from '../lib/pg-errors.js'
import { escapeLikePattern } from '../lib/strings.js'
import { logAction, type RequestMeta } from './audit.service.js'
import {
  aggregateVariantStock,
  loadProductForUpdate,
  loadVariantForUpdate,
} from './products-lock.helper.js'

export interface StockCheckActor {
  userId: string
  storeId: string
  role: UserRole
}

const DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function formatStockCheckDateForCode(date: Date): string {
  return DATE_FORMATTER.format(date).replace(/-/g, '')
}

const MAX_DAILY_SC_SEQUENCE = 9999

async function generateStockCheckCode({
  tx,
  storeId,
  now,
}: {
  tx: Db
  storeId: string
  now: Date
}): Promise<string> {
  const dateStr = formatStockCheckDateForCode(now)
  const prefix = `KK-${dateStr}-`
  const escapedPrefix = escapeLikePattern(prefix)

  const rows = await tx
    .select({ code: sql<string>`MAX(${stockChecks.code})` })
    .from(stockChecks)
    .where(and(eq(stockChecks.storeId, storeId), like(stockChecks.code, `${escapedPrefix}%`)))

  const maxCode = rows[0]?.code ?? null
  const nextSeq = maxCode ? parseInt(maxCode.slice(-4), 10) + 1 : 1
  if (nextSeq > MAX_DAILY_SC_SEQUENCE) {
    throw new ApiError(
      'BUSINESS_RULE_VIOLATION',
      'Đã vượt quá 9999 phiếu kiểm kho trong ngày, vui lòng liên hệ hỗ trợ',
    )
  }
  return `${prefix}${String(nextSeq).padStart(4, '0')}`
}

function incrementCodeSequence(code: string): string {
  const seqStr = code.slice(-4)
  const next = parseInt(seqStr, 10) + 1
  if (next > MAX_DAILY_SC_SEQUENCE) {
    throw new ApiError(
      'BUSINESS_RULE_VIOLATION',
      'Đã vượt quá 9999 phiếu kiểm kho trong ngày, vui lòng liên hệ hỗ trợ',
    )
  }
  return `${code.slice(0, -4)}${String(next).padStart(4, '0')}`
}

export interface StockCheckTotals {
  totalItems: number
  totalDiffPositive: number
  totalDiffNegative: number
}

export function recomputeStockCheckTotals(items: { diff: number }[]): StockCheckTotals {
  let pos = 0
  let neg = 0
  for (const it of items) {
    if (it.diff > 0) pos += it.diff
    else if (it.diff < 0) neg += -it.diff
  }
  return {
    totalItems: items.length,
    totalDiffPositive: pos,
    totalDiffNegative: neg,
  }
}

interface ResolvedItem {
  productId: string
  variantId: string | null
  productNameSnapshot: string
  productSkuSnapshot: string
  variantLabelSnapshot: string | null
  systemQty: number
  actualQty: number
  diff: number
  note: string | null
}

async function resolveItems({
  tx,
  storeId,
  inputItems,
}: {
  tx: Db
  storeId: string
  inputItems: StockCheckItemInput[]
}): Promise<ResolvedItem[]> {
  const seen = new Set<string>()
  const resolved: ResolvedItem[] = []

  for (const item of inputItems) {
    const key = `${item.productId}::${item.variantId ?? ''}`
    if (seen.has(key)) {
      throw new ApiError(
        'BUSINESS_RULE_VIOLATION',
        'Sản phẩm xuất hiện nhiều lần trong phiếu kiểm, vui lòng gộp dòng',
      )
    }
    seen.add(key)

    const productRows = await tx
      .select()
      .from(products)
      .where(
        and(
          eq(products.id, item.productId),
          eq(products.storeId, storeId),
          isNull(products.deletedAt),
        ),
      )
      .limit(1)
    const product = productRows[0]
    if (!product) {
      throw new ApiError('NOT_FOUND', 'Không tìm thấy sản phẩm')
    }

    const variantId = item.variantId ?? null
    if (product.hasVariants && !variantId) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'Sản phẩm có biến thể, vui lòng chọn biến thể khi kiểm kho',
      )
    }
    if (!product.hasVariants && variantId) {
      throw new ApiError('VALIDATION_ERROR', 'Sản phẩm không có biến thể')
    }

    let variantLabelSnapshot: string | null = null
    let systemQty: number

    if (product.hasVariants && variantId) {
      const variantRows = await tx
        .select()
        .from(productVariants)
        .where(
          and(
            eq(productVariants.id, variantId),
            eq(productVariants.productId, product.id),
            isNull(productVariants.deletedAt),
          ),
        )
        .limit(1)
      const variant = variantRows[0]
      if (!variant) {
        throw new ApiError('NOT_FOUND', 'Không tìm thấy biến thể')
      }
      variantLabelSnapshot = variant.attribute2Value
        ? `${variant.attribute1Value} - ${variant.attribute2Value}`
        : variant.attribute1Value
      systemQty = variant.stockQuantity
    } else {
      systemQty = product.currentStock
    }

    const diff = item.actualQty - systemQty

    resolved.push({
      productId: product.id,
      variantId,
      productNameSnapshot: product.name,
      productSkuSnapshot: product.sku,
      variantLabelSnapshot,
      systemQty,
      actualQty: item.actualQty,
      diff,
      note: item.note?.trim() ? item.note.trim() : null,
    })
  }

  return resolved
}

export interface CreateStockCheckDeps {
  db: Db
  actor: StockCheckActor
  input: CreateStockCheckInput
  meta?: RequestMeta
}

export async function createStockCheck({
  db,
  actor,
  input,
  meta,
}: CreateStockCheckDeps): Promise<StockCheckDetail> {
  if (!input.items || input.items.length === 0) {
    throw new ApiError('VALIDATION_ERROR', 'Phiếu kiểm phải có ít nhất 1 dòng sản phẩm')
  }

  const stockCheckId = await db.transaction(async (tx) => {
    const txDb = tx as unknown as Db

    const resolved = await resolveItems({
      tx: txDb,
      storeId: actor.storeId,
      inputItems: input.items,
    })
    const totals = recomputeStockCheckTotals(resolved)

    const noteValue = input.note?.trim() ? input.note.trim() : null

    let code = await generateStockCheckCode({ tx: txDb, storeId: actor.storeId, now: new Date() })
    let createdId: string | null = null
    let attempts = 0
    const MAX_ATTEMPTS = 3
    while (attempts < MAX_ATTEMPTS && createdId === null) {
      try {
        const [row] = await tx
          .insert(stockChecks)
          .values({
            storeId: actor.storeId,
            code,
            status: 'draft',
            note: noteValue,
            totalItems: totals.totalItems,
            totalDiffPositive: totals.totalDiffPositive,
            totalDiffNegative: totals.totalDiffNegative,
            createdBy: actor.userId,
          })
          .returning({ id: stockChecks.id })
        if (!row) {
          throw new ApiError('INTERNAL_ERROR', 'Không tạo được phiếu kiểm kho')
        }
        createdId = row.id
      } catch (err) {
        if (isUniqueViolation(err, 'uniq_stock_checks_store_code')) {
          attempts++
          if (attempts >= MAX_ATTEMPTS) {
            throw new ApiError(
              'INTERNAL_ERROR',
              'Không thể sinh mã phiếu kiểm kho, vui lòng thử lại',
            )
          }
          const nextCode = incrementCodeSequence(code)
          logger.warn(
            { storeId: actor.storeId, code, nextCode, attempt: attempts },
            'stock_check.code_collision_retry',
          )
          code = nextCode
          continue
        }
        throw err
      }
    }
    if (!createdId) {
      throw new ApiError('INTERNAL_ERROR', 'Không tạo được phiếu kiểm kho')
    }

    for (const item of resolved) {
      await tx.insert(stockCheckItems).values({
        stockCheckId: createdId,
        productId: item.productId,
        variantId: item.variantId,
        productNameSnapshot: item.productNameSnapshot,
        productSkuSnapshot: item.productSkuSnapshot,
        variantLabelSnapshot: item.variantLabelSnapshot,
        systemQty: item.systemQty,
        actualQty: item.actualQty,
        diff: item.diff,
        note: item.note,
      })
    }

    await logAction({
      db: txDb,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'stock_check.created',
      targetType: 'stock_check',
      targetId: createdId,
      changes: {
        code,
        itemCount: totals.totalItems,
        totalDiffPositive: totals.totalDiffPositive,
        totalDiffNegative: totals.totalDiffNegative,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    logger.info(
      {
        entity: 'stock_check',
        entityId: createdId,
        action: 'create',
        storeId: actor.storeId,
        userId: actor.userId,
        code,
        itemCount: totals.totalItems,
      },
      'stock_check.created',
    )

    return createdId
  })

  return getStockCheckById({ db, storeId: actor.storeId, stockCheckId })
}

export interface UpdateStockCheckDeps {
  db: Db
  actor: StockCheckActor
  stockCheckId: string
  input: UpdateStockCheckInput
  meta?: RequestMeta
}

export async function updateStockCheck({
  db,
  actor,
  stockCheckId,
  input,
  meta,
}: UpdateStockCheckDeps): Promise<StockCheckDetail> {
  await db.transaction(async (tx) => {
    const txDb = tx as unknown as Db
    const rows = await tx
      .select()
      .from(stockChecks)
      .where(and(eq(stockChecks.id, stockCheckId), eq(stockChecks.storeId, actor.storeId)))
      .for('update')
      .limit(1)
    const current = rows[0]
    if (!current) {
      throw new ApiError('NOT_FOUND', 'Không tìm thấy phiếu kiểm kho')
    }
    if (current.status !== 'draft') {
      throw new ApiError('CONFLICT', 'Phiếu đã xác nhận, không thể chỉnh sửa')
    }

    const noteValue =
      input.note === undefined ? current.note : input.note?.trim() ? input.note.trim() : null

    let totals: StockCheckTotals = {
      totalItems: current.totalItems,
      totalDiffPositive: current.totalDiffPositive,
      totalDiffNegative: current.totalDiffNegative,
    }

    if (input.items) {
      const resolved = await resolveItems({
        tx: txDb,
        storeId: actor.storeId,
        inputItems: input.items,
      })
      totals = recomputeStockCheckTotals(resolved)

      await tx.delete(stockCheckItems).where(eq(stockCheckItems.stockCheckId, stockCheckId))

      for (const item of resolved) {
        await tx.insert(stockCheckItems).values({
          stockCheckId,
          productId: item.productId,
          variantId: item.variantId,
          productNameSnapshot: item.productNameSnapshot,
          productSkuSnapshot: item.productSkuSnapshot,
          variantLabelSnapshot: item.variantLabelSnapshot,
          systemQty: item.systemQty,
          actualQty: item.actualQty,
          diff: item.diff,
          note: item.note,
        })
      }
    }

    await tx
      .update(stockChecks)
      .set({
        note: noteValue,
        totalItems: totals.totalItems,
        totalDiffPositive: totals.totalDiffPositive,
        totalDiffNegative: totals.totalDiffNegative,
      })
      .where(and(eq(stockChecks.id, stockCheckId), eq(stockChecks.storeId, actor.storeId)))

    await logAction({
      db: txDb,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'stock_check.updated',
      targetType: 'stock_check',
      targetId: stockCheckId,
      changes: {
        code: current.code,
        before: {
          totalItems: current.totalItems,
          totalDiffPositive: current.totalDiffPositive,
          totalDiffNegative: current.totalDiffNegative,
          note: current.note,
        },
        after: {
          totalItems: totals.totalItems,
          totalDiffPositive: totals.totalDiffPositive,
          totalDiffNegative: totals.totalDiffNegative,
          note: noteValue,
        },
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    logger.info(
      {
        entity: 'stock_check',
        entityId: stockCheckId,
        action: 'update',
        storeId: actor.storeId,
        userId: actor.userId,
        code: current.code,
      },
      'stock_check.updated',
    )
  })

  return getStockCheckById({ db, storeId: actor.storeId, stockCheckId })
}

export interface ConfirmStockCheckDeps {
  db: Db
  actor: StockCheckActor
  stockCheckId: string
  meta?: RequestMeta
}

export async function confirmStockCheck({
  db,
  actor,
  stockCheckId,
  meta,
}: ConfirmStockCheckDeps): Promise<StockCheckDetail> {
  await db.transaction(async (tx) => {
    const txDb = tx as unknown as Db
    const headerRows = await tx
      .select()
      .from(stockChecks)
      .where(and(eq(stockChecks.id, stockCheckId), eq(stockChecks.storeId, actor.storeId)))
      .for('update')
      .limit(1)
    const header = headerRows[0]
    if (!header) {
      throw new ApiError('NOT_FOUND', 'Không tìm thấy phiếu kiểm kho')
    }
    if (header.status !== 'draft') {
      throw new ApiError('CONFLICT', 'Phiếu đã xác nhận, không thể xác nhận lần nữa')
    }

    const itemRows = await tx
      .select()
      .from(stockCheckItems)
      .where(eq(stockCheckItems.stockCheckId, stockCheckId))
      .orderBy(asc(stockCheckItems.productId))
    if (itemRows.length === 0) {
      throw new ApiError('BUSINESS_RULE_VIOLATION', 'Phiếu kiểm trống, không thể xác nhận')
    }

    const negativeErrors: NegativeStockDetail[] = []
    interface ProcessedConfirm {
      itemId: string
      productId: string
      variantId: string | null
      diff: number
      systemQtyAtConfirm: number
      newStock: number
      productCostPrice: number | null
    }
    const processed: ProcessedConfirm[] = []

    for (const item of itemRows) {
      if (item.diff === 0) continue

      const product = await loadProductForUpdate({
        tx: txDb,
        storeId: actor.storeId,
        productId: item.productId,
      })

      let currentStock: number
      if (item.variantId) {
        const variant = await loadVariantForUpdate({
          tx: txDb,
          productId: product.id,
          variantId: item.variantId,
        })
        currentStock = variant.stockQuantity
      } else if (product.hasVariants) {
        currentStock = await aggregateVariantStock({ tx: txDb, productId: product.id })
      } else {
        currentStock = product.currentStock
      }

      const newStock = currentStock + item.diff
      if (newStock < 0) {
        negativeErrors.push({
          productId: product.id,
          variantId: item.variantId,
          productName: item.productNameSnapshot,
          variantLabel: item.variantLabelSnapshot,
          currentStock,
          diff: item.diff,
          wouldBe: newStock,
        })
        continue
      }

      processed.push({
        itemId: item.id,
        productId: product.id,
        variantId: item.variantId,
        diff: item.diff,
        systemQtyAtConfirm: currentStock,
        newStock,
        productCostPrice: product.costPrice === null ? null : Number(product.costPrice),
      })
    }

    if (negativeErrors.length > 0) {
      throw new ApiError(
        'BUSINESS_RULE_VIOLATION',
        'Một số sản phẩm sẽ có tồn âm sau khi xác nhận, vui lòng kiểm lại',
        { code: 'NEGATIVE_STOCK', items: negativeErrors },
      )
    }

    for (const p of processed) {
      if (p.variantId) {
        await tx
          .update(productVariants)
          .set({ stockQuantity: p.newStock })
          .where(
            and(eq(productVariants.id, p.variantId), eq(productVariants.storeId, actor.storeId)),
          )
        const aggregated = await aggregateVariantStock({ tx: txDb, productId: p.productId })
        await tx
          .update(products)
          .set({ currentStock: aggregated })
          .where(and(eq(products.id, p.productId), eq(products.storeId, actor.storeId)))
      } else {
        await tx
          .update(products)
          .set({ currentStock: p.newStock })
          .where(and(eq(products.id, p.productId), eq(products.storeId, actor.storeId)))
      }

      await tx.insert(inventoryTransactions).values({
        storeId: actor.storeId,
        productId: p.productId,
        variantId: p.variantId,
        type: 'stock_check',
        quantity: p.diff,
        unitCost: p.productCostPrice,
        costAfter: p.productCostPrice,
        stockAfter: p.newStock,
        note: `Kiểm kho ${header.code}`,
        createdBy: actor.userId,
      })

      await tx.insert(stockCheckLogs).values({
        stockCheckId,
        storeId: actor.storeId,
        productId: p.productId,
        variantId: p.variantId,
        systemQty: p.systemQtyAtConfirm,
        actualQty: p.systemQtyAtConfirm + p.diff,
        diff: p.diff,
        adjustedBy: actor.userId,
      })
    }

    await tx
      .update(stockChecks)
      .set({
        status: 'confirmed',
        confirmedAt: new Date(),
        confirmedBy: actor.userId,
      })
      .where(and(eq(stockChecks.id, stockCheckId), eq(stockChecks.storeId, actor.storeId)))

    await logAction({
      db: txDb,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'stock_check.confirmed',
      targetType: 'stock_check',
      targetId: stockCheckId,
      changes: {
        status: { from: header.status, to: 'confirmed' },
        itemCount: header.totalItems,
        totalAdjusted: processed.length,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    logger.info(
      {
        entity: 'stock_check',
        entityId: stockCheckId,
        action: 'confirm',
        storeId: actor.storeId,
        userId: actor.userId,
        code: header.code,
        totalAdjusted: processed.length,
      },
      'stock_check.confirmed',
    )
  })

  return getStockCheckById({ db, storeId: actor.storeId, stockCheckId })
}

export interface DeleteStockCheckDeps {
  db: Db
  actor: StockCheckActor
  stockCheckId: string
  meta?: RequestMeta
}

export async function deleteStockCheck({
  db,
  actor,
  stockCheckId,
  meta,
}: DeleteStockCheckDeps): Promise<{ ok: true }> {
  const current = await getStockCheckById({ db, storeId: actor.storeId, stockCheckId })
  if (current.status === 'confirmed') {
    throw new ApiError('CONFLICT', 'Phiếu đã xác nhận, không thể xoá')
  }

  await db.transaction(async (tx) => {
    const txDb = tx as unknown as Db

    await logAction({
      db: txDb,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'stock_check.deleted',
      targetType: 'stock_check',
      targetId: stockCheckId,
      changes: {
        code: current.code,
        totalItems: current.totalItems,
        totalDiffPositive: current.totalDiffPositive,
        totalDiffNegative: current.totalDiffNegative,
        note: current.note,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    await tx
      .delete(stockChecks)
      .where(and(eq(stockChecks.id, stockCheckId), eq(stockChecks.storeId, actor.storeId)))

    logger.info(
      {
        entity: 'stock_check',
        entityId: stockCheckId,
        action: 'delete',
        storeId: actor.storeId,
        userId: actor.userId,
        code: current.code,
      },
      'stock_check.deleted',
    )
  })

  return { ok: true }
}

export interface ListStockChecksDeps {
  db: Db
  storeId: string
  query: ListStockChecksQuery
}

export interface ListStockChecksResult {
  items: StockCheckListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  counts: StockCheckCounts
}

export async function listStockChecks({
  db,
  storeId,
  query,
}: ListStockChecksDeps): Promise<ListStockChecksResult> {
  const { page, pageSize, status, search, fromDate, toDate } = query
  const conditions: SQL[] = [eq(stockChecks.storeId, storeId)]

  const trimmedSearch = search?.trim()
  if (trimmedSearch) {
    const escaped = escapeLikePattern(trimmedSearch)
    conditions.push(ilike(stockChecks.code, `%${escaped}%`))
  }
  if (status) {
    conditions.push(eq(stockChecks.status, status))
  }
  if (fromDate) {
    conditions.push(gte(stockChecks.createdAt, new Date(fromDate)))
  }
  if (toDate) {
    conditions.push(lte(stockChecks.createdAt, new Date(toDate)))
  }

  const whereClause = and(...conditions)
  const offset = (page - 1) * pageSize

  const creators = users

  const rows = await db
    .select({
      id: stockChecks.id,
      code: stockChecks.code,
      status: stockChecks.status,
      totalItems: stockChecks.totalItems,
      totalDiffPositive: stockChecks.totalDiffPositive,
      totalDiffNegative: stockChecks.totalDiffNegative,
      note: stockChecks.note,
      createdAt: stockChecks.createdAt,
      confirmedAt: stockChecks.confirmedAt,
      createdBy: stockChecks.createdBy,
      confirmedBy: stockChecks.confirmedBy,
      createdByName: creators.name,
      confirmedByName: sql<
        string | null
      >`(SELECT name FROM ${users} WHERE id = ${stockChecks.confirmedBy})`,
    })
    .from(stockChecks)
    .leftJoin(creators, eq(creators.id, stockChecks.createdBy))
    .where(whereClause)
    .orderBy(desc(stockChecks.createdAt))
    .limit(pageSize)
    .offset(offset)

  const totalRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(stockChecks)
    .where(whereClause)

  const total = totalRows[0]?.count ?? 0

  const countsRows = await db
    .select({
      total: sql<number>`count(*)::int`,
      draft: sql<number>`SUM(CASE WHEN ${stockChecks.status} = 'draft' THEN 1 ELSE 0 END)::int`,
      confirmed: sql<number>`SUM(CASE WHEN ${stockChecks.status} = 'confirmed' THEN 1 ELSE 0 END)::int`,
    })
    .from(stockChecks)
    .where(eq(stockChecks.storeId, storeId))

  const counts: StockCheckCounts = {
    total: Number(countsRows[0]?.total ?? 0),
    draft: Number(countsRows[0]?.draft ?? 0),
    confirmed: Number(countsRows[0]?.confirmed ?? 0),
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const items: StockCheckListItem[] = rows.map((r) => ({
    id: r.id,
    code: r.code,
    status: r.status as StockCheckStatus,
    totalItems: r.totalItems,
    totalDiffPositive: r.totalDiffPositive,
    totalDiffNegative: r.totalDiffNegative,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
    confirmedAt: r.confirmedAt ? r.confirmedAt.toISOString() : null,
    createdBy: r.createdBy,
    createdByName: r.createdByName ?? null,
    confirmedBy: r.confirmedBy,
    confirmedByName: r.confirmedByName ?? null,
  }))

  return { items, total, page, pageSize, totalPages, counts }
}

export interface GetStockCheckDeps {
  db: Db
  storeId: string
  stockCheckId: string
}

export async function getStockCheckById({
  db,
  storeId,
  stockCheckId,
}: GetStockCheckDeps): Promise<StockCheckDetail> {
  const headerRows = await db
    .select({
      id: stockChecks.id,
      storeId: stockChecks.storeId,
      code: stockChecks.code,
      status: stockChecks.status,
      totalItems: stockChecks.totalItems,
      totalDiffPositive: stockChecks.totalDiffPositive,
      totalDiffNegative: stockChecks.totalDiffNegative,
      note: stockChecks.note,
      createdAt: stockChecks.createdAt,
      updatedAt: stockChecks.updatedAt,
      confirmedAt: stockChecks.confirmedAt,
      createdBy: stockChecks.createdBy,
      confirmedBy: stockChecks.confirmedBy,
      createdByName: users.name,
      confirmedByName: sql<
        string | null
      >`(SELECT name FROM ${users} WHERE id = ${stockChecks.confirmedBy})`,
    })
    .from(stockChecks)
    .leftJoin(users, eq(users.id, stockChecks.createdBy))
    .where(and(eq(stockChecks.id, stockCheckId), eq(stockChecks.storeId, storeId)))
    .limit(1)
  const header = headerRows[0]
  if (!header) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy phiếu kiểm kho')
  }

  const itemRows = await db
    .select()
    .from(stockCheckItems)
    .where(eq(stockCheckItems.stockCheckId, stockCheckId))
    .orderBy(asc(stockCheckItems.productNameSnapshot))

  const items: StockCheckItemDetail[] = itemRows.map((it) => ({
    id: it.id,
    productId: it.productId,
    variantId: it.variantId,
    productNameSnapshot: it.productNameSnapshot,
    productSkuSnapshot: it.productSkuSnapshot,
    variantLabelSnapshot: it.variantLabelSnapshot,
    systemQty: it.systemQty,
    actualQty: it.actualQty,
    diff: it.diff,
    note: it.note,
  }))

  return {
    id: header.id,
    storeId: header.storeId,
    code: header.code,
    status: header.status as StockCheckStatus,
    totalItems: header.totalItems,
    totalDiffPositive: header.totalDiffPositive,
    totalDiffNegative: header.totalDiffNegative,
    note: header.note,
    createdAt: header.createdAt.toISOString(),
    updatedAt: header.updatedAt.toISOString(),
    confirmedAt: header.confirmedAt ? header.confirmedAt.toISOString() : null,
    createdBy: header.createdBy,
    createdByName: header.createdByName ?? null,
    confirmedBy: header.confirmedBy,
    confirmedByName: header.confirmedByName ?? null,
    items,
  }
}

export const __TEST_ONLY__ = {
  generateStockCheckCode,
  incrementCodeSequence,
  recomputeStockCheckTotals,
}

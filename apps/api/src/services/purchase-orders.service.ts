import { and, asc, desc, eq, gte, ilike, lte, or, type SQL, sql } from 'drizzle-orm'

import {
  type CreatePurchaseOrderInput,
  type DiscountType,
  inventoryTransactions,
  type ListPurchaseOrdersQuery,
  type PaymentStatus,
  productUnitConversions,
  type PurchaseOrderDetail,
  type PurchaseOrderItemDetail,
  purchaseOrderItems,
  type PurchaseOrderListItem,
  purchaseOrders,
  suppliers,
  type UserRole,
  users,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'
import { escapeLikePattern } from '../lib/strings.js'
import { logAction, type RequestMeta } from './audit.service.js'
import { nextDocumentCode } from './document-codes.service.js'
import { allocateProportionally, receiveStock } from './inventory-cost.helper.js'
import { loadProductForUpdate, loadVariantForUpdate } from './products-lock.helper.js'
import { serviceDb, type ServiceTransaction } from './service-transaction.js'

export interface PurchaseOrdersActor {
  userId: string
  storeId: string
  role: UserRole
}

export function applyDiscount(baseAmount: number, type: DiscountType, value: number): number {
  if (value <= 0) return 0
  if (type === 'percent') {
    const cappedValue = Math.min(value, 10000)
    return Math.floor((baseAmount * cappedValue) / 10000)
  }
  return Math.min(value, baseAmount)
}

export function determinePaymentStatus(totalAmount: number, paidAmount: number): PaymentStatus {
  if (paidAmount === 0) return 'unpaid'
  if (paidAmount === totalAmount) return 'paid'
  return 'partial'
}

// Giới hạn số lượng một dòng sau khi quy ra đơn vị tính, cùng mức với schema dòng nhập
const MAX_BASE_QUANTITY = 1_000_000

export interface CreatePurchaseOrderDeps {
  db: Db
  // Transaction của request có Idempotency-Key: chứng từ và phản hồi lưu cùng một lần commit
  transaction?: ServiceTransaction
  actor: PurchaseOrdersActor
  input: CreatePurchaseOrderInput
  meta?: RequestMeta
}

export async function createPurchaseOrder({
  db: rootDb,
  transaction,
  actor,
  input,
  meta,
}: CreatePurchaseOrderDeps): Promise<PurchaseOrderDetail> {
  const db = serviceDb(rootDb, transaction)
  // Pre-validate at the service boundary (defense, Zod đã chặn ở route)
  if (input.items.length === 0) {
    throw new ApiError('VALIDATION_ERROR', 'Phiếu nhập phải có ít nhất 1 sản phẩm')
  }

  // Detect duplicate (productId, variantId) before locking
  const seen = new Set<string>()
  for (const item of input.items) {
    const key = `${item.productId}::${item.variantId ?? ''}`
    if (seen.has(key)) {
      throw new ApiError(
        'BUSINESS_RULE_VIOLATION',
        'Sản phẩm xuất hiện nhiều lần trong phiếu nhập, vui lòng gộp dòng',
      )
    }
    seen.add(key)
  }

  const purchaseDate = input.purchaseDate ? new Date(input.purchaseDate) : new Date()

  const orderId = await db.transaction(async (tx) => {
    const txDb = tx as unknown as Db

    // Lock supplier row + re-check tenant + soft-delete TRONG transaction để tránh race condition
    const supplierRows = await tx
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, input.supplierId))
      .for('update')
      .limit(1)
    const supplier = supplierRows[0]
    if (!supplier || supplier.storeId !== actor.storeId || supplier.deletedAt !== null) {
      throw new ApiError('NOT_FOUND', 'Không tìm thấy nhà cung cấp')
    }

    // Bước 1: khóa và kiểm tra từng dòng, quy đổi đơn vị, tính thành tiền dòng.
    // Chưa ghi tồn hay giá vốn: chiết khấu phiếu phải biết trước khi tính giá vốn (KHO-04).
    interface PreparedItem {
      productId: string
      variantId: string | null
      productNameSnapshot: string
      productSkuSnapshot: string
      variantLabelSnapshot: string | null
      unitConversionId: string | null
      unitNameSnapshot: string | null
      conversionFactor: number
      baseQuantity: number
      quantity: number
      unitPrice: number
      discountType: DiscountType
      discountValue: number
      discountAmount: number
      lineTotal: number
    }
    const prepared: PreparedItem[] = []
    let subtotal = 0

    for (const item of input.items) {
      const product = await loadProductForUpdate({
        tx: txDb,
        storeId: actor.storeId,
        productId: item.productId,
      })

      const variantId = item.variantId ?? null
      if (product.hasVariants && !variantId) {
        throw new ApiError('VALIDATION_ERROR', 'Sản phẩm có biến thể, vui lòng chọn biến thể nhập')
      }
      if (!product.hasVariants && variantId) {
        throw new ApiError('VALIDATION_ERROR', 'Sản phẩm không có biến thể')
      }

      let variantLabelSnapshot: string | null = null
      if (product.hasVariants && variantId) {
        const variant = await loadVariantForUpdate({
          tx: txDb,
          productId: item.productId,
          variantId,
        })
        variantLabelSnapshot = variant.attribute2Value
          ? `${variant.attribute1Value} - ${variant.attribute2Value}`
          : variant.attribute1Value
      }

      // KHO-10: nhập theo đơn vị quy đổi đã khai báo của sản phẩm
      const unitConversionId = item.unitConversionId ?? null
      let unitNameSnapshot: string | null = null
      let conversionFactor = 1
      if (unitConversionId) {
        const convRows = await tx
          .select({
            unit: productUnitConversions.unit,
            conversionFactor: productUnitConversions.conversionFactor,
          })
          .from(productUnitConversions)
          .where(
            and(
              eq(productUnitConversions.id, unitConversionId),
              eq(productUnitConversions.productId, item.productId),
              eq(productUnitConversions.storeId, actor.storeId),
            ),
          )
          .limit(1)
        const conv = convRows[0]
        if (!conv) {
          throw new ApiError(
            'VALIDATION_ERROR',
            'Đơn vị quy đổi không hợp lệ hoặc không thuộc sản phẩm/cửa hàng này',
          )
        }
        unitNameSnapshot = conv.unit
        conversionFactor = Number(conv.conversionFactor)
      }
      const baseQuantity = item.quantity * conversionFactor
      if (baseQuantity > MAX_BASE_QUANTITY) {
        throw new ApiError(
          'BUSINESS_RULE_VIOLATION',
          'Số lượng quy ra đơn vị tính vượt giới hạn 1.000.000',
        )
      }

      const lineSubtotal = item.quantity * item.unitPrice
      const discountAmount = applyDiscount(lineSubtotal, item.discountType, item.discountValue)
      if (discountAmount > lineSubtotal) {
        throw new ApiError('BUSINESS_RULE_VIOLATION', 'Chiết khấu dòng vượt quá thành tiền')
      }
      // For 'amount' discount: enforce explicit limit (defensive, applyDiscount also caps)
      if (item.discountType === 'amount' && item.discountValue > lineSubtotal) {
        throw new ApiError('BUSINESS_RULE_VIOLATION', 'Chiết khấu dòng vượt quá thành tiền')
      }
      const lineTotal = lineSubtotal - discountAmount

      prepared.push({
        productId: item.productId,
        variantId,
        productNameSnapshot: product.name,
        productSkuSnapshot: product.sku,
        variantLabelSnapshot,
        unitConversionId,
        unitNameSnapshot,
        conversionFactor,
        baseQuantity,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountType: item.discountType,
        discountValue: item.discountValue,
        discountAmount,
        lineTotal,
      })
      subtotal += lineTotal
    }

    // Compute discountTotal + totalAmount
    const discountTotal = applyDiscount(subtotal, input.discountTotalType, input.discountTotalValue)
    if (input.discountTotalType === 'amount' && input.discountTotalValue > subtotal) {
      throw new ApiError('BUSINESS_RULE_VIOLATION', 'Chiết khấu tổng phiếu vượt quá tổng tiền hàng')
    }
    if (discountTotal > subtotal) {
      throw new ApiError('BUSINESS_RULE_VIOLATION', 'Chiết khấu tổng phiếu vượt quá tổng tiền hàng')
    }
    const totalAmount = subtotal - discountTotal

    if (input.paidAmount > totalAmount) {
      throw new ApiError('BUSINESS_RULE_VIOLATION', 'Số tiền đã trả vượt quá tổng phiếu')
    }
    const paymentStatus = determinePaymentStatus(totalAmount, input.paidAmount)

    // Bước 2 (KHO-04, VAS 02 đoạn 06): chiết khấu phiếu phân bổ theo tỷ lệ thành tiền dòng,
    // tổng phân bổ khớp đúng discountTotal. Tiền hàng thực của dòng = lineTotal - phần phân bổ,
    // dùng cho giá vốn bình quân và sổ giao dịch kho. Tổng tiền hàng thực = totalAmount.
    const allocations = allocateProportionally(
      prepared.map((p) => p.lineTotal),
      discountTotal,
    )

    interface ProcessedItem extends PreparedItem {
      orderDiscountAllocated: number
      unitCost: number
      costAfter: number
      stockAfter: number
    }
    const processed: ProcessedItem[] = []
    for (const [index, p] of prepared.entries()) {
      const orderDiscountAllocated = allocations[index] ?? 0
      const received = await receiveStock({
        tx: txDb,
        storeId: actor.storeId,
        productId: p.productId,
        variantId: p.variantId,
        quantity: p.baseQuantity,
        totalCost: p.lineTotal - orderDiscountAllocated,
      })
      processed.push({
        ...p,
        orderDiscountAllocated,
        unitCost: received.unitCost,
        costAfter: received.costAfter,
        stockAfter: received.stockAfter,
      })
    }

    // OFF-08: mã phiếu cấp từ bộ đếm theo cửa hàng, theo ngày nhập của phiếu
    const code = await nextDocumentCode({
      db: txDb,
      storeId: actor.storeId,
      kind: 'purchase_order',
      date: purchaseDate,
    })
    const [createdRow] = await tx
      .insert(purchaseOrders)
      .values({
        storeId: actor.storeId,
        supplierId: input.supplierId,
        code,
        subtotal,
        discountTotal,
        discountTotalType: input.discountTotalType,
        discountTotalValue: input.discountTotalValue,
        totalAmount,
        paidAmount: input.paidAmount,
        paymentStatus,
        note: input.note ?? null,
        purchaseDate,
        createdBy: actor.userId,
      })
      .returning({ id: purchaseOrders.id })
    const createdId = createdRow?.id ?? null
    if (!createdId) {
      throw new ApiError('INTERNAL_ERROR', 'Không tạo được phiếu nhập')
    }

    // Insert purchase_order_items + inventory_transactions với note=code
    for (const p of processed) {
      await tx.insert(purchaseOrderItems).values({
        purchaseOrderId: createdId,
        productId: p.productId,
        variantId: p.variantId,
        productNameSnapshot: p.productNameSnapshot,
        productSkuSnapshot: p.productSkuSnapshot,
        variantLabelSnapshot: p.variantLabelSnapshot,
        quantity: p.quantity,
        unitPrice: p.unitPrice,
        discountAmount: p.discountAmount,
        discountType: p.discountType,
        discountValue: p.discountValue,
        lineTotal: p.lineTotal,
        unitConversionId: p.unitConversionId,
        unitNameSnapshot: p.unitNameSnapshot,
        conversionFactor: p.conversionFactor,
        orderDiscountAllocated: p.orderDiscountAllocated,
        unitCost: p.unitCost,
        costAfter: p.costAfter,
        stockAfter: p.stockAfter,
      })

      await tx.insert(inventoryTransactions).values({
        storeId: actor.storeId,
        productId: p.productId,
        variantId: p.variantId,
        type: 'purchase',
        quantity: p.baseQuantity,
        unitCost: p.unitCost,
        costAfter: p.costAfter,
        stockAfter: p.stockAfter,
        note: code,
        createdBy: actor.userId,
      })
    }

    // Update supplier counters
    const debtIncrease = totalAmount - input.paidAmount
    const debtBefore = Number(supplier.currentDebt)
    const debtAfter = debtBefore + debtIncrease
    await tx
      .update(suppliers)
      .set({
        currentDebt: sql`${suppliers.currentDebt} + ${debtIncrease}`,
        purchaseCount: sql`${suppliers.purchaseCount} + 1`,
        totalPurchased: sql`${suppliers.totalPurchased} + ${totalAmount}`,
      })
      .where(eq(suppliers.id, input.supplierId))

    await logAction({
      db: txDb,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'purchase_order.created',
      targetType: 'purchase_order',
      targetId: createdId,
      changes: {
        supplierId: input.supplierId,
        code,
        itemCount: processed.length,
        subtotal,
        discountTotal,
        totalAmount,
        paidAmount: input.paidAmount,
        paymentStatus,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    if (debtIncrease !== 0) {
      await logAction({
        db: txDb,
        storeId: actor.storeId,
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'supplier.debt_changed',
        targetType: 'supplier',
        targetId: input.supplierId,
        changes: {
          debtBefore,
          debtAfter,
          purchaseOrderId: createdId,
          purchaseOrderCode: code,
        },
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      })
    }

    logger.info(
      {
        storeId: actor.storeId,
        actorId: actor.userId,
        purchaseOrderId: createdId,
        code,
        supplierId: input.supplierId,
        itemCount: processed.length,
        totalAmount,
        paidAmount: input.paidAmount,
        paymentStatus,
      },
      'purchase_order.created',
    )

    return createdId
  })

  return getPurchaseOrder({ db, storeId: actor.storeId, orderId })
}

export interface GetPurchaseOrderDeps {
  db: Db
  storeId: string
  orderId: string
}

export async function getPurchaseOrder({
  db,
  storeId,
  orderId,
}: GetPurchaseOrderDeps): Promise<PurchaseOrderDetail> {
  const orderRows = await db
    .select({
      id: purchaseOrders.id,
      storeId: purchaseOrders.storeId,
      supplierId: purchaseOrders.supplierId,
      code: purchaseOrders.code,
      subtotal: purchaseOrders.subtotal,
      discountTotal: purchaseOrders.discountTotal,
      discountTotalType: purchaseOrders.discountTotalType,
      discountTotalValue: purchaseOrders.discountTotalValue,
      totalAmount: purchaseOrders.totalAmount,
      paidAmount: purchaseOrders.paidAmount,
      paymentStatus: purchaseOrders.paymentStatus,
      note: purchaseOrders.note,
      purchaseDate: purchaseOrders.purchaseDate,
      createdBy: purchaseOrders.createdBy,
      createdAt: purchaseOrders.createdAt,
      updatedAt: purchaseOrders.updatedAt,
      supplierName: suppliers.name,
      supplierPhone: suppliers.phone,
      createdByName: users.name,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .leftJoin(users, eq(purchaseOrders.createdBy, users.id))
    .where(and(eq(purchaseOrders.id, orderId), eq(purchaseOrders.storeId, storeId)))
    .limit(1)

  const row = orderRows[0]
  if (!row) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy phiếu nhập')
  }

  const itemRows = await db
    .select()
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, orderId))
    .orderBy(asc(purchaseOrderItems.createdAt))

  const items: PurchaseOrderItemDetail[] = itemRows.map((it) => ({
    id: it.id,
    productId: it.productId,
    variantId: it.variantId,
    productNameSnapshot: it.productNameSnapshot,
    productSkuSnapshot: it.productSkuSnapshot,
    variantLabelSnapshot: it.variantLabelSnapshot,
    unitConversionId: it.unitConversionId,
    unitName: it.unitNameSnapshot,
    conversionFactor: it.conversionFactor,
    baseQuantity: it.quantity * it.conversionFactor,
    quantity: it.quantity,
    unitPrice: Number(it.unitPrice),
    discountAmount: Number(it.discountAmount),
    discountType: it.discountType as DiscountType,
    discountValue: Number(it.discountValue),
    lineTotal: Number(it.lineTotal),
    orderDiscountAllocated:
      it.orderDiscountAllocated === null ? null : Number(it.orderDiscountAllocated),
    unitCost: it.unitCost === null ? null : Number(it.unitCost),
    costAfter: it.costAfter === null ? null : Number(it.costAfter),
    stockAfter: it.stockAfter,
  }))

  return {
    id: row.id,
    storeId: row.storeId,
    code: row.code,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    itemCount: items.length,
    subtotal: Number(row.subtotal),
    discountTotal: Number(row.discountTotal),
    discountTotalType: row.discountTotalType as DiscountType,
    discountTotalValue: Number(row.discountTotalValue),
    totalAmount: Number(row.totalAmount),
    paidAmount: Number(row.paidAmount),
    paymentStatus: row.paymentStatus as PaymentStatus,
    note: row.note,
    purchaseDate: row.purchaseDate.toISOString(),
    createdBy: row.createdBy,
    createdByName: row.createdByName,
    supplier: {
      id: row.supplierId,
      name: row.supplierName,
      phone: row.supplierPhone,
    },
    items,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export interface ListPurchaseOrdersDeps {
  db: Db
  storeId: string
  query: ListPurchaseOrdersQuery
}

export interface ListPurchaseOrdersResult {
  items: PurchaseOrderListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export async function listPurchaseOrders({
  db,
  storeId,
  query,
}: ListPurchaseOrdersDeps): Promise<ListPurchaseOrdersResult> {
  const { page, pageSize, search, supplierId, paymentStatus, fromDate, toDate } = query
  const conditions: SQL[] = [eq(purchaseOrders.storeId, storeId)]

  const trimmedSearch = search?.trim()
  if (trimmedSearch) {
    const escaped = escapeLikePattern(trimmedSearch)
    const pattern = `%${escaped}%`
    const searchClause = or(
      ilike(purchaseOrders.code, pattern),
      sql`LOWER(${suppliers.name}) LIKE LOWER(${pattern})`,
    )
    if (searchClause) conditions.push(searchClause)
  }

  if (supplierId) {
    conditions.push(eq(purchaseOrders.supplierId, supplierId))
  }
  if (paymentStatus) {
    conditions.push(eq(purchaseOrders.paymentStatus, paymentStatus))
  }
  if (fromDate) {
    conditions.push(gte(purchaseOrders.purchaseDate, new Date(fromDate)))
  }
  if (toDate) {
    conditions.push(lte(purchaseOrders.purchaseDate, new Date(toDate)))
  }

  const whereClause = and(...conditions)
  const offset = (page - 1) * pageSize

  const rows = await db
    .select({
      id: purchaseOrders.id,
      code: purchaseOrders.code,
      supplierId: purchaseOrders.supplierId,
      supplierName: suppliers.name,
      subtotal: purchaseOrders.subtotal,
      discountTotal: purchaseOrders.discountTotal,
      totalAmount: purchaseOrders.totalAmount,
      paidAmount: purchaseOrders.paidAmount,
      paymentStatus: purchaseOrders.paymentStatus,
      purchaseDate: purchaseOrders.purchaseDate,
      createdAt: purchaseOrders.createdAt,
      itemCount: sql<number>`(SELECT COUNT(*)::int FROM ${purchaseOrderItems} WHERE ${purchaseOrderItems.purchaseOrderId} = ${purchaseOrders.id})`,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .where(whereClause)
    .orderBy(desc(purchaseOrders.purchaseDate), desc(purchaseOrders.createdAt))
    .limit(pageSize)
    .offset(offset)

  const totalRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .where(whereClause)

  const total = totalRows[0]?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const items: PurchaseOrderListItem[] = rows.map((r) => ({
    id: r.id,
    code: r.code,
    supplierId: r.supplierId,
    supplierName: r.supplierName,
    itemCount: Number(r.itemCount),
    subtotal: Number(r.subtotal),
    discountTotal: Number(r.discountTotal),
    totalAmount: Number(r.totalAmount),
    paidAmount: Number(r.paidAmount),
    paymentStatus: r.paymentStatus as PaymentStatus,
    purchaseDate: r.purchaseDate.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }))

  return { items, total, page, pageSize, totalPages }
}

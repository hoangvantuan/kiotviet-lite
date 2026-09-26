import { and, asc, desc, eq, gte, ilike, inArray, lte, or, type SQL, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import {
  type CreatePurchaseOrderInput,
  type DiscountType,
  type DocumentStatus,
  inventoryTransactions,
  isWholeQuantity,
  lineAmount,
  type ListPurchaseOrdersQuery,
  mulQty,
  type PaymentStatus,
  products,
  productUnitConversions,
  type PurchaseOrderDetail,
  type PurchaseOrderItemDetail,
  purchaseOrderItems,
  type PurchaseOrderListItem,
  purchaseOrders,
  type PurchaseReturn,
  purchaseReturnItems,
  purchaseReturns,
  supplierPayments,
  suppliers,
  type UserRole,
  users,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { toMoneyMethod } from '../lib/cash-flow.js'
import { ApiError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'
import { assertQuantityAllowed } from '../lib/quantity-policy.js'
import { escapeLikePattern } from '../lib/strings.js'
import { parseDateRangeBoundary } from '../lib/timezone.js'
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

/**
 * Trạng thái thanh toán của phiếu nhập sau phát sinh (TIEN-104, KHO-11): so số đã trả ròng với số
 * phải trả ròng (tổng phiếu trừ hàng đã trả NCC). Trả hết hàng thì không còn gì phải trả.
 */
export function derivePurchaseOrderPaymentStatus(payable: number, paid: number): PaymentStatus {
  if (payable <= 0) return 'paid'
  if (paid <= 0) return 'unpaid'
  if (paid >= payable) return 'paid'
  return 'partial'
}

/**
 * Đã trả ròng cho phiếu: trả lúc nhập + phiếu chi gắn phiếu còn hiệu lực, trừ phần NCC phải hoàn
 * khi trả hàng. Phần hoàn chỉ trừ tối đa bằng số đã trả gắn phiếu: phiếu đã được trả bằng phiếu chi
 * chung (không gắn phiếu, gồm mọi phiếu trước TIEN-104) thì khoản hoàn không thuộc số đã trả của
 * phiếu, vẫn ghi riêng ở `returnRefundAmount`. Nhờ vậy số này không bao giờ âm.
 */
export function purchaseOrderPaidNet(p: {
  initialPaidAmount: number
  linkedPaymentAmount: number
  returnRefundAmount: number
}): number {
  const paid = p.initialPaidAmount + p.linkedPaymentAmount
  return paid - Math.min(p.returnRefundAmount, paid)
}

/** Tổng phiếu chi còn hiệu lực gắn với phiếu nhập (TIEN-104) */
function linkedPaymentSubquery(): SQL<string> {
  return sql<string>`COALESCE((
    SELECT SUM(${supplierPayments.amount}) FROM ${supplierPayments}
    WHERE ${supplierPayments.purchaseOrderId} = ${purchaseOrders.id}
      AND ${supplierPayments.status} = 'active'
  ), 0)`
}

export interface PurchaseOrderPayables {
  id: string
  code: string
  supplierId: string
  status: DocumentStatus
  totalAmount: number
  discountTotal: number
  initialPaidAmount: number
  linkedPaymentAmount: number
  returnedAmount: number
  returnRefundAmount: number
  /** Tổng phiếu trừ hàng đã trả NCC */
  payable: number
  /** Trả lúc nhập + phiếu chi gắn phiếu - NCC hoàn khi trả hàng (`purchaseOrderPaidNet`, ≥ 0) */
  paidNet: number
  /** Còn phải trả cho phiếu; có thể âm khi đã trả dư qua phiếu chi không gắn phiếu */
  outstanding: number
}

/**
 * Đọc (và khóa khi `forUpdate`) phiếu nhập cùng số phải trả, đã trả ròng. Phiếu nhập là chứng từ
 * nên khóa trước NCC và sản phẩm.
 */
export async function loadPurchaseOrderPayables(
  db: Db,
  {
    storeId,
    purchaseOrderId,
    forUpdate = false,
  }: { storeId: string; purchaseOrderId: string; forUpdate?: boolean },
): Promise<PurchaseOrderPayables> {
  const query = db
    .select({
      id: purchaseOrders.id,
      code: purchaseOrders.code,
      supplierId: purchaseOrders.supplierId,
      status: purchaseOrders.status,
      totalAmount: purchaseOrders.totalAmount,
      discountTotal: purchaseOrders.discountTotal,
      paidAmount: purchaseOrders.paidAmount,
      returnedAmount: purchaseOrders.returnedAmount,
      returnRefundAmount: purchaseOrders.returnRefundAmount,
    })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, purchaseOrderId), eq(purchaseOrders.storeId, storeId)))
    .limit(1)
  const [row] = forUpdate ? await query.for('update') : await query
  if (!row) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy phiếu nhập')
  }
  const [linked] = await db
    .select({ sum: sql<string>`COALESCE(SUM(${supplierPayments.amount}), 0)` })
    .from(supplierPayments)
    .where(and(eq(supplierPayments.purchaseOrderId, row.id), eq(supplierPayments.status, 'active')))
  const totalAmount = Number(row.totalAmount)
  const initialPaidAmount = Number(row.paidAmount)
  const linkedPaymentAmount = Number(linked?.sum ?? 0)
  const returnedAmount = Number(row.returnedAmount)
  const returnRefundAmount = Number(row.returnRefundAmount)
  const payable = totalAmount - returnedAmount
  const paidNet = purchaseOrderPaidNet({
    initialPaidAmount,
    linkedPaymentAmount,
    returnRefundAmount,
  })
  return {
    id: row.id,
    code: row.code,
    supplierId: row.supplierId,
    status: row.status as DocumentStatus,
    totalAmount,
    discountTotal: Number(row.discountTotal),
    initialPaidAmount,
    linkedPaymentAmount,
    returnedAmount,
    returnRefundAmount,
    payable,
    paidNet,
    outstanding: payable - paidNet,
  }
}

/** Ghi lại trạng thái thanh toán của phiếu nhập còn hiệu lực sau phiếu chi, hủy phiếu chi, trả hàng */
export async function refreshPurchaseOrderPaymentStatus(db: Db, purchaseOrderId: string) {
  const [row] = await db
    .select({ storeId: purchaseOrders.storeId })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, purchaseOrderId))
    .limit(1)
  if (!row) return
  const p = await loadPurchaseOrderPayables(db, { storeId: row.storeId, purchaseOrderId })
  if (p.status !== 'active') return
  await db
    .update(purchaseOrders)
    .set({ paymentStatus: derivePurchaseOrderPaymentStatus(p.payable, p.paidNet) })
    .where(eq(purchaseOrders.id, purchaseOrderId))
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
      let unitAllowsDecimal: boolean | null = null
      if (unitConversionId) {
        const convRows = await tx
          .select({
            unit: productUnitConversions.unit,
            conversionFactor: productUnitConversions.conversionFactor,
            allowDecimalQuantity: productUnitConversions.allowDecimalQuantity,
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
        unitAllowsDecimal = conv.allowDecimalQuantity
      }
      // GL-07: số lẻ theo cờ của mặt hàng và đơn vị (ADR-0015 mục 2)
      assertQuantityAllowed({
        quantity: item.quantity,
        productName: product.name,
        productAllowsDecimal: product.allowDecimalQuantity,
        unitConversion:
          unitAllowsDecimal === null
            ? null
            : { conversionFactor, allowDecimalQuantity: unitAllowsDecimal },
      })
      const baseQuantity = mulQty(item.quantity, conversionFactor)
      if (baseQuantity > MAX_BASE_QUANTITY) {
        throw new ApiError(
          'BUSINESS_RULE_VIOLATION',
          'Số lượng quy ra đơn vị tính vượt giới hạn 1.000.000',
        )
      }

      const lineSubtotal = lineAmount(item.unitPrice, item.quantity)
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
        referenceType: 'purchase_order',
        referenceId: createdId,
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
      status: purchaseOrders.status,
      returnedAmount: purchaseOrders.returnedAmount,
      returnRefundAmount: purchaseOrders.returnRefundAmount,
      linkedPaymentAmount: linkedPaymentSubquery(),
      cancelledAt: purchaseOrders.cancelledAt,
      cancelledBy: purchaseOrders.cancelledBy,
      cancelledByName: poCancellers.name,
      cancelReason: purchaseOrders.cancelReason,
      cancelDebtReduction: purchaseOrders.cancelDebtReduction,
      cancelSupplierRefund: purchaseOrders.cancelSupplierRefund,
      cancelRefundMethod: purchaseOrders.cancelRefundMethod,
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
    .leftJoin(poCancellers, eq(purchaseOrders.cancelledBy, poCancellers.id))
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

  // Cờ bán số lẻ hiện tại để hộp trả hàng nhập cho gõ số lẻ (ADR-0015 mục 2)
  const productIds = [...new Set(itemRows.map((it) => it.productId))]
  const unitIds = [
    ...new Set(itemRows.map((it) => it.unitConversionId).filter((id): id is string => !!id)),
  ]
  const productFlags = new Map(
    productIds.length === 0
      ? []
      : (
          await db
            .select({ id: products.id, allow: products.allowDecimalQuantity })
            .from(products)
            .where(inArray(products.id, productIds))
        ).map((r) => [r.id, r.allow] as const),
  )
  const unitFlags = new Map(
    unitIds.length === 0
      ? []
      : (
          await db
            .select({
              id: productUnitConversions.id,
              allow: productUnitConversions.allowDecimalQuantity,
            })
            .from(productUnitConversions)
            .where(inArray(productUnitConversions.id, unitIds))
        ).map((r) => [r.id, r.allow] as const),
  )

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
    baseQuantity: mulQty(it.quantity, it.conversionFactor),
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
    returnedQuantity: it.returnedQuantity,
    allowDecimalQuantity:
      !isWholeQuantity(it.quantity) ||
      ((it.unitConversionId ? unitFlags.get(it.unitConversionId) : undefined) ??
        productFlags.get(it.productId) ??
        false),
  }))

  const returns = await listPurchaseReturns({ db, purchaseOrderId: orderId, items: itemRows })
  const initialPaidAmount = Number(row.paidAmount)
  const linkedPaymentAmount = Number(row.linkedPaymentAmount)
  const returnRefundAmount = Number(row.returnRefundAmount)

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
    paidAmount: purchaseOrderPaidNet({
      initialPaidAmount,
      linkedPaymentAmount,
      returnRefundAmount,
    }),
    returnedAmount: Number(row.returnedAmount),
    paymentStatus: row.paymentStatus as PaymentStatus,
    status: row.status as DocumentStatus,
    initialPaidAmount,
    linkedPaymentAmount,
    returnRefundAmount,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    cancelledBy: row.cancelledBy,
    cancelledByName: row.cancelledByName,
    cancelReason: row.cancelReason,
    cancelDebtReduction: Number(row.cancelDebtReduction),
    cancelSupplierRefund: Number(row.cancelSupplierRefund),
    cancelRefundMethod: toMoneyMethod(row.cancelRefundMethod),
    returns,
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

const poCancellers = alias(users, 'purchase_order_cancellers')
const returnCreators = alias(users, 'purchase_return_creators')

/** Các phiếu trả hàng nhập của một phiếu nhập, mới nhất trước */
export async function listPurchaseReturns({
  db,
  purchaseOrderId,
  items,
}: {
  db: Db
  purchaseOrderId: string
  items: Array<typeof purchaseOrderItems.$inferSelect>
}): Promise<PurchaseReturn[]> {
  const headers = await db
    .select({
      id: purchaseReturns.id,
      code: purchaseReturns.code,
      purchaseOrderId: purchaseReturns.purchaseOrderId,
      supplierId: purchaseReturns.supplierId,
      totalAmount: purchaseReturns.totalAmount,
      debtReductionAmount: purchaseReturns.debtReductionAmount,
      supplierRefundAmount: purchaseReturns.supplierRefundAmount,
      refundMethod: purchaseReturns.refundMethod,
      note: purchaseReturns.note,
      createdBy: purchaseReturns.createdBy,
      createdByName: returnCreators.name,
      createdAt: purchaseReturns.createdAt,
    })
    .from(purchaseReturns)
    .leftJoin(returnCreators, eq(purchaseReturns.createdBy, returnCreators.id))
    .where(eq(purchaseReturns.purchaseOrderId, purchaseOrderId))
    .orderBy(desc(purchaseReturns.createdAt), desc(purchaseReturns.id))
  if (headers.length === 0) return []
  const lines = await db
    .select()
    .from(purchaseReturnItems)
    .where(
      inArray(
        purchaseReturnItems.purchaseReturnId,
        headers.map((h) => h.id),
      ),
    )
    .orderBy(asc(purchaseReturnItems.createdAt))
  const itemById = new Map(items.map((it) => [it.id, it]))
  return headers.map((h) => ({
    id: h.id,
    code: h.code,
    purchaseOrderId: h.purchaseOrderId,
    supplierId: h.supplierId,
    totalAmount: Number(h.totalAmount),
    debtReductionAmount: Number(h.debtReductionAmount),
    supplierRefundAmount: Number(h.supplierRefundAmount),
    refundMethod: toMoneyMethod(h.refundMethod),
    note: h.note,
    createdBy: h.createdBy,
    createdByName: h.createdByName,
    createdAt: h.createdAt.toISOString(),
    items: lines
      .filter((l) => l.purchaseReturnId === h.id)
      .map((l) => {
        const source = itemById.get(l.purchaseOrderItemId)
        return {
          id: l.id,
          purchaseOrderItemId: l.purchaseOrderItemId,
          productId: l.productId,
          variantId: l.variantId,
          productNameSnapshot: source?.productNameSnapshot ?? '',
          variantLabelSnapshot: source?.variantLabelSnapshot ?? null,
          unitName: source?.unitNameSnapshot ?? null,
          quantity: l.quantity,
          conversionFactor: l.conversionFactor,
          baseQuantity: l.baseQuantity,
          lineTotal: Number(l.lineTotal),
        }
      }),
  }))
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
  const { page, pageSize, search, supplierId, paymentStatus, status, fromDate, toDate } = query
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
    // Phiếu đã hủy không còn nợ hay đã trả gì: lọc theo thanh toán chỉ xét phiếu còn hiệu lực
    if (!status) conditions.push(eq(purchaseOrders.status, 'active'))
  }
  if (status) {
    conditions.push(eq(purchaseOrders.status, status))
  }
  // R7: ngày YYYY-MM-DD hiểu theo lịch cửa hàng, không theo UTC
  const from = parseDateRangeBoundary(fromDate, 'start')
  const to = parseDateRangeBoundary(toDate, 'end')
  if (from) conditions.push(gte(purchaseOrders.purchaseDate, from))
  if (to) conditions.push(lte(purchaseOrders.purchaseDate, to))

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
      linkedPaymentAmount: linkedPaymentSubquery(),
      returnedAmount: purchaseOrders.returnedAmount,
      returnRefundAmount: purchaseOrders.returnRefundAmount,
      paymentStatus: purchaseOrders.paymentStatus,
      status: purchaseOrders.status,
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
    paidAmount: purchaseOrderPaidNet({
      initialPaidAmount: Number(r.paidAmount),
      linkedPaymentAmount: Number(r.linkedPaymentAmount),
      returnRefundAmount: Number(r.returnRefundAmount),
    }),
    returnedAmount: Number(r.returnedAmount),
    paymentStatus: r.paymentStatus as PaymentStatus,
    status: r.status as DocumentStatus,
    purchaseDate: r.purchaseDate.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }))

  return { items, total, page, pageSize, totalPages }
}

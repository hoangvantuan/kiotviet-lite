import { and, asc, eq, sql } from 'drizzle-orm'

import {
  type CancelDocumentInput,
  computeReturnLineRefund,
  type CreatePurchaseReturnInput,
  inventoryTransactions,
  productVariants,
  type PurchaseOrderDetail,
  purchaseOrderItems,
  purchaseOrders,
  type PurchaseReturn,
  purchaseReturnItems,
  purchaseReturns,
  suppliers,
  type UserRole,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'
import { logAction, type RequestMeta } from './audit.service.js'
import { alreadyCancelledError, authorizeDocumentCancel } from './document-cancel.helper.js'
import { nextDocumentCode } from './document-codes.service.js'
import { allocateProportionally, removeReceivedStock } from './inventory-cost.helper.js'
import { loadProductForUpdate, lockProductsInIdOrder } from './products-lock.helper.js'
import {
  getPurchaseOrder,
  listPurchaseReturns,
  loadPurchaseOrderPayables,
  refreshPurchaseOrderPaymentStatus,
} from './purchase-orders.service.js'
import { serviceDb, type ServiceTransaction } from './service-transaction.js'

/**
 * KHO-11: đường sửa sai cho phiếu nhập. Hủy phiếu rút lại toàn bộ hàng và công nợ NCC của phiếu;
 * trả hàng nhập rút một phần theo giá nhập thực của dòng gốc. Cả hai tính lại giá vốn bình quân
 * theo ADR-0012 (`removeReceivedStock`).
 *
 * Thứ tự khóa phía NCC: chứng từ (phiếu chi, rồi phiếu nhập), NCC, sản phẩm theo id, biến thể.
 */

export interface PurchaseReversalActor {
  userId: string
  storeId: string
  role: UserRole
}

type PurchaseItemRow = typeof purchaseOrderItems.$inferSelect

/**
 * Giá trị thực của từng dòng phiếu (thành tiền dòng trừ phần chiết khấu phiếu). Phiếu lập trước
 * quy tắc KHO-04 chưa ghi phần phân bổ thì chia lại chiết khấu phiếu theo tỷ lệ thành tiền dòng,
 * cùng cách lúc nhập hiện nay.
 */
function lineNetValues(items: PurchaseItemRow[], discountTotal: number): Map<string, number> {
  const missing = items.some((it) => it.orderDiscountAllocated === null)
  const fallback = missing
    ? allocateProportionally(
        items.map((it) => Number(it.lineTotal)),
        discountTotal,
      )
    : []
  const result = new Map<string, number>()
  items.forEach((it, idx) => {
    const allocated =
      it.orderDiscountAllocated === null ? (fallback[idx] ?? 0) : Number(it.orderDiscountAllocated)
    result.set(it.id, Number(it.lineTotal) - allocated)
  })
  return result
}

interface StockShortage {
  productId: string
  variantId: string | null
  name: string
  required: number
  available: number
}

/** Kiểm tồn đủ để rút lại từng dòng; thiếu thì báo đủ mọi sản phẩm thiếu trong một lỗi */
async function assertStockAvailable(
  tx: Db,
  storeId: string,
  lines: Array<{ item: PurchaseItemRow; baseQuantity: number }>,
  action: string,
) {
  const shortages: StockShortage[] = []
  for (const { item, baseQuantity } of lines) {
    const product = await loadProductForUpdate({ tx, storeId, productId: item.productId })
    let available = product.currentStock
    if (item.variantId) {
      const [variant] = await tx
        .select({ stock: productVariants.stockQuantity })
        .from(productVariants)
        .where(eq(productVariants.id, item.variantId))
        .for('update')
        .limit(1)
      available = variant?.stock ?? 0
    }
    if (available < baseQuantity) {
      const name = item.variantLabelSnapshot
        ? `${item.productNameSnapshot} (${item.variantLabelSnapshot})`
        : item.productNameSnapshot
      shortages.push({
        productId: item.productId,
        variantId: item.variantId,
        name,
        required: baseQuantity,
        available,
      })
    }
  }
  if (shortages.length > 0) {
    const list = shortages
      .map((s) => `${s.name} (cần ${s.required}, còn ${s.available})`)
      .join(', ')
    throw new ApiError(
      'BUSINESS_RULE_VIOLATION',
      `Không ${action} được vì tồn kho không đủ để rút lại hàng đã nhập: ${list}`,
      { reason: 'insufficient_stock', shortages },
    )
  }
}

async function lockSupplier(tx: Db, storeId: string, supplierId: string) {
  const [supplier] = await tx
    .select({ id: suppliers.id, name: suppliers.name, currentDebt: suppliers.currentDebt })
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.storeId, storeId)))
    .for('update')
    .limit(1)
  if (!supplier) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy nhà cung cấp')
  }
  return { ...supplier, currentDebt: Number(supplier.currentDebt) }
}

// ---------------------------------------------------------------------------
// Hủy phiếu nhập
// ---------------------------------------------------------------------------

export interface CancelPurchaseOrderDeps {
  db: Db
  transaction?: ServiceTransaction
  actor: PurchaseReversalActor
  purchaseOrderId: string
  input: CancelDocumentInput
  meta?: RequestMeta
}

/**
 * Hủy phiếu nhập: rút lại toàn bộ hàng đã nhập (kho không đủ thì chặn, nêu tên sản phẩm thiếu),
 * tính lại giá vốn, gỡ phần công nợ NCC của phiếu. Phần công nợ đã được trả (lúc nhập hoặc qua
 * phiếu chi chung) là tiền NCC phải hoàn, ghi ở `cancelSupplierRefund`; công nợ NCC không xuống âm.
 * Chặn khi phiếu đã có trả hàng nhập hay phiếu chi gắn phiếu còn hiệu lực (xử lý các chứng từ đó
 * trước). Phiếu không bị xóa, đổi sang 'cancelled'; hủy lần hai thì 409.
 */
export async function cancelPurchaseOrder({
  db: rootDb,
  transaction,
  actor,
  purchaseOrderId,
  input,
  meta,
}: CancelPurchaseOrderDeps): Promise<PurchaseOrderDetail> {
  const db = serviceDb(rootDb, transaction)
  await authorizeDocumentCancel({ db, actor, input, meta })
  await db.transaction(async (tx) => {
    const txDb = tx as unknown as Db
    const po = await loadPurchaseOrderPayables(txDb, {
      storeId: actor.storeId,
      purchaseOrderId,
      forUpdate: true,
    })
    if (po.status === 'cancelled') {
      throw alreadyCancelledError('Phiếu nhập')
    }
    if (po.returnedAmount > 0) {
      throw new ApiError(
        'BUSINESS_RULE_VIOLATION',
        'Phiếu nhập đã có phiếu trả hàng nhập nên không hủy được. Hãy trả nốt phần hàng còn lại',
        { reason: 'purchase_order_has_returns' },
      )
    }
    if (po.linkedPaymentAmount > 0) {
      throw new ApiError(
        'BUSINESS_RULE_VIOLATION',
        'Phiếu nhập đã có phiếu chi gắn kèm. Hãy hủy các phiếu chi đó trước rồi mới hủy phiếu nhập',
        { reason: 'purchase_order_has_payments' },
      )
    }

    const supplier = await lockSupplier(txDb, actor.storeId, po.supplierId)
    const items = await tx
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.purchaseOrderId, po.id))
      .orderBy(asc(purchaseOrderItems.createdAt), asc(purchaseOrderItems.id))
    await lockProductsInIdOrder({
      tx: txDb,
      storeId: actor.storeId,
      productIds: items.map((it) => it.productId),
    })
    const lines = items.map((item) => ({
      item,
      baseQuantity: item.quantity * item.conversionFactor,
    }))
    await assertStockAvailable(txDb, actor.storeId, lines, 'hủy phiếu nhập')

    const netValues = lineNetValues(items, po.discountTotal)
    for (const { item, baseQuantity } of lines) {
      const lotCost = netValues.get(item.id) ?? Number(item.lineTotal)
      const removed = await removeReceivedStock({
        tx: txDb,
        storeId: actor.storeId,
        productId: item.productId,
        variantId: item.variantId,
        quantity: baseQuantity,
        totalCost: lotCost,
      })
      await tx.insert(inventoryTransactions).values({
        storeId: actor.storeId,
        productId: item.productId,
        variantId: item.variantId,
        type: 'purchase_cancel',
        quantity: -baseQuantity,
        unitCost: item.unitCost ?? Math.round(lotCost / baseQuantity),
        costAfter: removed.costAfter,
        stockAfter: removed.stockAfter,
        note: `Hủy ${po.code}`,
        createdBy: actor.userId,
      })
    }

    // Phiếu ghi nợ NCC (tổng - trả lúc nhập); phần nợ đó có thể đã được phiếu chi chung trả bớt
    const cancelDebtReduction = Math.max(
      0,
      Math.min(po.totalAmount - po.initialPaidAmount, supplier.currentDebt),
    )
    const cancelSupplierRefund = po.totalAmount - cancelDebtReduction
    const debtAfter = supplier.currentDebt - cancelDebtReduction
    await tx
      .update(suppliers)
      .set({
        currentDebt: sql`${suppliers.currentDebt} - ${cancelDebtReduction}`,
        purchaseCount: sql`GREATEST(${suppliers.purchaseCount} - 1, 0)`,
        totalPurchased: sql`${suppliers.totalPurchased} - ${po.totalAmount}`,
      })
      .where(eq(suppliers.id, supplier.id))

    const reason = input.reason.trim()
    await tx
      .update(purchaseOrders)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: actor.userId,
        cancelReason: reason,
        cancelDebtReduction,
        cancelSupplierRefund,
      })
      .where(eq(purchaseOrders.id, po.id))

    await logAction({
      db: txDb,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'purchase_order.cancelled',
      targetType: 'purchase_order',
      targetId: po.id,
      changes: {
        code: po.code,
        totalAmount: po.totalAmount,
        reason,
        cancelDebtReduction,
        cancelSupplierRefund,
        itemCount: items.length,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })
    if (cancelDebtReduction !== 0) {
      await logAction({
        db: txDb,
        storeId: actor.storeId,
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'supplier.debt_changed',
        targetType: 'supplier',
        targetId: supplier.id,
        changes: {
          debtBefore: supplier.currentDebt,
          debtAfter,
          purchaseOrderId: po.id,
          purchaseOrderCode: po.code,
          reason: 'purchase_order_cancelled',
        },
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      })
    }
    logger.info(
      { storeId: actor.storeId, purchaseOrderId: po.id, cancelDebtReduction, cancelSupplierRefund },
      'purchase_order.cancelled',
    )
  })
  return getPurchaseOrder({ db, storeId: actor.storeId, orderId: purchaseOrderId })
}

// ---------------------------------------------------------------------------
// Trả hàng nhập
// ---------------------------------------------------------------------------

export interface CreatePurchaseReturnDeps {
  db: Db
  transaction?: ServiceTransaction
  actor: PurchaseReversalActor
  purchaseOrderId: string
  input: CreatePurchaseReturnInput
  meta?: RequestMeta
}

/**
 * Trả hàng nhập theo phiếu nhập gốc. Số lượng mỗi dòng không vượt số đã nhập trừ số đã trả. Giá trị
 * hàng trả theo giá nhập thực của dòng gốc (sau chiết khấu dòng và chiết khấu phiếu), lũy kế theo
 * số lượng như trả hàng bán (ADR-0010): trả nhiều lần cộng lại bằng trả một lần.
 * Giá trị trả trước hết giảm số còn phải trả của phiếu (giảm công nợ NCC, không xuống âm), phần dư
 * là tiền NCC hoàn lại.
 */
export async function createPurchaseReturn({
  db: rootDb,
  transaction,
  actor,
  purchaseOrderId,
  input,
  meta,
}: CreatePurchaseReturnDeps): Promise<PurchaseReturn> {
  const db = serviceDb(rootDb, transaction)
  const returnId = await db.transaction(async (tx) => {
    const txDb = tx as unknown as Db
    const po = await loadPurchaseOrderPayables(txDb, {
      storeId: actor.storeId,
      purchaseOrderId,
      forUpdate: true,
    })
    if (po.status !== 'active') {
      throw new ApiError('BUSINESS_RULE_VIOLATION', 'Phiếu nhập đã hủy, không trả hàng được')
    }

    const items = await tx
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.purchaseOrderId, po.id))
      .orderBy(asc(purchaseOrderItems.createdAt), asc(purchaseOrderItems.id))
    const itemById = new Map(items.map((it) => [it.id, it]))
    const netValues = lineNetValues(items, po.discountTotal)

    const lines: Array<{
      item: PurchaseItemRow
      quantity: number
      baseQuantity: number
      value: number
    }> = []
    for (const requested of input.items) {
      const item = itemById.get(requested.purchaseOrderItemId)
      if (!item) {
        throw new ApiError('VALIDATION_ERROR', 'Dòng hàng không thuộc phiếu nhập này')
      }
      const remaining = item.quantity - item.returnedQuantity
      if (requested.quantity > remaining) {
        throw new ApiError(
          'BUSINESS_RULE_VIOLATION',
          `${item.productNameSnapshot}: số lượng trả (${requested.quantity}) vượt quá số còn được trả (${remaining})`,
          { reason: 'return_quantity_exceeded', purchaseOrderItemId: item.id, remaining },
        )
      }
      const value = computeReturnLineRefund(
        {
          quantity: item.quantity,
          lineTotal: netValues.get(item.id) ?? Number(item.lineTotal),
          orderDiscountAllocated: 0,
        },
        item.returnedQuantity,
        requested.quantity,
      )
      lines.push({
        item,
        quantity: requested.quantity,
        baseQuantity: requested.quantity * item.conversionFactor,
        value,
      })
    }
    const totalAmount = lines.reduce((sum, l) => sum + l.value, 0)

    const supplier = await lockSupplier(txDb, actor.storeId, po.supplierId)
    await lockProductsInIdOrder({
      tx: txDb,
      storeId: actor.storeId,
      productIds: lines.map((l) => l.item.productId),
    })
    await assertStockAvailable(txDb, actor.storeId, lines, 'trả hàng nhập')

    const debtReductionAmount = Math.max(
      0,
      Math.min(totalAmount, po.outstanding, supplier.currentDebt),
    )
    const supplierRefundAmount = totalAmount - debtReductionAmount

    const code = await nextDocumentCode({
      db: txDb,
      storeId: actor.storeId,
      kind: 'purchase_return',
    })
    const [created] = await tx
      .insert(purchaseReturns)
      .values({
        storeId: actor.storeId,
        purchaseOrderId: po.id,
        supplierId: po.supplierId,
        code,
        totalAmount,
        debtReductionAmount,
        supplierRefundAmount,
        note: input.note?.trim() || null,
        createdBy: actor.userId,
      })
      .returning({ id: purchaseReturns.id })
    if (!created) {
      throw new ApiError('INTERNAL_ERROR', 'Không tạo được phiếu trả hàng nhập')
    }

    for (const line of lines) {
      const removed = await removeReceivedStock({
        tx: txDb,
        storeId: actor.storeId,
        productId: line.item.productId,
        variantId: line.item.variantId,
        quantity: line.baseQuantity,
        totalCost: line.value,
      })
      await tx.insert(purchaseReturnItems).values({
        purchaseReturnId: created.id,
        purchaseOrderItemId: line.item.id,
        productId: line.item.productId,
        variantId: line.item.variantId,
        quantity: line.quantity,
        conversionFactor: line.item.conversionFactor,
        baseQuantity: line.baseQuantity,
        lineTotal: line.value,
        costAfter: removed.costAfter,
        stockAfter: removed.stockAfter,
      })
      await tx
        .update(purchaseOrderItems)
        .set({ returnedQuantity: sql`${purchaseOrderItems.returnedQuantity} + ${line.quantity}` })
        .where(eq(purchaseOrderItems.id, line.item.id))
      await tx.insert(inventoryTransactions).values({
        storeId: actor.storeId,
        productId: line.item.productId,
        variantId: line.item.variantId,
        type: 'purchase_return',
        quantity: -line.baseQuantity,
        unitCost: Math.round(line.value / line.baseQuantity),
        costAfter: removed.costAfter,
        stockAfter: removed.stockAfter,
        note: code,
        createdBy: actor.userId,
      })
    }

    await tx
      .update(purchaseOrders)
      .set({
        returnedAmount: sql`${purchaseOrders.returnedAmount} + ${totalAmount}`,
        returnRefundAmount: sql`${purchaseOrders.returnRefundAmount} + ${supplierRefundAmount}`,
      })
      .where(eq(purchaseOrders.id, po.id))
    await refreshPurchaseOrderPaymentStatus(txDb, po.id)

    const debtAfter = supplier.currentDebt - debtReductionAmount
    await tx
      .update(suppliers)
      .set({
        currentDebt: sql`${suppliers.currentDebt} - ${debtReductionAmount}`,
        totalPurchased: sql`${suppliers.totalPurchased} - ${totalAmount}`,
      })
      .where(eq(suppliers.id, supplier.id))

    await logAction({
      db: txDb,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'purchase_return.created',
      targetType: 'purchase_return',
      targetId: created.id,
      changes: {
        code,
        purchaseOrderId: po.id,
        purchaseOrderCode: po.code,
        totalAmount,
        debtReductionAmount,
        supplierRefundAmount,
        items: lines.map((l) => ({
          purchaseOrderItemId: l.item.id,
          quantity: l.quantity,
          value: l.value,
        })),
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })
    if (debtReductionAmount !== 0) {
      await logAction({
        db: txDb,
        storeId: actor.storeId,
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'supplier.debt_changed',
        targetType: 'supplier',
        targetId: supplier.id,
        changes: {
          debtBefore: supplier.currentDebt,
          debtAfter,
          purchaseOrderId: po.id,
          purchaseOrderCode: po.code,
          purchaseReturnCode: code,
          reason: 'purchase_return',
        },
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      })
    }
    logger.info(
      {
        storeId: actor.storeId,
        purchaseOrderId: po.id,
        code,
        totalAmount,
        debtReductionAmount,
        supplierRefundAmount,
      },
      'purchase_return.created',
    )
    return created.id
  })

  const items = await db
    .select()
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId))
  const returns = await listPurchaseReturns({ db, purchaseOrderId, items })
  const created = returns.find((r) => r.id === returnId)
  if (!created) {
    throw new ApiError('INTERNAL_ERROR', 'Không đọc lại được phiếu trả hàng nhập')
  }
  return created
}

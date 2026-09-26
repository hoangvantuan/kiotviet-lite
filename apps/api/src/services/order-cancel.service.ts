import { and, eq, sql } from 'drizzle-orm'

import {
  type CancelDocumentInput,
  debts,
  inventoryTransactions,
  orderItems,
  orderReturns,
  orders,
  products,
  productVariants,
  type UserRole,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'
import { logAction, type RequestMeta } from './audit.service.js'
import {
  lockCustomerForDebt,
  restoreCustomerPrepayment,
  settleCustomerDebts,
} from './customer-debt-ledger.service.js'
import { alreadyCancelledError, authorizeDocumentCancel } from './document-cancel.helper.js'
import {
  aggregateVariantStock,
  loadProductForUpdate,
  loadVariantForUpdate,
  lockProductsInIdOrder,
} from './products-lock.helper.js'
import { serviceDb, type ServiceTransaction } from './service-transaction.js'

export interface CancelOrderDeps {
  db: Db
  transaction?: ServiceTransaction
  actor: { userId: string; storeId: string; role: UserRole }
  orderId: string
  input: CancelDocumentInput
  meta?: RequestMeta
}

export interface CancelOrderResult {
  id: string
  orderNumber: string
  status: 'cancelled'
  /** Tiền cửa hàng phải trả lại khách: phần khách đã trả lúc bán */
  cashRefundAmount: number
  /** Phần nợ của đơn được xóa khỏi công nợ khách */
  debtReductionAmount: number
  /** Phần tiền trả trước đã cấn vào đơn, trả về tiền trả trước của khách (ADR-0011) */
  prepaymentRefundAmount: number
  cancelledAt: string
  cancelReason: string
}

/**
 * TIEN-107: hủy đơn bán. Đơn không bị xóa, đổi sang 'cancelled' kèm người hủy, lúc hủy, lý do.
 * Đảo đúng các bút toán đơn đã ghi: hoàn tồn theo hệ số quy đổi chụp lúc bán và theo biến thể,
 * xóa phần nợ còn lại của đơn (giảm trừ, không phải tiền thu), trả lại tiền trả trước đã cấn.
 * Tiền khách đã trả lúc bán là tiền mặt cửa hàng hoàn lại, ghi trong nhật ký.
 *
 * Chặn: đơn đã có phiếu trả hàng (phải xử lý qua trả hàng), đơn có phiếu thu đã thu vào nợ của
 * đơn (hủy phiếu thu trước). Thứ tự khóa theo ADR-0008: đơn, khách, khoản nợ, sản phẩm, biến thể.
 */
export async function cancelOrder({
  db: rootDb,
  transaction,
  actor,
  orderId,
  input,
  meta,
}: CancelOrderDeps): Promise<CancelOrderResult> {
  const db = serviceDb(rootDb, transaction)
  const approver = await authorizeDocumentCancel({ db, actor, input, meta })
  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Db
    const [order] = await tx
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        customerId: orders.customerId,
        status: orders.status,
        total: orders.total,
      })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.storeId, actor.storeId)))
      .for('update')
      .limit(1)
    if (!order) {
      throw new ApiError('NOT_FOUND', 'Không tìm thấy đơn hàng')
    }
    if (order.status === 'cancelled') {
      throw alreadyCancelledError('Đơn hàng')
    }
    const [returned] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(orderReturns)
      .where(eq(orderReturns.orderId, order.id))
    if (order.status !== 'completed' || Number(returned?.count ?? 0) > 0) {
      throw new ApiError(
        'BUSINESS_RULE_VIOLATION',
        'Đơn đã có phiếu trả hàng nên không hủy được. Hãy trả nốt phần hàng còn lại qua trả hàng',
        { reason: 'order_has_returns' },
      )
    }

    if (order.customerId) {
      await lockCustomerForDebt(txDb, { storeId: actor.storeId, customerId: order.customerId })
    }
    const [debt] = await tx
      .select({
        id: debts.id,
        customerId: debts.customerId,
        amount: debts.amount,
        paid: debts.paid,
        remaining: debts.remaining,
        prepaymentApplied: debts.prepaymentApplied,
      })
      .from(debts)
      .where(and(eq(debts.orderId, order.id), eq(debts.storeId, actor.storeId)))
      .for('update')
      .limit(1)
    if (debt && Number(debt.paid) > 0) {
      throw new ApiError(
        'BUSINESS_RULE_VIOLATION',
        'Đơn đã có phiếu thu tiền nợ. Hãy hủy phiếu thu trước rồi mới hủy đơn',
        { reason: 'order_has_receipts' },
      )
    }

    const prepaymentRefundAmount = debt ? Number(debt.prepaymentApplied) : 0
    const debtReductionAmount = debt ? Number(debt.remaining) : 0
    const cashRefundAmount = Number(order.total) - (debt ? Number(debt.amount) : 0)

    // Trả tiền trả trước trước khi khóa sản phẩm: hàm khóa các khoản trả trước của khách
    if (debt && prepaymentRefundAmount > 0) {
      await restoreCustomerPrepayment(txDb, {
        storeId: actor.storeId,
        customerId: debt.customerId,
        debtId: debt.id,
        amount: prepaymentRefundAmount,
      })
    }
    if (debt && debtReductionAmount > 0) {
      await settleCustomerDebts(txDb, {
        storeId: actor.storeId,
        customerId: debt.customerId,
        kind: 'reduction',
        allocations: [{ debtId: debt.id, amount: debtReductionAmount }],
      })
    }

    const items = await tx
      .select({
        productId: orderItems.productId,
        variantId: orderItems.variantId,
        quantity: orderItems.quantity,
        conversionFactor: orderItems.conversionFactor,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id))
    await lockProductsInIdOrder({
      tx: txDb,
      storeId: actor.storeId,
      productIds: items.map((item) => item.productId),
    })

    // Hoàn tồn đúng như lúc bán đã trừ: chỉ sản phẩm theo dõi tồn, số đơn vị gốc = SL × hệ số
    for (const item of items) {
      const product = await loadProductForUpdate({
        tx: txDb,
        storeId: actor.storeId,
        productId: item.productId,
      })
      if (!product.trackInventory) continue
      const restoreQty = Number(item.quantity) * Number(item.conversionFactor)
      let newStock: number
      if (item.variantId) {
        const variant = await loadVariantForUpdate({
          tx: txDb,
          productId: item.productId,
          variantId: item.variantId,
        })
        newStock = variant.stockQuantity + restoreQty
        await tx
          .update(productVariants)
          .set({ stockQuantity: newStock })
          .where(eq(productVariants.id, item.variantId))
        const aggStock = await aggregateVariantStock({ tx: txDb, productId: item.productId })
        await tx
          .update(products)
          .set({ currentStock: aggStock })
          .where(eq(products.id, item.productId))
      } else {
        const [updated] = await tx
          .update(products)
          .set({ currentStock: sql`${products.currentStock} + ${restoreQty}` })
          .where(eq(products.id, item.productId))
          .returning({ currentStock: products.currentStock })
        newStock = updated?.currentStock ?? product.currentStock + restoreQty
      }
      await tx.insert(inventoryTransactions).values({
        storeId: actor.storeId,
        productId: item.productId,
        variantId: item.variantId,
        type: 'order_cancel',
        quantity: restoreQty,
        stockAfter: newStock,
        note: `Hủy ${order.orderNumber}`,
        createdBy: actor.userId,
      })
    }

    const reason = input.reason.trim()
    const cancelledAt = new Date()
    await tx
      .update(orders)
      .set({ status: 'cancelled', cancelledAt, cancelledBy: actor.userId, cancelReason: reason })
      .where(eq(orders.id, order.id))

    await logAction({
      db: txDb,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'order.cancelled',
      targetType: 'order',
      targetId: order.id,
      changes: {
        orderNumber: order.orderNumber,
        total: Number(order.total),
        reason,
        cashRefundAmount,
        debtReductionAmount,
        prepaymentRefundAmount,
        approvedBy: approver?.userId ?? null,
        approvedByName: approver?.name ?? null,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })
    logger.info(
      { storeId: actor.storeId, orderId: order.id, cashRefundAmount, debtReductionAmount },
      'order.cancelled',
    )

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: 'cancelled' as const,
      cashRefundAmount,
      debtReductionAmount,
      prepaymentRefundAmount,
      cancelledAt: cancelledAt.toISOString(),
      cancelReason: reason,
    }
  })
}

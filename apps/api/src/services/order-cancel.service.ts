import { and, eq, sql } from 'drizzle-orm'

import {
  addQty,
  type CancelDocumentInput,
  debts,
  defaultRefundMethod,
  inventoryTransactions,
  type MoneyMethod,
  orderReturns,
  orders,
  parseQuantity,
  products,
  productVariants,
  type UserRole,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'
import { assertStockStaysWhole } from '../lib/quantity-policy.js'
import { logAction, type RequestMeta } from './audit.service.js'
import {
  lockCustomerForDebt,
  restoreCustomerPrepayment,
  settleCustomerDebts,
} from './customer-debt-ledger.service.js'
import {
  alreadyCancelledError,
  assertProductsNotDeleted,
  type PreauthorizedCancel,
  resolveCancelApprover,
} from './document-cancel.helper.js'
import {
  aggregateVariantStock,
  loadProductForUpdate,
  loadVariantForUpdate,
  lockProductsInIdOrder,
} from './products-lock.helper.js'
import { serviceDb, type ServiceTransaction } from './service-transaction.js'
import { assertDocumentShift, resolveDocumentShift } from './shifts.service.js'

export interface CancelOrderDeps {
  db: Db
  transaction?: ServiceTransaction
  actor: { userId: string; storeId: string; role: UserRole }
  orderId: string
  input: CancelDocumentInput
  /** Route đã kiểm quyền và PIN ngoài transaction (`cancelDocumentRoute`) */
  preauthorized?: PreauthorizedCancel
  meta?: RequestMeta
}

export interface CancelOrderResult {
  id: string
  orderNumber: string
  status: 'cancelled'
  /** Tiền cửa hàng phải trả lại khách: phần khách đã trả lúc bán */
  cashRefundAmount: number
  /** BC-06: kênh trả lại phần tiền trên; NULL khi không phải trả tiền */
  refundMethod: MoneyMethod | null
  /** Phần nợ của đơn được xóa khỏi công nợ khách */
  debtReductionAmount: number
  /** Phần tiền trả trước đã cấn vào đơn, trả về tiền trả trước của khách (ADR-0011) */
  prepaymentRefundAmount: number
  cancelledAt: string
  cancelReason: string
}

/**
 * TIEN-107: hủy đơn bán. Đơn không bị xóa, đổi sang 'cancelled' kèm người hủy, lúc hủy, lý do.
 * Đảo đúng các bút toán đơn đã ghi: hoàn tồn đúng số các dòng bán của đơn đã trừ trong sổ kho,
 * xóa phần nợ còn lại của đơn (giảm trừ, không phải tiền thu), trả lại tiền trả trước đã cấn.
 * Tiền khách đã trả lúc bán là tiền cửa hàng trả lại: ghi số tiền, kênh trả và ca chi tiền trên đơn.
 * Tiền bán vẫn thuộc ngày bán và ca bán (không rút ngược số của ngày cũ, ca đã đóng); khoản trả lại
 * là tiền ra của ngày hủy, ca hủy (BC-06).
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
  preauthorized,
  meta,
}: CancelOrderDeps): Promise<CancelOrderResult> {
  const db = serviceDb(rootDb, transaction)
  const approver = await resolveCancelApprover({ db, actor, input, meta, preauthorized })
  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Db
    // Ca khóa trước đơn (cùng thứ tự với trả hàng, đóng ca khóa ca rồi mới đọc chứng từ)
    const shiftResolution = await resolveDocumentShift(txDb, {
      storeId: actor.storeId,
      userId: actor.userId,
      requestedShiftId: input.shiftId,
    })
    const [order] = await tx
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        customerId: orders.customerId,
        status: orders.status,
        total: orders.total,
        paymentMethod: orders.paymentMethod,
        cashAmount: orders.cashAmount,
        transferAmount: orders.transferAmount,
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
    const refundMethod: MoneyMethod | null =
      cashRefundAmount > 0
        ? (input.refundMethod ??
          defaultRefundMethod({
            paymentMethod: order.paymentMethod,
            cashAmount: order.cashAmount === null ? null : Number(order.cashAmount),
            transferAmount: order.transferAmount === null ? null : Number(order.transferAmount),
          }))
        : null
    const cancelShiftId =
      refundMethod === null ? null : assertDocumentShift(shiftResolution, refundMethod === 'cash')

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

    // Hoàn tồn đúng như lúc bán đã trừ: đọc các dòng 'sale' của đơn trong sổ giao dịch kho (theo
    // tham chiếu chứng từ POS-18, dòng cũ đã được migration điền từ ghi chú), không dựa vào cờ theo
    // dõi tồn hiện tại. Sản phẩm bật hay tắt theo dõi tồn sau khi
    // bán thì vẫn hoàn đúng số đã trừ, hàng không trừ kho lúc bán thì không cộng vào.
    const sold = await tx
      .select({
        productId: inventoryTransactions.productId,
        variantId: inventoryTransactions.variantId,
        quantity: sql<string>`SUM(-${inventoryTransactions.quantity})`,
      })
      .from(inventoryTransactions)
      .where(
        and(
          eq(inventoryTransactions.storeId, actor.storeId),
          eq(inventoryTransactions.type, 'sale'),
          eq(inventoryTransactions.referenceType, 'order'),
          eq(inventoryTransactions.referenceId, order.id),
        ),
      )
      .groupBy(inventoryTransactions.productId, inventoryTransactions.variantId)
    const restores = sold
      .map((row) => ({ ...row, quantity: parseQuantity(row.quantity) }))
      .filter((row) => row.quantity > 0)
      .sort((a, b) =>
        a.productId === b.productId
          ? (a.variantId ?? '').localeCompare(b.variantId ?? '')
          : a.productId.localeCompare(b.productId),
      )
    await lockProductsInIdOrder({
      tx: txDb,
      storeId: actor.storeId,
      productIds: restores.map((row) => row.productId),
    })
    await assertProductsNotDeleted(
      txDb,
      actor.storeId,
      restores.map((row) => row.productId),
      'hủy đơn',
    )

    for (const row of restores) {
      const product = await loadProductForUpdate({
        tx: txDb,
        storeId: actor.storeId,
        productId: row.productId,
      })
      const restoreQty = row.quantity
      let newStock: number
      if (row.variantId) {
        const variant = await loadVariantForUpdate({
          tx: txDb,
          productId: row.productId,
          variantId: row.variantId,
        })
        newStock = addQty(variant.stockQuantity, restoreQty)
        await tx
          .update(productVariants)
          .set({ stockQuantity: newStock })
          .where(eq(productVariants.id, row.variantId))
        const aggStock = await aggregateVariantStock({ tx: txDb, productId: row.productId })
        await tx
          .update(products)
          .set({ currentStock: aggStock })
          .where(eq(products.id, row.productId))
      } else {
        const [updated] = await tx
          .update(products)
          .set({ currentStock: sql`${products.currentStock} + ${restoreQty}` })
          .where(eq(products.id, row.productId))
          .returning({ currentStock: products.currentStock })
        newStock = updated?.currentStock ?? addQty(product.currentStock, restoreQty)
      }
      assertStockStaysWhole({
        stock: newStock,
        productName: product.name,
        productAllowsDecimal: product.allowDecimalQuantity,
      })
      await tx.insert(inventoryTransactions).values({
        storeId: actor.storeId,
        productId: row.productId,
        variantId: row.variantId,
        type: 'order_cancel',
        quantity: restoreQty,
        stockAfter: newStock,
        note: `Hủy ${order.orderNumber}`,
        referenceType: 'order',
        referenceId: order.id,
        createdBy: actor.userId,
      })
    }

    const reason = input.reason.trim()
    const cancelledAt = new Date()
    await tx
      .update(orders)
      .set({
        status: 'cancelled',
        cancelledAt,
        cancelledBy: actor.userId,
        cancelReason: reason,
        cancelRefundAmount: cashRefundAmount,
        cancelRefundMethod: refundMethod,
        cancelShiftId,
      })
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
        refundMethod,
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
      refundMethod,
      debtReductionAmount,
      prepaymentRefundAmount,
      cancelledAt: cancelledAt.toISOString(),
      cancelReason: reason,
    }
  })
}

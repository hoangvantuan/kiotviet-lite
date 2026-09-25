import { and, asc, eq, inArray, like, sql } from 'drizzle-orm'

import {
  computeReturnLineRefund,
  type CreateOrderReturnInput,
  debts,
  inventoryTransactions,
  orderItems,
  type OrderReturnDetail,
  type OrderReturnItemDetail,
  orderReturnItems,
  type OrderReturnListItem,
  orderReturns,
  orders,
  products,
  productVariants,
  type ReturnableItem,
  splitReturnRefund,
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
  lockCustomerForDebt,
  restoreCustomerPrepayment,
  settleCustomerDebts,
} from './customer-debt-ledger.service.js'
import {
  aggregateVariantStock,
  loadProductForUpdate,
  loadVariantForUpdate,
  lockProductsInIdOrder,
} from './products-lock.helper.js'

export interface ReturnsActor {
  userId: string
  storeId: string
  role: UserRole
}

const MAX_DAILY_RETURN_SEQUENCE = 9999

const DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function formatDateForCode(date: Date): string {
  return DATE_FORMATTER.format(date).replace(/-/g, '')
}

async function generateReturnNumber({ tx, storeId }: { tx: Db; storeId: string }): Promise<string> {
  const dateStr = formatDateForCode(new Date())
  const prefix = `TH-${dateStr.slice(2)}-`
  const escapedPrefix = escapeLikePattern(prefix)

  const rows = await tx
    .select({ code: sql<string>`MAX(${orderReturns.returnNumber})` })
    .from(orderReturns)
    .where(
      and(eq(orderReturns.storeId, storeId), like(orderReturns.returnNumber, `${escapedPrefix}%`)),
    )

  const maxCode = rows[0]?.code ?? null
  const nextSeq = maxCode ? parseInt(maxCode.slice(-4), 10) + 1 : 1
  if (nextSeq > MAX_DAILY_RETURN_SEQUENCE) {
    throw new ApiError('BUSINESS_RULE_VIOLATION', 'Đã vượt quá 9999 phiếu trả trong ngày')
  }
  return `${prefix}${String(nextSeq).padStart(4, '0')}`
}

function incrementReturnSequence(code: string): string {
  const seqStr = code.slice(-4)
  const next = parseInt(seqStr, 10) + 1
  if (next > MAX_DAILY_RETURN_SEQUENCE) {
    throw new ApiError('BUSINESS_RULE_VIOLATION', 'Đã vượt quá 9999 phiếu trả trong ngày')
  }
  return `${code.slice(0, -4)}${String(next).padStart(4, '0')}`
}

// ---------------------------------------------------------------------------
// getReturnableItems
// ---------------------------------------------------------------------------

export interface GetReturnableItemsDeps {
  db: Db
  storeId: string
  orderId: string
}

export async function getReturnableItems({
  db,
  storeId,
  orderId,
}: GetReturnableItemsDeps): Promise<ReturnableItem[]> {
  const orderRows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.storeId, storeId)))
    .limit(1)

  if (!orderRows[0]) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy đơn hàng')
  }

  const items = await db
    .select({
      orderItemId: orderItems.id,
      productId: orderItems.productId,
      variantId: orderItems.variantId,
      productName: orderItems.productName,
      variantName: orderItems.variantName,
      unit: orderItems.unit,
      unitPrice: orderItems.unitPrice,
      lineTotal: orderItems.lineTotal,
      orderDiscountAllocated: orderItems.orderDiscountAllocated,
      conversionFactor: orderItems.conversionFactor,
      purchasedQuantity: orderItems.quantity,
      returnedQuantity: sql<number>`COALESCE(SUM(${orderReturnItems.quantity}), 0)::int`,
    })
    .from(orderItems)
    .leftJoin(orderReturnItems, eq(orderReturnItems.orderItemId, orderItems.id))
    .where(eq(orderItems.orderId, orderId))
    .groupBy(orderItems.id)
    .orderBy(asc(orderItems.createdAt))

  return items.map((it) => ({
    orderItemId: it.orderItemId,
    productId: it.productId,
    variantId: it.variantId ?? null,
    productName: it.productName,
    variantName: it.variantName ?? null,
    unit: it.unit ?? null,
    unitPrice: Number(it.unitPrice),
    purchasedQuantity: Number(it.purchasedQuantity),
    returnedQuantity: Number(it.returnedQuantity),
    remainingQuantity: Number(it.purchasedQuantity) - Number(it.returnedQuantity),
    lineTotal: Number(it.lineTotal),
    orderDiscountAllocated: Number(it.orderDiscountAllocated),
    conversionFactor: Number(it.conversionFactor),
  }))
}

/**
 * Tiền trả trước đã cấn vào khoản nợ của đơn và chưa hoàn lại (ADR-0011), để hộp trả hàng xem
 * trước đúng phần hoàn vào trả trước.
 */
export async function getOrderPrepaymentApplied({
  db,
  storeId,
  orderId,
}: {
  db: Db
  storeId: string
  orderId: string
}): Promise<number> {
  const [row] = await db
    .select({ prepaymentApplied: debts.prepaymentApplied })
    .from(debts)
    .where(and(eq(debts.orderId, orderId), eq(debts.storeId, storeId)))
    .limit(1)
  return row ? Number(row.prepaymentApplied) : 0
}

// ---------------------------------------------------------------------------
// createReturn
// Tiền hoàn và số hoàn kho đọc ảnh chụp trên dòng đơn (ADR-0010): thành tiền dòng, chiết khấu
// đơn đã phân bổ, hệ số quy đổi.
// ---------------------------------------------------------------------------

export interface CreateReturnDeps {
  db: Db
  actor: ReturnsActor
  orderId: string
  input: CreateOrderReturnInput
  meta?: RequestMeta
}

export async function createReturn({
  db,
  actor,
  orderId,
  input,
  meta,
}: CreateReturnDeps): Promise<OrderReturnDetail> {
  const result = await db.transaction(async (tx) => {
    const txDb = tx as unknown as Db

    // 1. Validate order
    const orderRows = await tx
      .select({
        id: orders.id,
        storeId: orders.storeId,
        orderNumber: orders.orderNumber,
        customerId: orders.customerId,
        paymentStatus: orders.paymentStatus,
        status: orders.status,
        total: orders.total,
      })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.storeId, actor.storeId)))
      .for('update')
      .limit(1)

    const order = orderRows[0]
    if (!order) {
      throw new ApiError('NOT_FOUND', 'Không tìm thấy đơn hàng')
    }

    if (order.status !== 'completed' && order.status !== 'partial_return') {
      throw new ApiError('BUSINESS_RULE_VIOLATION', 'Chỉ có thể trả hàng cho đơn đã hoàn thành')
    }

    // 2. Load order items + returned quantities
    const existingItems = await tx
      .select({
        orderItemId: orderItems.id,
        productId: orderItems.productId,
        variantId: orderItems.variantId,
        productName: orderItems.productName,
        variantName: orderItems.variantName,
        unit: orderItems.unit,
        unitPrice: orderItems.unitPrice,
        lineTotal: orderItems.lineTotal,
        orderDiscountAllocated: orderItems.orderDiscountAllocated,
        conversionFactor: orderItems.conversionFactor,
        purchasedQuantity: orderItems.quantity,
        returnedQuantity: sql<number>`COALESCE(SUM(${orderReturnItems.quantity}), 0)::int`,
      })
      .from(orderItems)
      .leftJoin(orderReturnItems, eq(orderReturnItems.orderItemId, orderItems.id))
      .where(eq(orderItems.orderId, orderId))
      .groupBy(orderItems.id)

    const itemMap = new Map(existingItems.map((it) => [it.orderItemId, it]))
    // CRIT C3: trừ dồn số đã trả trong chính phiếu này. itemMap là snapshot đầu
    // transaction nên không tự cập nhật; nếu thiếu, các dòng trùng orderItemId đều
    // thấy cùng remaining và cho trả vượt. Phòng vệ sâu kể cả khi schema bị bypass.
    const consumedInThisReturn = new Map<string, number>()

    // 3. Validate return items + calculate total
    let totalAmount = 0
    const validatedItems: Array<{
      orderItemId: string
      productId: string
      variantId: string | null
      productName: string
      variantName: string | null
      unit: string | null
      unitPrice: number
      quantity: number
      conversionFactor: number
      lineTotal: number
      reason: string
    }> = []

    for (const returnItem of input.items) {
      const existing = itemMap.get(returnItem.orderItemId)
      if (!existing) {
        throw new ApiError('VALIDATION_ERROR', `Sản phẩm không thuộc đơn hàng này`)
      }

      const alreadyConsumed = consumedInThisReturn.get(returnItem.orderItemId) ?? 0
      const remaining =
        Number(existing.purchasedQuantity) - Number(existing.returnedQuantity) - alreadyConsumed
      if (returnItem.quantity > remaining) {
        throw new ApiError(
          'VALIDATION_ERROR',
          `${existing.productName}: số lượng trả (${returnItem.quantity}) vượt quá còn lại (${remaining})`,
        )
      }
      consumedInThisReturn.set(returnItem.orderItemId, alreadyConsumed + returnItem.quantity)

      // TIEN-101: tiền hoàn tính trên giá trị ròng của dòng (sau chiết khấu dòng và phần chiết khấu
      // đơn đã phân bổ lúc bán), lấy chênh lệch lũy kế theo số lượng. Tỷ lệ chiết khấu áp đúng một
      // lần nên trả N lần cộng lại bằng trả một lần, trả hết dòng hoàn đúng giá trị ròng cả dòng.
      const lineTotal = computeReturnLineRefund(
        {
          quantity: Number(existing.purchasedQuantity),
          lineTotal: Number(existing.lineTotal),
          orderDiscountAllocated: Number(existing.orderDiscountAllocated),
        },
        Number(existing.returnedQuantity) + alreadyConsumed,
        returnItem.quantity,
      )
      totalAmount += lineTotal

      validatedItems.push({
        orderItemId: returnItem.orderItemId,
        productId: existing.productId,
        variantId: existing.variantId ?? null,
        productName: existing.productName,
        variantName: existing.variantName ?? null,
        unit: existing.unit ?? null,
        unitPrice: Number(existing.unitPrice),
        quantity: returnItem.quantity,
        conversionFactor: Number(existing.conversionFactor),
        lineTotal,
        reason: returnItem.reason,
      })
    }

    // Trần hoàn tiền: tổng các phiếu trả của đơn không vượt tổng đơn (số khách thực phải trả).
    // Với dữ liệu nhất quán công thức trên không chạm trần; trần chặn dữ liệu lệch như đơn cũ đã
    // hoàn dư (TIEN-101) hay dòng đơn lệch tổng đơn. Đơn đã khóa ở trên nên tổng đã hoàn không đổi.
    const [refunded] = await tx
      .select({ sum: sql<string>`COALESCE(SUM(${orderReturns.totalAmount}), 0)` })
      .from(orderReturns)
      .where(eq(orderReturns.orderId, orderId))
    const refundCap = Math.max(0, Number(order.total) - Number(refunded?.sum ?? 0))
    if (totalAmount > refundCap) {
      // Cắt phần vượt từ dòng cuối lên để tổng các dòng phiếu trả khớp tổng phiếu
      let excess = totalAmount - refundCap
      for (let i = validatedItems.length - 1; i >= 0 && excess > 0; i--) {
        const line = validatedItems[i]!
        const cut = Math.min(excess, line.lineTotal)
        line.lineTotal -= cut
        excess -= cut
      }
      totalAmount = refundCap
    }

    // 4. Generate return number with retry
    let returnNumber = await generateReturnNumber({ tx: txDb, storeId: actor.storeId })
    let createdReturnId: string | null = null
    let attempts = 0
    const MAX_ATTEMPTS = 3

    // TIEN-103: thứ tự khóa chung orders, customers, debts, products (customer-debt-ledger.service.ts)
    if (order.customerId) {
      await lockCustomerForDebt(txDb, { storeId: actor.storeId, customerId: order.customerId })
    }

    // Check if order has outstanding debt
    const debtRows = await tx
      .select({
        id: debts.id,
        remaining: debts.remaining,
        paid: debts.paid,
        prepaymentApplied: debts.prepaymentApplied,
        customerId: debts.customerId,
      })
      .from(debts)
      .where(and(eq(debts.orderId, orderId), eq(debts.storeId, actor.storeId)))
      .for('update')
      .limit(1)

    const debt = debtRows[0]

    // 5. Tách phần cấn nợ còn lại của đơn, phần hoàn vào tiền trả trước và phần hoàn tiền mặt
    // (cùng hàm hộp trả hàng ở web dùng)
    const { debtReductionAmount, prepaymentRefundAmount, refundAmount } = splitReturnRefund(
      totalAmount,
      debt ? Number(debt.remaining) : 0,
      debt ? Number(debt.prepaymentApplied) : 0,
    )

    // Đơn đã được cấn bằng tiền trả trước: phần đó quay về tiền trả trước (ADR-0011). Gọi trước
    // khi khóa sản phẩm vì hàm khóa các khoản trả trước của khách.
    if (debt && prepaymentRefundAmount > 0) {
      await restoreCustomerPrepayment(txDb, {
        storeId: actor.storeId,
        customerId: debt.customerId,
        debtId: debt.id,
        amount: prepaymentRefundAmount,
      })
    }

    // Khóa sản phẩm theo id sau khoản nợ, trước khi chèn dòng trả (khóa ngoại tới products)
    await lockProductsInIdOrder({
      tx: txDb,
      storeId: actor.storeId,
      productIds: validatedItems.map((item) => item.productId),
    })

    // 6. Insert order_returns
    while (attempts < MAX_ATTEMPTS && createdReturnId === null) {
      try {
        const [row] = await tx
          .insert(orderReturns)
          .values({
            storeId: actor.storeId,
            orderId,
            returnNumber,
            totalAmount,
            refundAmount,
            debtReductionAmount,
            prepaymentRefundAmount,
            note: input.note ?? null,
            createdBy: actor.userId,
          })
          .returning({ id: orderReturns.id })
        if (!row) {
          throw new ApiError('INTERNAL_ERROR', 'Không tạo được phiếu trả hàng')
        }
        createdReturnId = row.id
      } catch (err) {
        if (isUniqueViolation(err, 'uniq_order_returns_store_number')) {
          attempts++
          if (attempts >= MAX_ATTEMPTS) {
            throw new ApiError('INTERNAL_ERROR', 'Không thể sinh mã phiếu trả, vui lòng thử lại')
          }
          returnNumber = incrementReturnSequence(returnNumber)
          continue
        }
        throw err
      }
    }

    if (!createdReturnId) {
      throw new ApiError('INTERNAL_ERROR', 'Không tạo được phiếu trả hàng')
    }

    // 7. Insert return items
    const returnItemDetails: OrderReturnItemDetail[] = []
    for (const item of validatedItems) {
      const [inserted] = await tx
        .insert(orderReturnItems)
        .values({
          returnId: createdReturnId,
          orderItemId: item.orderItemId,
          productId: item.productId,
          variantId: item.variantId,
          productName: item.productName,
          variantName: item.variantName,
          unit: item.unit,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          lineTotal: item.lineTotal,
          reason: item.reason,
        })
        .returning({ id: orderReturnItems.id })

      returnItemDetails.push({
        id: inserted!.id,
        orderItemId: item.orderItemId,
        productName: item.productName,
        variantName: item.variantName,
        unit: item.unit,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
        reason: item.reason,
      })

      // 8. Restore stock
      const product = await loadProductForUpdate({
        tx: txDb,
        storeId: actor.storeId,
        productId: item.productId,
      })

      if (product.trackInventory) {
        // POS-03: trả 1 thùng hoàn đủ số đơn vị gốc trong thùng, theo hệ số chụp lúc bán
        const restoreQty = item.quantity * item.conversionFactor
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
          await tx
            .update(products)
            .set({ currentStock: sql`${products.currentStock} + ${restoreQty}` })
            .where(eq(products.id, item.productId))

          const [updated] = await tx
            .select({ currentStock: products.currentStock })
            .from(products)
            .where(eq(products.id, item.productId))
            .limit(1)
          newStock = updated?.currentStock ?? product.currentStock + restoreQty
        }

        await tx.insert(inventoryTransactions).values({
          storeId: actor.storeId,
          productId: item.productId,
          variantId: item.variantId,
          type: 'return',
          quantity: restoreQty,
          stockAfter: newStock,
          note: returnNumber,
          createdBy: actor.userId,
        })
      }
    }

    // 9. Debt reduction: cấn trừ là giảm trừ, không phải tiền thu (TIEN-01)
    if (debt && debtReductionAmount > 0) {
      await settleCustomerDebts(txDb, {
        storeId: actor.storeId,
        customerId: debt.customerId,
        kind: 'reduction',
        allocations: [{ debtId: debt.id, amount: debtReductionAmount }],
      })

      // Hết nợ nhờ cấn trừ chỉ là "đã thanh toán" khi khách thực có trả tiền cho đơn này
      // (trả trước lúc bán hoặc phiếu thu); không thu đồng nào thì giữ nguyên trạng thái.
      const newRemaining = Number(debt.remaining) - debtReductionAmount
      const hasCashPaid = Number(debt.paid) > 0 || order.paymentStatus === 'partial'
      if (newRemaining <= 0 && hasCashPaid) {
        await tx.update(orders).set({ paymentStatus: 'paid' }).where(eq(orders.id, orderId))
      }
    }

    // 10. Update order status
    // Check if all items fully returned
    const afterItems = await tx
      .select({
        purchasedQuantity: orderItems.quantity,
        returnedQuantity: sql<number>`COALESCE(SUM(${orderReturnItems.quantity}), 0)::int`,
      })
      .from(orderItems)
      .leftJoin(orderReturnItems, eq(orderReturnItems.orderItemId, orderItems.id))
      .where(eq(orderItems.orderId, orderId))
      .groupBy(orderItems.id, orderItems.quantity)

    const allFullyReturned = afterItems.every(
      (it) => Number(it.returnedQuantity) >= Number(it.purchasedQuantity),
    )

    const newStatus = allFullyReturned ? 'full_return' : 'partial_return'
    await tx.update(orders).set({ status: newStatus }).where(eq(orders.id, orderId))

    // 11. Audit log
    await logAction({
      db: txDb,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'order.returned',
      targetType: 'order',
      targetId: orderId,
      changes: {
        returnId: createdReturnId,
        returnNumber,
        orderId,
        orderNumber: order.orderNumber,
        totalAmount,
        refundAmount,
        debtReductionAmount,
        prepaymentRefundAmount,
        itemCount: validatedItems.length,
        newStatus,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    logger.info(
      {
        storeId: actor.storeId,
        orderId,
        returnId: createdReturnId,
        returnNumber,
        totalAmount,
        refundAmount,
        debtReductionAmount,
        prepaymentRefundAmount,
        newStatus,
      },
      'order.returned',
    )

    return {
      id: createdReturnId,
      returnNumber,
      orderId,
      totalAmount,
      refundAmount,
      debtReductionAmount,
      prepaymentRefundAmount,
      note: input.note ?? null,
      createdBy: actor.userId,
      createdByName: null,
      createdAt: new Date().toISOString(),
      items: returnItemDetails,
    } satisfies OrderReturnDetail
  })

  return result
}

// ---------------------------------------------------------------------------
// getOrderReturns
// ---------------------------------------------------------------------------

export interface GetOrderReturnsDeps {
  db: Db
  storeId: string
  orderId: string
}

export async function getOrderReturns({
  db,
  storeId,
  orderId,
}: GetOrderReturnsDeps): Promise<OrderReturnListItem[]> {
  const orderCheck = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.storeId, storeId)))
    .limit(1)

  if (!orderCheck[0]) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy đơn hàng')
  }

  const returnRows = await db
    .select({
      id: orderReturns.id,
      returnNumber: orderReturns.returnNumber,
      totalAmount: orderReturns.totalAmount,
      refundAmount: orderReturns.refundAmount,
      debtReductionAmount: orderReturns.debtReductionAmount,
      prepaymentRefundAmount: orderReturns.prepaymentRefundAmount,
      createdByName: users.name,
      createdAt: orderReturns.createdAt,
    })
    .from(orderReturns)
    .leftJoin(users, eq(orderReturns.createdBy, users.id))
    .where(eq(orderReturns.orderId, orderId))
    .orderBy(asc(orderReturns.createdAt))

  const returnIds = returnRows.map((r) => r.id)

  const allItems =
    returnIds.length > 0
      ? await db
          .select({
            returnId: orderReturnItems.returnId,
            id: orderReturnItems.id,
            orderItemId: orderReturnItems.orderItemId,
            productName: orderReturnItems.productName,
            variantName: orderReturnItems.variantName,
            unit: orderReturnItems.unit,
            unitPrice: orderReturnItems.unitPrice,
            quantity: orderReturnItems.quantity,
            lineTotal: orderReturnItems.lineTotal,
            reason: orderReturnItems.reason,
          })
          .from(orderReturnItems)
          .where(inArray(orderReturnItems.returnId, returnIds))
      : []

  const itemsByReturnId = new Map<string, typeof allItems>()
  for (const it of allItems) {
    const list = itemsByReturnId.get(it.returnId) ?? []
    list.push(it)
    itemsByReturnId.set(it.returnId, list)
  }

  return returnRows.map((ret) => ({
    id: ret.id,
    returnNumber: ret.returnNumber,
    totalAmount: Number(ret.totalAmount),
    refundAmount: Number(ret.refundAmount),
    debtReductionAmount: Number(ret.debtReductionAmount),
    prepaymentRefundAmount: Number(ret.prepaymentRefundAmount),
    createdByName: ret.createdByName ?? null,
    createdAt: ret.createdAt.toISOString(),
    items: (itemsByReturnId.get(ret.id) ?? []).map((it) => ({
      id: it.id,
      orderItemId: it.orderItemId,
      productName: it.productName,
      variantName: it.variantName ?? null,
      unit: it.unit ?? null,
      unitPrice: Number(it.unitPrice),
      quantity: Number(it.quantity),
      lineTotal: Number(it.lineTotal),
      reason: it.reason,
    })),
  }))
}

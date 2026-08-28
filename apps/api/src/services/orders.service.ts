import { and, asc, desc, eq, gte, ilike, isNull, like, lte, type SQL, sql } from 'drizzle-orm'

import {
  calculateLineTotal,
  type CreateOrderInput,
  customerGroups,
  customers,
  debts,
  formatCurrencyVnd as formatVnd,
  inventoryTransactions,
  type ListOrdersQuery,
  orderItems,
  orders,
  products,
  productUnitConversions,
  productVariants,
  type UserRole,
  users,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { env } from '../lib/env.js'
import { ApiError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'
import { isUniqueViolation } from '../lib/pg-errors.js'
import { escapeLikePattern } from '../lib/strings.js'
import { logAction, type RequestMeta } from './audit.service.js'
import { emitEvent } from './notification-emitter.js'
import { verifyPin } from './pin.service.js'
import { resolveProductPrice } from './pricing.service.js'
import {
  aggregateVariantStock,
  loadProductForUpdate,
  loadVariantForUpdate,
} from './products-lock.helper.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrdersActor {
  userId: string
  storeId: string
  role: UserRole
}

export interface OrderDetailItem {
  id: string
  productId: string
  variantId: string | null
  productName: string
  variantName: string | null
  unit: string | null
  unitPrice: number
  quantity: number
  discountType: string | null
  discountValue: number
  discountAmount: number
  lineTotal: number
  originalPrice: number | null
  priceOverride: boolean
  sku?: string | null
  costPrice?: number | null
}

export interface OrderDetail {
  id: string
  orderNumber: string
  customerId: string | null
  subtotal: number
  discountAmount: number
  total: number
  paymentMethod: string
  paymentStatus: string
  cashAmount: number | null
  transferAmount: number | null
  debtAmount: number
  change: number
  note: string | null
  status: string
  items: OrderDetailItem[]
  createdAt: string
  oldDebt?: number | null
  customerCurrentDebt?: number | null
  isDuplicate?: boolean
  debtLimitExceeded?: boolean
}

export interface StockInfoVariant {
  id: string
  name: string
  stockQuantity: number
}

export interface StockInfo {
  productId: string
  productName: string
  currentStock: number
  minStock: number
  trackInventory: boolean
  unit: string
  variants: StockInfoVariant[]
}

// ---------------------------------------------------------------------------
// Order number generation (pattern from purchase-orders.service.ts)
// ---------------------------------------------------------------------------

const MAX_DAILY_ORDER_SEQUENCE = 9999

const DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function formatDateForCode(date: Date): string {
  return DATE_FORMATTER.format(date).replace(/-/g, '')
}

async function generateOrderNumber({ tx, storeId }: { tx: Db; storeId: string }): Promise<string> {
  const dateStr = formatDateForCode(new Date())
  const prefix = `HD-${dateStr.slice(2)}-`
  const escapedPrefix = escapeLikePattern(prefix)

  const rows = await tx
    .select({ code: sql<string>`MAX(${orders.orderNumber})` })
    .from(orders)
    .where(and(eq(orders.storeId, storeId), like(orders.orderNumber, `${escapedPrefix}%`)))

  const maxCode = rows[0]?.code ?? null
  const nextSeq = maxCode ? parseInt(maxCode.slice(-4), 10) + 1 : 1
  if (nextSeq > MAX_DAILY_ORDER_SEQUENCE) {
    throw new ApiError(
      'BUSINESS_RULE_VIOLATION',
      'Đã vượt quá 9999 đơn hàng trong ngày, vui lòng liên hệ hỗ trợ',
    )
  }
  return `${prefix}${String(nextSeq).padStart(4, '0')}`
}

function incrementOrderSequence(code: string): string {
  const seqStr = code.slice(-4)
  const next = parseInt(seqStr, 10) + 1
  if (next > MAX_DAILY_ORDER_SEQUENCE) {
    throw new ApiError(
      'BUSINESS_RULE_VIOLATION',
      'Đã vượt quá 9999 đơn hàng trong ngày, vui lòng liên hệ hỗ trợ',
    )
  }
  return `${code.slice(0, -4)}${String(next).padStart(4, '0')}`
}

// ---------------------------------------------------------------------------
// createOrder
// ---------------------------------------------------------------------------

export interface CreateOrderDeps {
  db: Db
  actor: OrdersActor
  input: CreateOrderInput
  meta?: RequestMeta
  source?: 'pos' | 'offline_sync'
  clientId?: string | null
  offlineCreatedAt?: string
  skipDebtLimitCheck?: boolean
}

export async function createOrder({
  db,
  actor,
  input,
  meta,
  source = 'pos',
  clientId: explicitClientId,
  offlineCreatedAt,
  skipDebtLimitCheck = false,
}: CreateOrderDeps): Promise<OrderDetail> {
  if (input.items.length === 0) {
    throw new ApiError('VALIDATION_ERROR', 'Đơn hàng phải có ít nhất 1 sản phẩm')
  }

  const clientId =
    explicitClientId ??
    ('clientId' in input ? (input as { clientId?: string }).clientId : undefined) ??
    null

  // Chống trùng tuần tự nhanh theo clientId nếu đã tồn tại trong store
  if (clientId) {
    const [existing] = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        customerId: orders.customerId,
        subtotal: orders.subtotal,
        discountAmount: orders.discountAmount,
        total: orders.total,
        paymentMethod: orders.paymentMethod,
        paymentStatus: orders.paymentStatus,
        cashAmount: orders.cashAmount,
        transferAmount: orders.transferAmount,
        change: orders.change,
        note: orders.note,
        status: orders.status,
        debtLimitExceeded: orders.debtLimitExceeded,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(and(eq(orders.storeId, actor.storeId), eq(orders.clientId, clientId)))
      .limit(1)

    if (existing) {
      return {
        id: existing.id,
        orderNumber: existing.orderNumber,
        customerId: existing.customerId,
        subtotal: existing.subtotal,
        discountAmount: existing.discountAmount,
        total: existing.total,
        paymentMethod: existing.paymentMethod,
        paymentStatus: existing.paymentStatus,
        cashAmount: existing.cashAmount,
        transferAmount: existing.transferAmount,
        debtAmount: input.debtAmount ?? 0,
        change: existing.change,
        note: existing.note,
        status: existing.status,
        items: [],
        createdAt: existing.createdAt.toISOString(),
        isDuplicate: true,
        debtLimitExceeded: Boolean(existing.debtLimitExceeded),
      }
    }
  }

  // SF-1: Khi debtLimitOverridden=true, verify PIN server-side trước khi vào transaction.
  // Zod refine đã đảm bảo có debtLimitOverridePin khi debtLimitOverridden=true.
  if (input.debtLimitOverridden && input.debtLimitOverridePin) {
    await verifyPin({
      db,
      userId: actor.userId,
      storeId: actor.storeId,
      pin: input.debtLimitOverridePin,
      meta,
    })
  }
  // T10: Xác minh mã PIN sửa giá (priceOverridePin) nếu có
  const hasPriceOverride = input.items.some((i) => i.priceOverride)
  let verifiedPriceOverridePin = false
  if (hasPriceOverride) {
    if (input.priceOverridePin) {
      await verifyPin({
        db,
        userId: actor.userId,
        storeId: actor.storeId,
        pin: input.priceOverridePin,
        meta,
      })
      verifiedPriceOverridePin = true
    } else if (source === 'pos') {
      throw new ApiError('VALIDATION_ERROR', 'Sửa giá yêu cầu mã PIN')
    }
  }

  let debtAmount = input.debtAmount ?? 0

  // Calculate change amount before insert
  let change = 0
  if (input.paymentMethod === 'cash' && input.cashAmount != null) {
    change = input.cashAmount - input.total
  } else if (input.paymentMethod === 'combined') {
    const cashPart = input.cashAmount ?? 0
    const transferPart = input.transferAmount ?? 0
    change = cashPart + transferPart - input.total
  } else if (input.paymentMethod === 'debt' && input.cashAmount != null) {
    change = input.cashAmount - (input.total - debtAmount)
  }
  change = Math.max(0, change)

  try {
    const result = await db.transaction(async (tx) => {
      const txDb = tx as unknown as Db

      // Generate order number with retry on unique violation
      let orderNumber = await generateOrderNumber({ tx: txDb, storeId: actor.storeId })
      let createdId: string | null = null
      let attempts = 0
      const MAX_ATTEMPTS = 3

      while (attempts < MAX_ATTEMPTS && createdId === null) {
        try {
          const [row] = await tx
            .insert(orders)
            .values({
              storeId: actor.storeId,
              orderNumber,
              customerId: input.customerId ?? null,
              userId: actor.userId,
              subtotal: input.subtotal,
              discountType: input.discountType ?? null,
              discountValue: input.discountValue,
              discountAmount: input.discountAmount,
              total: input.total,
              paymentMethod: input.paymentMethod,
              paymentStatus: input.paymentStatus,
              cashAmount: input.cashAmount ?? null,
              transferAmount: input.transferAmount ?? null,
              change,
              clientId,
              note: input.note ?? null,
              status: 'completed',
            })
            .returning({ id: orders.id })
          if (!row) {
            throw new ApiError('INTERNAL_ERROR', 'Không tạo được đơn hàng')
          }
          createdId = row.id
        } catch (err) {
          if (isUniqueViolation(err, 'uniq_orders_store_number')) {
            attempts++
            if (attempts >= MAX_ATTEMPTS) {
              throw new ApiError('INTERNAL_ERROR', 'Không thể sinh mã đơn hàng, vui lòng thử lại')
            }
            const nextCode = incrementOrderSequence(orderNumber)
            logger.warn(
              {
                storeId: actor.storeId,
                orderNumber,
                nextCode,
                attempt: attempts,
              },
              'order.code_collision_retry',
            )
            orderNumber = nextCode
            continue
          }
          throw err
        }
      }
      if (!createdId) {
        throw new ApiError('INTERNAL_ERROR', 'Không tạo được đơn hàng')
      }

      // Process items: insert order_items + deduct stock

      // Process items: insert order_items + deduct stock
      const processedItems: OrderDetailItem[] = []
      let isPriceMismatchAdjusted = false
      let adjustedSubtotal = 0

      for (const item of input.items) {
        const product = await loadProductForUpdate({
          tx: txDb,
          storeId: actor.storeId,
          productId: item.productId,
        })

        let itemSku = product.sku ?? null
        let itemCostPrice = product.costPrice != null ? Number(product.costPrice) : null
        let variant = null
        if (item.variantId) {
          variant = await loadVariantForUpdate({
            tx: txDb,
            productId: item.productId,
            variantId: item.variantId,
          })
          itemSku = variant.sku ?? product.sku ?? null
          itemCostPrice = variant.costPrice != null ? Number(variant.costPrice) : itemCostPrice
        }

        let conv: { conversionFactor: number; sellingPrice: number | null } | null = null
        if (item.unitConversionId) {
          const convRows = await tx
            .select({
              conversionFactor: productUnitConversions.conversionFactor,
              sellingPrice: productUnitConversions.sellingPrice,
            })
            .from(productUnitConversions)
            .where(
              and(
                eq(productUnitConversions.id, item.unitConversionId),
                eq(productUnitConversions.productId, item.productId),
                eq(productUnitConversions.storeId, actor.storeId),
              ),
            )
            .limit(1)
          const foundConv = convRows[0]
          if (!foundConv) {
            throw new ApiError(
              'VALIDATION_ERROR',
              'Đơn vị quy đổi không hợp lệ hoặc không thuộc sản phẩm/cửa hàng này',
            )
          }
          conv = {
            conversionFactor: foundConv.conversionFactor,
            sellingPrice:
              foundConv.sellingPrice != null && Number(foundConv.sellingPrice) > 0
                ? Number(foundConv.sellingPrice)
                : null,
          }
        }

        // T10: Máy chủ đối chiếu đơn giá với giá tự tính
        const resolvedPrice = await resolveProductPrice({
          db: txDb,
          storeId: actor.storeId,
          customerId: input.customerId ?? null,
          productId: item.productId,
          variantId: item.variantId ?? null,
          unitConversionId: item.unitConversionId ?? null,
          quantity: item.quantity,
        })

        const effectivePriceOverride = item.priceOverride ?? false
        let effectivePriceOverridePinUsed = item.priceOverridePinUsed ?? false

        if (effectivePriceOverride) {
          if (verifiedPriceOverridePin) {
            effectivePriceOverridePinUsed = true
          } else if (source === 'offline_sync') {
            effectivePriceOverridePinUsed = false
          }
        } else {
          effectivePriceOverridePinUsed = false
        }

        let effectiveUnitPrice = item.unitPrice
        let effectiveLineTotal = item.lineTotal

        if (!effectivePriceOverride) {
          const expectedSysPrice = resolvedPrice.price
          if (effectiveUnitPrice !== expectedSysPrice) {
            if (source === 'pos') {
              throw new ApiError(
                'VALIDATION_ERROR',
                'Đơn giá không khớp giá hệ thống, vui lòng tải lại giỏ hàng',
                {
                  productId: item.productId,
                  clientPrice: item.unitPrice,
                  serverPrice: expectedSysPrice,
                },
              )
            } else {
              effectiveUnitPrice = expectedSysPrice
              const lineRes = calculateLineTotal({
                unitPrice: effectiveUnitPrice,
                quantity: item.quantity,
                discountType: item.discountType,
                discountValue: item.discountValue,
              })
              effectiveLineTotal = lineRes.lineTotal
              isPriceMismatchAdjusted = true
            }
          }
        }

        adjustedSubtotal += effectiveLineTotal

        // Insert order_item
        const [insertedItem] = await tx
          .insert(orderItems)
          .values({
            orderId: createdId,
            productId: item.productId,
            variantId: item.variantId ?? null,
            productName: item.productName,
            variantName: item.variantName ?? null,
            unit: item.unit ?? null,
            unitPrice: effectiveUnitPrice,
            quantity: item.quantity,
            discountType: item.discountType ?? null,
            discountValue: item.discountValue,
            discountAmount: item.discountAmount,
            lineTotal: effectiveLineTotal,
            note: item.note ?? null,
            originalPrice: item.originalPrice ?? null,
            priceOverride: effectivePriceOverride,
            priceOverrideReason: item.priceOverrideReason ?? null,
            priceOverridePinUsed: effectivePriceOverridePinUsed,
          })
          .returning({ id: orderItems.id })

        if (effectivePriceOverride) {
          await logAction({
            db: txDb,
            storeId: actor.storeId,
            actorId: actor.userId,
            actorRole: actor.role,
            action: 'order_item.price_overridden',
            targetType: 'order_item',
            targetId: createdId,
            changes: {
              orderId: createdId,
              productId: item.productId,
              variantId: item.variantId ?? null,
              originalPrice: item.originalPrice ?? null,
              unitPrice: effectiveUnitPrice,
              reason: item.priceOverrideReason ?? null,
              pinUsed: effectivePriceOverridePinUsed,
            },
            ipAddress: meta?.ipAddress,
            userAgent: meta?.userAgent,
          })

          // audit.price_override: warn when selling below cost
          if (product.costPrice != null && effectiveUnitPrice < product.costPrice) {
            emitEvent(db, {
              storeId: actor.storeId,
              type: 'audit.price_override',
              severity: 'warn',
              title: `Bán dưới giá vốn: ${item.productName}`,
              body: `Sản phẩm ${item.productName} được bán ${effectiveUnitPrice.toLocaleString('vi-VN')}đ, thấp hơn giá vốn ${product.costPrice.toLocaleString('vi-VN')}đ`,
              context: {
                orderId: createdId,
                productName: item.productName,
                originalPrice: item.originalPrice ?? null,
                newPrice: effectiveUnitPrice,
                costPrice: product.costPrice,
                userId: actor.userId,
              },
            })
          }
        }

        processedItems.push({
          id: insertedItem!.id,
          productId: item.productId,
          variantId: item.variantId ?? null,
          productName: item.productName,
          variantName: item.variantName ?? null,
          unit: item.unit ?? null,
          unitPrice: effectiveUnitPrice,
          quantity: item.quantity,
          discountType: item.discountType ?? null,
          discountValue: item.discountValue,
          discountAmount: item.discountAmount,
          lineTotal: effectiveLineTotal,
          originalPrice: item.originalPrice ?? null,
          priceOverride: effectivePriceOverride,
          sku: itemSku,
          costPrice: itemCostPrice,
        })

        // Stock deduction
        if (product.trackInventory) {
          let deductQty = item.quantity

          // M26: Unit conversion: multiply by conversionFactor
          if (conv) {
            deductQty = item.quantity * conv.conversionFactor
          }

          let newStock: number

          if (item.variantId) {
            const v =
              variant ??
              (await loadVariantForUpdate({
                tx: txDb,
                productId: item.productId,
                variantId: item.variantId,
              }))
            newStock = v.stockQuantity - deductQty
            await tx
              .update(productVariants)
              .set({ stockQuantity: newStock })
              .where(eq(productVariants.id, item.variantId))

            // Aggregate variant stock to product level
            const aggStock = await aggregateVariantStock({ tx: txDb, productId: item.productId })
            await tx
              .update(products)
              .set({ currentStock: aggStock })
              .where(eq(products.id, item.productId))
          } else {
            // Use relative update to avoid race condition when same product
            // appears in multiple line items
            await tx
              .update(products)
              .set({ currentStock: sql`${products.currentStock} - ${deductQty}` })
              .where(eq(products.id, item.productId))

            // Re-read current stock for inventory transaction record
            const [updated] = await tx
              .select({ currentStock: products.currentStock })
              .from(products)
              .where(eq(products.id, item.productId))
              .limit(1)
            newStock = updated?.currentStock ?? product.currentStock - deductQty
          }

          // Insert inventory transaction
          const inventoryNote =
            source === 'offline_sync' ? `${orderNumber} (offline sync)` : orderNumber

          await tx.insert(inventoryTransactions).values({
            storeId: actor.storeId,
            productId: item.productId,
            variantId: item.variantId ?? null,
            type: 'sale',
            quantity: -deductQty,
            stockAfter: newStock,
            note: inventoryNote,
            createdBy: actor.userId,
          })

          // stock.negative: emit when stock goes below 0
          if (newStock < 0) {
            emitEvent(db, {
              storeId: actor.storeId,
              type: 'stock.negative',
              severity: 'error',
              title: `Tồn kho âm: ${item.productName}`,
              body: `Tồn kho ${item.productName} bị âm (${newStock}) sau ${source === 'offline_sync' ? 'đồng bộ đơn offline' : 'bán hàng'}. Cần nhập thêm hoặc kiểm kho.`,
              context: {
                productId: item.productId,
                productName: item.productName,
                currentStock: newStock,
                previousStock: newStock + deductQty,
              },
            })
          }
        }
      }

      if (isPriceMismatchAdjusted) {
        const newTotal = Math.max(0, adjustedSubtotal - input.discountAmount)

        let newChange = 0
        if (input.paymentMethod === 'cash' && input.cashAmount != null) {
          newChange = input.cashAmount - newTotal
        } else if (input.paymentMethod === 'combined') {
          const cashPart = input.cashAmount ?? 0
          const transferPart = input.transferAmount ?? 0
          newChange = cashPart + transferPart - newTotal
        } else if (input.paymentMethod === 'debt' && input.cashAmount != null) {
          newChange = input.cashAmount - (newTotal - debtAmount)
        }
        newChange = Math.max(0, newChange)

        await tx
          .update(orders)
          .set({
            subtotal: adjustedSubtotal,
            total: newTotal,
            change: newChange,
          })
          .where(eq(orders.id, createdId))

        await logAction({
          db: txDb,
          storeId: actor.storeId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'order.price_mismatch_adjusted',
          targetType: 'order',
          targetId: createdId,
          changes: {
            orderId: createdId,
            orderNumber,
            oldSubtotal: input.subtotal,
            newSubtotal: adjustedSubtotal,
            oldTotal: input.total,
            newTotal,
          },
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
        })

        emitEvent(db, {
          storeId: actor.storeId,
          type: 'order.price_mismatch_adjusted',
          severity: 'warn',
          title: `Đơn ngoại tuyến điều chỉnh giá: ${orderNumber}`,
          body: `Đơn ${orderNumber} có sai lệch giá so với hệ thống. Tự động điều chỉnh tổng đơn từ ${formatVnd(input.total)} thành ${formatVnd(newTotal)}.`,
          context: {
            orderId: createdId,
            orderNumber,
            oldTotal: input.total,
            newTotal,
          },
        })

        // Dùng biến cục bộ lưu tổng kết quả thay vì gán vào input.* (tránh lỗi retry)
        // Mình sẽ truyền adjustedSubtotal ra ngoài qua một cơ chế hoặc biến đã định nghĩa
        change = newChange
        if (input.paymentMethod === 'debt') {
          debtAmount = Math.max(0, newTotal - (input.cashAmount ?? 0) - (input.transferAmount ?? 0))
        }
      }

      let oldDebt: number | null = null
      let customerCurrentDebt: number | null = null
      let isDebtLimitExceeded = false

      // Debt creation
      if (debtAmount > 0) {
        // Defense in depth: Zod refine đã enforce, vẫn check lại
        if (!input.customerId) {
          throw new ApiError('VALIDATION_ERROR', 'Phải chọn khách hàng khi ghi nợ')
        }

        // SF-2: LEFT JOIN customer_groups trong cùng query lock customer
        // FOR UPDATE OF customers chỉ lock customer row, đọc group debtLimit cùng snapshot
        const customerRows = await tx
          .select({
            currentDebt: customers.currentDebt,
            debtLimit: customers.debtLimit,
            groupId: customers.groupId,
            name: customers.name,
            groupDebtLimit: customerGroups.debtLimit,
          })
          .from(customers)
          .leftJoin(customerGroups, eq(customers.groupId, customerGroups.id))
          .where(
            and(
              eq(customers.id, input.customerId),
              eq(customers.storeId, actor.storeId),
              isNull(customers.deletedAt),
            ),
          )
          .for('update', { of: [customers] })
          .limit(1)

        const customer = customerRows[0]
        if (!customer) {
          throw new ApiError('NOT_FOUND', 'Không tìm thấy khách hàng')
        }

        // Resolve effective debt limit: customer.debtLimit ?? group.debtLimit ?? null
        const effectiveDebtLimit: number | null =
          customer.debtLimit !== null ? customer.debtLimit : (customer.groupDebtLimit ?? null)

        const debtBefore = customer.currentDebt
        const debtAfter = debtBefore + debtAmount
        oldDebt = debtBefore
        customerCurrentDebt = debtAfter

        // Check limit nếu không có skipDebtLimitCheck: null hoặc 0 = không giới hạn
        if (!skipDebtLimitCheck) {
          if (
            effectiveDebtLimit !== null &&
            effectiveDebtLimit > 0 &&
            debtAfter > effectiveDebtLimit
          ) {
            if (input.debtLimitOverridden) {
              // Override bằng PIN: ghi audit riêng (áp dụng cho POS hoặc offline sync khi có PIN)
              // SF-3: lưu PIN actor (user đã nhập PIN để override)
              await logAction({
                db: txDb,
                storeId: actor.storeId,
                actorId: actor.userId,
                actorRole: actor.role,
                action: 'debt.limit_overridden',
                targetType: 'customer',
                targetId: input.customerId,
                changes: {
                  customerId: input.customerId,
                  customerName: customer.name,
                  orderId: createdId,
                  amount: debtAmount,
                  debtBefore,
                  debtAfter,
                  debtLimit: effectiveDebtLimit,
                  overrideBy: actor.userId,
                  overrideByRole: actor.role,
                  pinVerified: true,
                  source,
                },
                ipAddress: meta?.ipAddress,
                userAgent: meta?.userAgent,
              })
            } else if (source === 'pos') {
              // POS trực tiếp mà không có PIN override: BỊ TỪ CHỐI
              const maxAdditional = Math.max(0, effectiveDebtLimit - debtBefore)
              throw new ApiError(
                'BUSINESS_RULE_VIOLATION',
                `Vượt hạn mức công nợ. Nợ hiện tại: ${formatVnd(debtBefore)}. Hạn mức: ${formatVnd(effectiveDebtLimit)}. Nợ thêm tối đa: ${formatVnd(maxAdditional)}`,
                {
                  currentDebt: debtBefore,
                  debtLimit: effectiveDebtLimit,
                  maxAdditional,
                },
              )
            } else if (source === 'offline_sync') {
              // Đơn ngoại tuyến vượt hạn mức nợ KHÔNG có PIN: KHÔNG từ chối, đánh dấu đơn là vượt hạn mức
              isDebtLimitExceeded = true

              await tx
                .update(orders)
                .set({ debtLimitExceeded: true })
                .where(eq(orders.id, createdId))

              await logAction({
                db: txDb,
                storeId: actor.storeId,
                actorId: actor.userId,
                actorRole: actor.role,
                action: 'order.debt_limit_exceeded',
                targetType: 'order',
                targetId: createdId,
                changes: {
                  orderId: createdId,
                  orderNumber,
                  customerId: input.customerId,
                  customerName: customer.name,
                  debtLimit: effectiveDebtLimit,
                  debtBefore,
                  debtAfter,
                  exceededAmount: debtAfter - effectiveDebtLimit,
                  debtAmount,
                  sellerId: actor.userId,
                  sellerRole: actor.role,
                  source,
                  offlineCreatedAt:
                    offlineCreatedAt ??
                    ('createdAt' in input &&
                    typeof (input as { createdAt?: string }).createdAt === 'string'
                      ? (input as { createdAt?: string }).createdAt
                      : undefined),
                },
                ipAddress: meta?.ipAddress,
                userAgent: meta?.userAgent,
              })

              emitEvent(db, {
                storeId: actor.storeId,
                type: 'order.debt_limit_exceeded',
                severity: 'warn',
                title: `Đơn ngoại tuyến vượt hạn mức nợ: ${orderNumber}`,
                body: `Khách hàng ${customer.name} vượt hạn mức nợ ${formatVnd(debtAfter - effectiveDebtLimit)} (nợ sau đơn: ${formatVnd(debtAfter)}, hạn mức: ${formatVnd(effectiveDebtLimit)}) từ đơn ngoại tuyến ${orderNumber}`,
                context: {
                  orderId: createdId,
                  orderNumber,
                  customerId: input.customerId,
                  customerName: customer.name,
                  debtLimit: effectiveDebtLimit,
                  debtBefore,
                  debtAfter,
                  exceededAmount: debtAfter - effectiveDebtLimit,
                  userId: actor.userId,
                  sellerId: actor.userId,
                  source,
                },
              })
            }
          }
        }

        // Insert debt record
        await tx.insert(debts).values({
          storeId: actor.storeId,
          orderId: createdId,
          customerId: input.customerId,
          amount: debtAmount,
          paid: 0,
          remaining: debtAmount,
        })

        // Update customer current_debt atomically
        await tx
          .update(customers)
          .set({ currentDebt: sql`${customers.currentDebt} + ${debtAmount}` })
          .where(eq(customers.id, input.customerId))

        // Audit debt.created
        await logAction({
          db: txDb,
          storeId: actor.storeId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'debt.created',
          targetType: 'order',
          targetId: createdId,
          changes: {
            orderId: createdId,
            customerId: input.customerId,
            customerName: customer.name,
            amount: debtAmount,
            debtBefore,
            debtAfter,
            source,
          },
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
        })

        logger.info(
          {
            storeId: actor.storeId,
            orderId: createdId,
            customerId: input.customerId,
            debtAmount,
            debtBefore,
            debtAfter,
            source,
          },
          'debt.created',
        )
      } else if (input.customerId) {
        const customerRows = await tx
          .select({ currentDebt: customers.currentDebt })
          .from(customers)
          .where(
            and(
              eq(customers.id, input.customerId),
              eq(customers.storeId, actor.storeId),
              isNull(customers.deletedAt),
            ),
          )
          .limit(1)
        oldDebt = customerRows[0]?.currentDebt != null ? Number(customerRows[0].currentDebt) : 0
        customerCurrentDebt = oldDebt
      }

      // Audit log
      await logAction({
        db: txDb,
        storeId: actor.storeId,
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'order.created',
        targetType: 'order',
        targetId: createdId,
        changes: {
          orderNumber,
          itemCount: input.items.length,
          subtotal: input.subtotal,
          discountAmount: input.discountAmount,
          total: input.total,
          paymentMethod: input.paymentMethod,
          paymentStatus: input.paymentStatus,
          source,
          clientId,
        },
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      })

      logger.info(
        {
          storeId: actor.storeId,
          actorId: actor.userId,
          orderId: createdId,
          orderNumber,
          itemCount: input.items.length,
          total: input.total,
          paymentMethod: input.paymentMethod,
          source,
          clientId,
        },
        'order.created',
      )

      // order.high_value: notify when total exceeds threshold
      if (input.total > env.highValueOrderThreshold) {
        emitEvent(db, {
          storeId: actor.storeId,
          type: 'order.high_value',
          severity: 'info',
          title: `Đơn hàng giá trị cao: ${orderNumber}`,
          body: `Đơn hàng ${orderNumber} có tổng ${input.total.toLocaleString('vi-VN')}đ vượt ngưỡng ${env.highValueOrderThreshold.toLocaleString('vi-VN')}đ`,
          context: {
            orderId: createdId,
            total: input.total,
            customerId: input.customerId ?? null,
          },
        })
      }

      return {
        id: createdId,
        orderNumber,
        customerId: input.customerId ?? null,
        subtotal: isPriceMismatchAdjusted ? adjustedSubtotal : input.subtotal,
        discountAmount: input.discountAmount,
        total: isPriceMismatchAdjusted
          ? Math.max(0, adjustedSubtotal - input.discountAmount)
          : input.total,
        paymentMethod: input.paymentMethod,
        paymentStatus: input.paymentStatus,
        cashAmount: input.cashAmount ?? null,
        transferAmount: input.transferAmount ?? null,
        debtAmount,
        change,
        note: input.note ?? null,
        status: 'completed',
        items: processedItems,
        createdAt: new Date().toISOString(),
        oldDebt,
        customerCurrentDebt,
        debtLimitExceeded: isDebtLimitExceeded,
      } satisfies OrderDetail
    })

    return result
  } catch (err) {
    // CRIT C1: hai request song song cùng clientId (client retry khi request đầu
    // chưa commit) — unique (storeId, clientId) chặn tạo đôi, transaction đã
    // rollback nên KHÔNG trừ kho/ghi nợ lần 2. Trả về đơn đã tồn tại.
    if (isUniqueViolation(err, 'uniq_orders_store_client') && clientId) {
      const [dup] = await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          customerId: orders.customerId,
          subtotal: orders.subtotal,
          discountAmount: orders.discountAmount,
          total: orders.total,
          paymentMethod: orders.paymentMethod,
          paymentStatus: orders.paymentStatus,
          cashAmount: orders.cashAmount,
          transferAmount: orders.transferAmount,
          change: orders.change,
          note: orders.note,
          status: orders.status,
          debtLimitExceeded: orders.debtLimitExceeded,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .where(and(eq(orders.storeId, actor.storeId), eq(orders.clientId, clientId)))
        .limit(1)

      if (dup) {
        return {
          id: dup.id,
          orderNumber: dup.orderNumber,
          customerId: dup.customerId,
          subtotal: dup.subtotal,
          discountAmount: dup.discountAmount,
          total: dup.total,
          paymentMethod: dup.paymentMethod,
          paymentStatus: dup.paymentStatus,
          cashAmount: dup.cashAmount,
          transferAmount: dup.transferAmount,
          debtAmount: input.debtAmount ?? 0,
          change: dup.change,
          note: dup.note,
          status: dup.status,
          items: [],
          createdAt: dup.createdAt.toISOString(),
          isDuplicate: true,
          debtLimitExceeded: Boolean(dup.debtLimitExceeded),
        }
      }
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// Story 5.1: getCustomerDebtInfo
// ---------------------------------------------------------------------------

export interface CustomerDebtInfo {
  customerId: string
  customerName: string
  groupId: string | null
  groupName: string | null
  currentDebt: number
  customerDebtLimit: number | null
  groupDebtLimit: number | null
  effectiveDebtLimit: number | null
}

export interface GetCustomerDebtInfoDeps {
  db: Db
  storeId: string
  customerId: string
}

export async function getCustomerDebtInfo({
  db,
  storeId,
  customerId,
}: GetCustomerDebtInfoDeps): Promise<CustomerDebtInfo> {
  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      currentDebt: customers.currentDebt,
      customerDebtLimit: customers.debtLimit,
      groupId: customers.groupId,
      groupName: customerGroups.name,
      groupDebtLimit: customerGroups.debtLimit,
    })
    .from(customers)
    .leftJoin(customerGroups, eq(customers.groupId, customerGroups.id))
    .where(
      and(
        eq(customers.id, customerId),
        eq(customers.storeId, storeId),
        isNull(customers.deletedAt),
      ),
    )
    .limit(1)

  const row = rows[0]
  if (!row) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy khách hàng')
  }

  // Effective debt limit: customer ?? group ?? null
  const effectiveDebtLimit =
    row.customerDebtLimit !== null ? row.customerDebtLimit : (row.groupDebtLimit ?? null)

  return {
    customerId: row.id,
    customerName: row.name,
    groupId: row.groupId,
    groupName: row.groupName ?? null,
    currentDebt: row.currentDebt,
    customerDebtLimit: row.customerDebtLimit,
    groupDebtLimit: row.groupDebtLimit ?? null,
    effectiveDebtLimit,
  }
}

// ---------------------------------------------------------------------------
// getStockInfo
// ---------------------------------------------------------------------------

export interface GetStockInfoDeps {
  db: Db
  storeId: string
  productId: string
}

export async function getStockInfo({
  db,
  storeId,
  productId,
}: GetStockInfoDeps): Promise<StockInfo> {
  const productRows = await db
    .select({
      id: products.id,
      name: products.name,
      currentStock: products.currentStock,
      minStock: products.minStock,
      trackInventory: products.trackInventory,
      unit: products.unit,
      hasVariants: products.hasVariants,
    })
    .from(products)
    .where(
      and(eq(products.id, productId), eq(products.storeId, storeId), isNull(products.deletedAt)),
    )
    .limit(1)

  const product = productRows[0]
  if (!product) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy sản phẩm')
  }

  let variants: StockInfoVariant[] = []
  if (product.hasVariants) {
    const variantRows = await db
      .select({
        id: productVariants.id,
        attribute1Value: productVariants.attribute1Value,
        attribute2Value: productVariants.attribute2Value,
        stockQuantity: productVariants.stockQuantity,
      })
      .from(productVariants)
      .where(and(eq(productVariants.productId, productId), isNull(productVariants.deletedAt)))

    variants = variantRows.map((v) => ({
      id: v.id,
      name: v.attribute2Value ? `${v.attribute1Value} - ${v.attribute2Value}` : v.attribute1Value,
      stockQuantity: v.stockQuantity,
    }))
  }

  return {
    productId: product.id,
    productName: product.name,
    currentStock: product.currentStock,
    minStock: product.minStock,
    trackInventory: product.trackInventory,
    unit: product.unit,
    variants,
  }
}

// ---------------------------------------------------------------------------
// Story 7-1: listOrders
// ---------------------------------------------------------------------------

export interface OrderListItem {
  id: string
  orderNumber: string
  customerId: string | null
  customerName: string | null
  customerPhone: string | null
  createdByName: string | null
  subtotal: number
  discountAmount: number
  total: number
  paymentMethod: string
  paymentStatus: string
  cashAmount: number | null
  transferAmount: number | null
  paidAmount: number
  debtAmount: number
  status: string
  debtLimitExceeded: boolean
  note: string | null
  createdAt: string
}

export interface ListOrdersDeps {
  db: Db
  storeId: string
  query: ListOrdersQuery
}

export interface ListOrdersResult {
  data: OrderListItem[]
  meta: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export async function listOrders({
  db,
  storeId,
  query,
}: ListOrdersDeps): Promise<ListOrdersResult> {
  const {
    page,
    pageSize,
    search,
    fromDate,
    toDate,
    status,
    customerId,
    paymentMethod,
    paymentStatus,
  } = query
  const conditions: SQL[] = [eq(orders.storeId, storeId)]

  const trimmedSearch = search?.trim()
  if (trimmedSearch) {
    const escaped = escapeLikePattern(trimmedSearch)
    const pattern = `%${escaped}%`
    conditions.push(ilike(orders.orderNumber, pattern))
  }

  if (status) {
    conditions.push(eq(orders.status, status))
  }
  if (customerId) {
    conditions.push(eq(orders.customerId, customerId))
  }
  if (paymentMethod) {
    conditions.push(eq(orders.paymentMethod, paymentMethod))
  }
  if (paymentStatus) {
    conditions.push(eq(orders.paymentStatus, paymentStatus))
  }
  if (fromDate) {
    conditions.push(gte(orders.createdAt, new Date(fromDate)))
  }
  if (toDate) {
    const endOfDay = new Date(toDate)
    endOfDay.setHours(23, 59, 59, 999)
    conditions.push(lte(orders.createdAt, endOfDay))
  }

  const whereClause = and(...conditions)
  const offset = (page - 1) * pageSize

  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      customerId: orders.customerId,
      customerName: customers.name,
      customerPhone: customers.phone,
      createdByName: users.name,
      subtotal: orders.subtotal,
      discountAmount: orders.discountAmount,
      total: orders.total,
      paymentMethod: orders.paymentMethod,
      paymentStatus: orders.paymentStatus,
      cashAmount: orders.cashAmount,
      transferAmount: orders.transferAmount,
      status: orders.status,
      debtLimitExceeded: orders.debtLimitExceeded,
      note: orders.note,
      createdAt: orders.createdAt,
      debtRemaining: debts.remaining,
    })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .leftJoin(users, eq(orders.userId, users.id))
    .leftJoin(debts, eq(debts.orderId, orders.id))
    .where(whereClause)
    .orderBy(desc(orders.createdAt))
    .limit(pageSize)
    .offset(offset)

  const totalRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .where(whereClause)

  const total = totalRows[0]?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const data: OrderListItem[] = rows.map((r) => {
    const totalAmount = Number(r.total)
    // CRIT-3: Lấy debtAmount từ debts.remaining (source of truth)
    const debtAmount = r.debtRemaining != null ? Number(r.debtRemaining) : 0
    const paidAmount = totalAmount - debtAmount

    return {
      id: r.id,
      orderNumber: r.orderNumber,
      customerId: r.customerId,
      customerName: r.customerName ?? null,
      customerPhone: r.customerPhone ?? null,
      createdByName: r.createdByName ?? null,
      subtotal: Number(r.subtotal),
      discountAmount: Number(r.discountAmount),
      total: totalAmount,
      paymentMethod: r.paymentMethod,
      paymentStatus: r.paymentStatus,
      cashAmount: r.cashAmount != null ? Number(r.cashAmount) : null,
      transferAmount: r.transferAmount != null ? Number(r.transferAmount) : null,
      paidAmount,
      debtAmount,
      status: r.status,
      debtLimitExceeded: Boolean(r.debtLimitExceeded),
      note: r.note ?? null,
      createdAt: r.createdAt.toISOString(),
    }
  })

  return { data, meta: { page, pageSize, total, totalPages } }
}

// ---------------------------------------------------------------------------
// Story 7-1: getOrderDetail
// ---------------------------------------------------------------------------

export interface OrderDetailFull {
  id: string
  orderNumber: string
  customerId: string | null
  customerName: string | null
  customerPhone: string | null
  customerGroupName: string | null
  customerCurrentDebt?: number | null
  oldDebt?: number | null
  createdByName: string | null
  subtotal: number
  discountType: string | null
  discountValue: number
  discountAmount: number
  total: number
  paymentMethod: string
  paymentStatus: string
  cashAmount: number | null
  transferAmount: number | null
  change: number
  paidAmount: number
  debtAmount: number
  note: string | null
  status: string
  debtLimitExceeded: boolean
  items: OrderDetailItem[]
  createdAt: string
  updatedAt: string
}

export interface GetOrderDetailDeps {
  db: Db
  storeId: string
  orderId: string
}

export async function getOrderDetail({
  db,
  storeId,
  orderId,
}: GetOrderDetailDeps): Promise<OrderDetailFull> {
  const orderRows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      customerId: orders.customerId,
      customerName: customers.name,
      customerPhone: customers.phone,
      customerGroupName: customerGroups.name,
      customerCurrentDebt: customers.currentDebt,
      createdByName: users.name,
      subtotal: orders.subtotal,
      discountType: orders.discountType,
      discountValue: orders.discountValue,
      discountAmount: orders.discountAmount,
      total: orders.total,
      paymentMethod: orders.paymentMethod,
      paymentStatus: orders.paymentStatus,
      cashAmount: orders.cashAmount,
      transferAmount: orders.transferAmount,
      change: orders.change,
      note: orders.note,
      status: orders.status,
      debtLimitExceeded: orders.debtLimitExceeded,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      debtRemaining: debts.remaining,
    })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .leftJoin(customerGroups, eq(customers.groupId, customerGroups.id))
    .leftJoin(users, eq(orders.userId, users.id))
    .leftJoin(debts, eq(debts.orderId, orders.id))
    .where(and(eq(orders.id, orderId), eq(orders.storeId, storeId)))
    .limit(1)

  const row = orderRows[0]
  if (!row) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy đơn hàng')
  }

  const itemRows = await db
    .select({
      id: orderItems.id,
      productId: orderItems.productId,
      variantId: orderItems.variantId,
      productName: orderItems.productName,
      variantName: orderItems.variantName,
      unit: orderItems.unit,
      unitPrice: orderItems.unitPrice,
      quantity: orderItems.quantity,
      discountType: orderItems.discountType,
      discountValue: orderItems.discountValue,
      discountAmount: orderItems.discountAmount,
      lineTotal: orderItems.lineTotal,
      originalPrice: orderItems.originalPrice,
      priceOverride: orderItems.priceOverride,
      sku: sql<string | null>`COALESCE(${productVariants.sku}, ${products.sku})`.as('sku'),
      costPrice: sql<
        number | null
      >`COALESCE(${productVariants.costPrice}, ${products.costPrice})`.as('cost_price'),
    })
    .from(orderItems)
    .leftJoin(products, eq(orderItems.productId, products.id))
    .leftJoin(productVariants, eq(orderItems.variantId, productVariants.id))
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.createdAt))

  const items: OrderDetailItem[] = itemRows.map((it) => ({
    id: it.id,
    productId: it.productId,
    variantId: it.variantId ?? null,
    productName: it.productName,
    variantName: it.variantName ?? null,
    unit: it.unit ?? null,
    unitPrice: Number(it.unitPrice),
    quantity: Number(it.quantity),
    discountType: it.discountType ?? null,
    discountValue: Number(it.discountValue),
    discountAmount: Number(it.discountAmount),
    lineTotal: Number(it.lineTotal),
    originalPrice: it.originalPrice != null ? Number(it.originalPrice) : null,
    priceOverride: it.priceOverride,
    sku: it.sku ?? null,
    costPrice: it.costPrice != null ? Number(it.costPrice) : null,
  }))

  const totalAmount = Number(row.total)
  // CRIT-3: Lấy debtAmount từ debts.remaining (source of truth)
  const debtAmount = row.debtRemaining != null ? Number(row.debtRemaining) : 0
  const paidAmount = totalAmount - debtAmount
  const currentDebt = row.customerCurrentDebt != null ? Number(row.customerCurrentDebt) : null
  const oldDebt = currentDebt != null ? Math.max(0, currentDebt - debtAmount) : null

  return {
    id: row.id,
    orderNumber: row.orderNumber,
    customerId: row.customerId,
    customerName: row.customerName ?? null,
    customerPhone: row.customerPhone ?? null,
    customerGroupName: row.customerGroupName ?? null,
    customerCurrentDebt: currentDebt,
    oldDebt,
    createdByName: row.createdByName ?? null,
    subtotal: Number(row.subtotal),
    discountType: row.discountType ?? null,
    discountValue: Number(row.discountValue),
    discountAmount: Number(row.discountAmount),
    total: totalAmount,
    paymentMethod: row.paymentMethod,
    paymentStatus: row.paymentStatus,
    cashAmount: row.cashAmount != null ? Number(row.cashAmount) : null,
    transferAmount: row.transferAmount != null ? Number(row.transferAmount) : null,
    change: Number(row.change),
    paidAmount,
    debtAmount,
    note: row.note ?? null,
    status: row.status,
    debtLimitExceeded: Boolean(row.debtLimitExceeded),
    items,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

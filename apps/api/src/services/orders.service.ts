import { and, eq, isNull, like, sql } from 'drizzle-orm'

import {
  type CreateOrderInput,
  inventoryTransactions,
  orderItems,
  orders,
  products,
  productUnitConversions,
  productVariants,
  type UserRole,
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrdersActor {
  userId: string
  storeId: string
  role: UserRole
}

export interface OrderDetailItem {
  productId: string
  variantId: string | null
  productName: string
  variantName: string | null
  unit: string | null
  unitPrice: number
  quantity: number
  discountAmount: number
  lineTotal: number
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
  change: number
  note: string | null
  status: string
  items: OrderDetailItem[]
  createdAt: string
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
}

export async function createOrder({
  db,
  actor,
  input,
  meta,
}: CreateOrderDeps): Promise<OrderDetail> {
  if (input.items.length === 0) {
    throw new ApiError('VALIDATION_ERROR', 'Đơn hàng phải có ít nhất 1 sản phẩm')
  }

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
    const processedItems: OrderDetailItem[] = []

    for (const item of input.items) {
      const product = await loadProductForUpdate({
        tx: txDb,
        storeId: actor.storeId,
        productId: item.productId,
      })

      // Insert order_item
      await tx.insert(orderItems).values({
        orderId: createdId,
        productId: item.productId,
        variantId: item.variantId ?? null,
        productName: item.productName,
        variantName: item.variantName ?? null,
        unit: item.unit ?? null,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        discountType: item.discountType ?? null,
        discountValue: item.discountValue,
        discountAmount: item.discountAmount,
        lineTotal: item.lineTotal,
        note: item.note ?? null,
        originalPrice: item.originalPrice ?? null,
        priceOverride: item.priceOverride,
        priceOverrideReason: item.priceOverrideReason ?? null,
        priceOverridePinUsed: item.priceOverridePinUsed,
      })

      if (item.priceOverride) {
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
            unitPrice: item.unitPrice,
            reason: item.priceOverrideReason ?? null,
            pinUsed: item.priceOverridePinUsed,
          },
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
        })
      }

      processedItems.push({
        productId: item.productId,
        variantId: item.variantId ?? null,
        productName: item.productName,
        variantName: item.variantName ?? null,
        unit: item.unit ?? null,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        discountAmount: item.discountAmount,
        lineTotal: item.lineTotal,
      })

      // Stock deduction
      if (product.trackInventory) {
        let deductQty = item.quantity

        // Unit conversion: multiply by conversionFactor
        if (item.unitConversionId) {
          const convRows = await tx
            .select({ conversionFactor: productUnitConversions.conversionFactor })
            .from(productUnitConversions)
            .where(eq(productUnitConversions.id, item.unitConversionId))
            .limit(1)
          const conv = convRows[0]
          if (conv) {
            deductQty = item.quantity * conv.conversionFactor
          } else {
            logger.warn(
              {
                storeId: actor.storeId,
                productId: item.productId,
                unitConversionId: item.unitConversionId,
              },
              'order.unit_conversion_not_found: falling back to raw quantity',
            )
          }
        }

        let newStock: number

        if (item.variantId) {
          const variant = await loadVariantForUpdate({
            tx: txDb,
            productId: item.productId,
            variantId: item.variantId,
          })
          newStock = variant.stockQuantity - deductQty
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
        await tx.insert(inventoryTransactions).values({
          storeId: actor.storeId,
          productId: item.productId,
          variantId: item.variantId ?? null,
          type: 'sale',
          quantity: -deductQty,
          stockAfter: newStock,
          note: orderNumber,
          createdBy: actor.userId,
        })
      }
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
      },
      'order.created',
    )

    // Calculate change amount
    let change = 0
    if (input.paymentMethod === 'cash' && input.cashAmount != null) {
      change = input.cashAmount - input.total
    } else if (input.paymentMethod === 'combined') {
      const cashPart = input.cashAmount ?? 0
      const transferPart = input.transferAmount ?? 0
      change = cashPart + transferPart - input.total
    }

    return {
      id: createdId,
      orderNumber,
      customerId: input.customerId ?? null,
      subtotal: input.subtotal,
      discountAmount: input.discountAmount,
      total: input.total,
      paymentMethod: input.paymentMethod,
      paymentStatus: input.paymentStatus,
      cashAmount: input.cashAmount ?? null,
      transferAmount: input.transferAmount ?? null,
      change: Math.max(0, change),
      note: input.note ?? null,
      status: 'completed',
      items: processedItems,
      createdAt: new Date().toISOString(),
    } satisfies OrderDetail
  })

  return result
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

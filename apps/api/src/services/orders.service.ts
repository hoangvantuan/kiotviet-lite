import { and, asc, desc, eq, gte, ilike, isNull, like, lte, type SQL, sql } from 'drizzle-orm'

import {
  type CreateOrderInput,
  customerGroups,
  customers,
  debts,
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

function formatVnd(value: number): string {
  return `${value.toLocaleString('vi-VN')}đ`
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

  const debtAmount = input.debtAmount ?? 0

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
      const [insertedItem] = await tx
        .insert(orderItems)
        .values({
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
        .returning({ id: orderItems.id })

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

        // audit.price_override: warn when selling below cost
        if (product.costPrice != null && item.unitPrice < product.costPrice) {
          emitEvent(db, {
            storeId: actor.storeId,
            type: 'audit.price_override',
            severity: 'warn',
            title: `Bán dưới giá vốn: ${item.productName}`,
            body: `Sản phẩm ${item.productName} được bán ${item.unitPrice.toLocaleString('vi-VN')}đ, thấp hơn giá vốn ${product.costPrice.toLocaleString('vi-VN')}đ`,
            context: {
              orderId: createdId,
              productName: item.productName,
              originalPrice: item.originalPrice ?? null,
              newPrice: item.unitPrice,
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
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        discountType: item.discountType ?? null,
        discountValue: item.discountValue,
        discountAmount: item.discountAmount,
        lineTotal: item.lineTotal,
        originalPrice: item.originalPrice ?? null,
        priceOverride: item.priceOverride,
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

        // stock.negative: emit when stock goes below 0
        if (newStock < 0) {
          emitEvent(db, {
            storeId: actor.storeId,
            type: 'stock.negative',
            severity: 'error',
            title: `Tồn kho âm: ${item.productName}`,
            body: `Tồn kho ${item.productName} bị âm (${newStock}) sau bán hàng. Cần nhập thêm hoặc kiểm kho.`,
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

    // Story 5.1: Debt creation
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

      // Check limit: null hoặc 0 = không giới hạn
      if (effectiveDebtLimit !== null && effectiveDebtLimit > 0 && debtAfter > effectiveDebtLimit) {
        if (!input.debtLimitOverridden) {
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
        }

        // Override: ghi audit riêng
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
          },
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
        })
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
        },
        'debt.created',
      )
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
      subtotal: input.subtotal,
      discountAmount: input.discountAmount,
      total: input.total,
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
    } satisfies OrderDetail
  })

  return result
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
    })
    .from(orderItems)
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
  }))

  const totalAmount = Number(row.total)
  // CRIT-3: Lấy debtAmount từ debts.remaining (source of truth)
  const debtAmount = row.debtRemaining != null ? Number(row.debtRemaining) : 0
  const paidAmount = totalAmount - debtAmount

  return {
    id: row.id,
    orderNumber: row.orderNumber,
    customerId: row.customerId,
    customerName: row.customerName ?? null,
    customerPhone: row.customerPhone ?? null,
    customerGroupName: row.customerGroupName ?? null,
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
    items,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

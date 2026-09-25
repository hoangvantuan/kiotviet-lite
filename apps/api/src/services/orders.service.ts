import { and, asc, desc, eq, gte, ilike, isNull, lte, type SQL, sql } from 'drizzle-orm'

import {
  allocateOrderDiscount,
  calculateLineTotal,
  type CreateOrderInput,
  customerGroups,
  customers,
  debts,
  formatCurrencyVnd as formatVnd,
  hasPermission,
  inventoryTransactions,
  type ListOrdersQuery,
  orderItems,
  type OrderPolicyViolation,
  type OrderReviewStatus,
  orders,
  priceLists,
  type PriceSource,
  products,
  productUnitConversions,
  productVariants,
  resolveEffectiveDebtLimit,
  stores,
  type UserRole,
  users,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { toIsoDate } from '../lib/date.js'
import { env } from '../lib/env.js'
import { ApiError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'
import { isUniqueViolation } from '../lib/pg-errors.js'
import { escapeLikePattern } from '../lib/strings.js'
import { logAction, type RequestMeta } from './audit.service.js'
import { addCustomerDebt, lockCustomerForDebt } from './customer-debt-ledger.service.js'
import { nextDocumentCode } from './document-codes.service.js'
import { emitEvent } from './notification-emitter.js'
import {
  assertDiscountAmounts,
  debtLimitViolation,
  derivePayment,
  evaluatePriceApproval,
  loadLineUnitCosts,
  priceViolation,
  resolveDebtLimitApproval,
} from './order-policy.js'
import { resolveProductPrice } from './pricing.service.js'
import {
  aggregateVariantStock,
  loadProductForUpdate,
  loadVariantForUpdate,
  lockProductsInIdOrder,
} from './products-lock.helper.js'
import { serviceDb, type ServiceTransaction } from './service-transaction.js'
import { assertStoreOwned } from './store-scope.js'

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
  priceSource?: PriceSource | null
  priceSourceDetail?: string | null
  sku?: string | null
  /** Chỉ có khi người xem có quyền products.viewCost (BC-13) */
  costPrice?: number | null
  /** Máy chủ xác định dòng sửa giá hay chiết khấu xuống dưới giá vốn, thay cho con số giá vốn */
  belowCost?: boolean
}

export interface OrderDetail {
  id: string
  orderNumber: string
  customerId: string | null
  customerCode?: string | null
  customerName?: string | null
  customerPhone?: string | null
  priceListId?: string | null
  priceListName?: string | null
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
  /** ADR-0009: đơn ngoại tuyến vi phạm chính sách nằm ở 'pending_review' chờ chủ duyệt */
  reviewStatus?: OrderReviewStatus
  policyViolations?: OrderPolicyViolation[] | null
  /** Sai lệch máy chủ đã tự xử lý khi nhận đơn ngoại tuyến, trả về để máy khách hiển thị. */
  warnings?: OrderSyncWarning[]
}

export interface OrderSyncWarning {
  code: 'CUSTOMER_NOT_IN_STORE' | 'PRICE_LIST_NOT_IN_STORE'
  message: string
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
// createOrder
// ---------------------------------------------------------------------------

export interface CreateOrderDeps {
  db: Db
  // Transaction của request có Idempotency-Key: chứng từ và phản hồi lưu cùng một lần commit
  transaction?: ServiceTransaction
  actor: OrdersActor
  input: CreateOrderInput
  meta?: RequestMeta
  source?: 'pos' | 'offline_sync'
  clientId?: string | null
  offlineCreatedAt?: string
  skipDebtLimitCheck?: boolean
}

export async function createOrder({
  db: rootDb,
  transaction,
  actor,
  input: requestedInput,
  meta,
  source = 'pos',
  clientId: explicitClientId,
  offlineCreatedAt,
  skipDebtLimitCheck = false,
}: CreateOrderDeps): Promise<OrderDetail> {
  const db = serviceDb(rootDb, transaction)
  let input = requestedInput
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
        priceListId: orders.priceListId,
        priceListName: orders.priceListName,
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
        reviewStatus: orders.reviewStatus,
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
        priceListId: existing.priceListId ?? null,
        priceListName: existing.priceListName ?? null,
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
        reviewStatus: existing.reviewStatus as OrderReviewStatus,
      }
    }
  }

  // BM-02 + ADR-0002: đơn ngoại tuyến đã bán xong tại quầy, từ chối vĩnh viễn chỉ vì khách lạ sẽ kẹt đơn
  // trên thiết bị. Đơn đã trả đủ tiền: hạ khách về null như bảng giá lạ, vẫn nhận đơn và ghi sai lệch.
  // Đơn có ghi nợ thì phải từ chối: không thể ghi nợ cho khách không thuộc cửa hàng.
  let customerDiscrepancy: { requestedCustomerId: string; reason: string } | null = null
  if (source === 'offline_sync' && input.customerId) {
    const [owned] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.storeId, actor.storeId)))
      .limit(1)
    if (!owned) {
      if ((input.debtAmount ?? 0) > 0 || input.paymentMethod === 'debt') {
        throw new ApiError(
          'BUSINESS_RULE_VIOLATION',
          'Khách hàng của đơn ghi nợ không thuộc cửa hàng này nên không thể ghi nợ. Vui lòng lập lại đơn với khách của cửa hàng',
          { reason: 'customer_not_in_store' },
        )
      }
      customerDiscrepancy = {
        requestedCustomerId: input.customerId,
        reason: 'Khách hàng không tồn tại hoặc không thuộc cửa hàng trên máy chủ',
      }
      input = { ...input, customerId: null }
    }
  }

  // BM-02: mọi khóa ngoại trong payload phải thuộc cửa hàng của actor, với MỌI phương thức
  // thanh toán và cả hai nguồn (POS trực tuyến, đồng bộ ngoại tuyến). Bảng giá không nằm ở đây
  // vì đơn ngoại tuyến được phép hạ bảng giá lạ về null (ADR-0002), xử lý riêng bên dưới.
  await assertStoreOwned(db, actor.storeId, {
    customer: input.customerId,
    product: input.items.map((item) => item.productId),
    variant: input.items.map((item) => item.variantId),
  })

  // R1: lớp chính sách đơn hàng. Trạng thái thanh toán, tiền thừa, chiết khấu và quyền do máy
  // chủ tự xác định (order-policy.ts), không tin số và cờ máy khách gửi.
  const payment = derivePayment(input)
  const debtAmount = payment.debtAmount
  const change = payment.change
  // Số học chiết khấu kiểm cho cả đơn ngoại tuyến: lệch là payload bị sửa, từ chối để đơn nằm lại
  // hàng đợi đồng bộ kèm lỗi thay vì ghi một khoản giảm giá không có thật (ADR-0009)
  assertDiscountAmounts(input)

  const unitCosts = await loadLineUnitCosts(db, actor.storeId, input.items)
  const priceApproval = await evaluatePriceApproval({
    db,
    actor,
    input,
    source,
    unitCosts,
    meta,
  })
  // POS-04: vượt hạn mức cần PIN của người giữ pos.overrideDebtLimit, không phải PIN người bán
  const debtLimitApprover = await resolveDebtLimitApproval({ db, actor, input, source, meta })
  // ADR-0009: đơn ngoại tuyến vi phạm chính sách vẫn nhận (hàng đã giao) nhưng chờ chủ duyệt
  const policyViolations: OrderPolicyViolation[] = []
  const priceIssue = priceViolation(priceApproval)
  if (priceIssue) policyViolations.push(priceIssue)
  const canViewCost = hasPermission(actor.role, 'products.viewCost')

  // Validate manual price list if selected
  let snapshotPriceListName: string | null = null
  let effectivePriceListId: string | null = null
  let priceListDiscrepancy: {
    requestedPriceListId: string
    devicePriceListName: string | null
    reason: string
  } | null = null

  if (input.priceListId) {
    const [pl] = await db
      .select({
        id: priceLists.id,
        name: priceLists.name,
        isActive: priceLists.isActive,
        effectiveFrom: priceLists.effectiveFrom,
        effectiveTo: priceLists.effectiveTo,
        deletedAt: priceLists.deletedAt,
      })
      .from(priceLists)
      .where(and(eq(priceLists.id, input.priceListId), eq(priceLists.storeId, actor.storeId)))
      .limit(1)

    if (source === 'pos') {
      if (!pl || pl.deletedAt !== null) {
        throw new ApiError('VALIDATION_ERROR', 'Bảng giá không tồn tại hoặc không thuộc cửa hàng')
      }
      if (!pl.isActive) {
        throw new ApiError('VALIDATION_ERROR', 'Bảng giá đang ngừng hoạt động')
      }
      const today = toIsoDate(new Date())
      if (pl.effectiveFrom && today < pl.effectiveFrom) {
        throw new ApiError('VALIDATION_ERROR', 'Bảng giá chưa đến ngày hiệu lực')
      }
      if (pl.effectiveTo && today > pl.effectiveTo) {
        throw new ApiError('VALIDATION_ERROR', 'Bảng giá đã hết hiệu lực')
      }
      effectivePriceListId = pl.id
      snapshotPriceListName = pl.name
    } else {
      // offline_sync: persist only store-owned ID or null while preserving device name as untrusted snapshot
      if (pl && pl.deletedAt === null) {
        effectivePriceListId = pl.id
        snapshotPriceListName = pl.name
      } else {
        effectivePriceListId = null
        snapshotPriceListName = input.priceListName ?? null
        priceListDiscrepancy = {
          requestedPriceListId: input.priceListId,
          devicePriceListName: input.priceListName ?? null,
          reason: !pl
            ? 'Bảng giá không tồn tại hoặc không thuộc cửa hàng trên máy chủ'
            : 'Bảng giá đã bị xóa trên máy chủ',
        }
      }
    }
  } else if (source === 'offline_sync') {
    snapshotPriceListName = input.priceListName ?? null
  }

  const warnings: OrderSyncWarning[] = []
  if (customerDiscrepancy) {
    warnings.push({
      code: 'CUSTOMER_NOT_IN_STORE',
      message: 'Khách hàng không thuộc cửa hàng, đơn được ghi nhận là khách lẻ',
    })
  }
  if (priceListDiscrepancy) {
    warnings.push({
      code: 'PRICE_LIST_NOT_IN_STORE',
      message: 'Bảng giá không còn trên máy chủ, đơn được ghi nhận không kèm bảng giá',
    })
  }

  try {
    const result = await db.transaction(async (tx) => {
      const txDb = tx as unknown as Db

      // TIEN-103: thứ tự khóa chung customers, debts, products (customer-debt-ledger.service.ts).
      // Đơn ghi nợ khóa khách trước khi đụng tới kho, thay vì chỉ khóa lúc ghi nợ ở cuối.
      if (debtAmount > 0 && input.customerId) {
        await lockCustomerForDebt(txDb, { storeId: actor.storeId, customerId: input.customerId })
      }

      // OFF-08: mã đơn cấp từ bộ đếm theo cửa hàng, không đụng mã khi bán song song
      const orderNumber = await nextDocumentCode({
        db: txDb,
        storeId: actor.storeId,
        kind: 'order',
      })
      const [row] = await tx
        .insert(orders)
        .values({
          storeId: actor.storeId,
          orderNumber,
          customerId: input.customerId ?? null,
          userId: actor.userId,
          priceListId: effectivePriceListId,
          priceListName: snapshotPriceListName,
          subtotal: input.subtotal,
          discountType: input.discountType ?? null,
          discountValue: input.discountValue,
          discountAmount: input.discountAmount,
          total: input.total,
          paymentMethod: input.paymentMethod,
          paymentStatus: payment.paymentStatus,
          cashAmount: input.cashAmount ?? null,
          transferAmount: input.transferAmount ?? null,
          change,
          clientId,
          note: input.note ?? null,
          status: 'completed',
          // BC-08: số khách đã trả lúc bán, để in lại hóa đơn không đổi theo phát sinh sau
          paidAmountAtSale: input.total - debtAmount,
        })
        .returning({ id: orders.id })
      if (!row) {
        throw new ApiError('INTERNAL_ERROR', 'Không tạo được đơn hàng')
      }
      const createdId = row.id

      // Process items: insert order_items + deduct stock
      const processedItems: OrderDetailItem[] = []
      // Thành tiền thực ghi từng dòng, để phân bổ chiết khấu đơn sau vòng lặp (ADR-0010)
      const insertedLines: Array<{ id: string; lineTotal: number }> = []
      let isPriceMismatchAdjusted = false
      let negativeStockAlertsEnabled: boolean | undefined
      const mismatchedLines: Array<{
        productId: string
        productName: string
        quantity: number
        soldUnitPrice: number
        serverUnitPrice: number
        unitPriceDiff: number
        soldLineTotal: number
        serverLineTotal: number
        lineTotalDiff: number
        devicePriceSource: PriceSource
        serverPriceSource: PriceSource
        devicePriceSourceDetail: string | null
        serverPriceSourceDetail: string | null
      }> = []

      await lockProductsInIdOrder({
        tx: txDb,
        storeId: actor.storeId,
        productIds: input.items.map((item) => item.productId),
      })

      for (const [itemIdx, item] of input.items.entries()) {
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
          priceListId: effectivePriceListId,
          productId: item.productId,
          variantId: item.variantId ?? null,
          unitConversionId: item.unitConversionId ?? null,
          quantity: item.quantity,
          context: {
            orderDate: new Date(),
          },
        })

        const effectivePriceOverride = item.priceOverride ?? false
        // Cờ PIN do máy chủ đặt theo kết quả duyệt, không theo cờ máy khách gửi (ADR-0002)
        const effectivePriceOverridePinUsed = effectivePriceOverride && priceApproval.pinVerified
        const lineBelowCost = priceApproval.belowCostLines.has(itemIdx)
        const lineUnitCost = unitCosts[itemIdx] ?? null

        const effectiveUnitPrice = item.unitPrice
        const effectiveLineTotal = item.lineTotal

        // M16: đơn vị quy đổi không được bán 0 đ. Máy khách gửi đơn giá <= 0 cho dòng đơn vị quy đổi
        // (không phải sửa giá có chủ đích, M13) thì từ chối kèm giá máy chủ tính. Không tự sửa dòng
        // tại đây: tổng đơn, tiền thanh toán, chiết khấu và hạn mức nợ đã chốt theo tổng máy khách
        // gửi, sửa dòng mà giữ tổng là đơn 0 đ nhưng trả hàng hoàn đủ tiền dòng.
        // Không áp dụng cho đơn ngoại tuyến (#34: giữ giá đã chốt trên thiết bị và ghi đối soát).
        if (
          source !== 'offline_sync' &&
          item.unitConversionId &&
          effectiveUnitPrice <= 0 &&
          !effectivePriceOverride &&
          resolvedPrice.price > 0
        ) {
          const serverLine = calculateLineTotal({
            unitPrice: resolvedPrice.price,
            quantity: item.quantity,
            discountType: item.discountType,
            discountValue: item.discountValue,
          })
          throw new ApiError(
            'VALIDATION_ERROR',
            `${item.productName} (${item.unit ?? 'đơn vị quy đổi'}) chưa có giá trên đơn. Giá hiện hành là ${formatVnd(resolvedPrice.price)}, vui lòng cập nhật lại giỏ hàng`,
            {
              reason: 'unit_price_missing',
              itemIndex: itemIdx,
              unitPrice: resolvedPrice.price,
              lineTotal: serverLine.lineTotal,
            },
          )
        }

        const devicePriceSource: PriceSource = effectivePriceOverride
          ? 'manual_override'
          : ((item.priceSource as PriceSource | undefined) ?? 'retail_price')
        const devicePriceSourceDetail: string | null = effectivePriceOverride
          ? (item.priceOverrideReason ?? item.priceSourceDetail ?? null)
          : (item.priceSourceDetail ?? null)

        // For offline sync, persist device-saved price source provenance (normalized if override).
        // For pos, server determines it.
        const itemPriceSource: PriceSource = effectivePriceOverride
          ? 'manual_override'
          : source === 'offline_sync'
            ? devicePriceSource
            : resolvedPrice.source

        const itemPriceSourceDetail: string | null = effectivePriceOverride
          ? (item.priceOverrideReason ?? item.priceSourceDetail ?? null)
          : source === 'offline_sync'
            ? devicePriceSourceDetail
            : resolvedPrice.sourceDetail

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
              // offline_sync: giữ nguyên đơn giá và thành tiền đã chốt trên thiết bị.
              // Ghi nhận dòng lệch giá và nguồn giá hai bên để đối soát.
              const serverLineRes = calculateLineTotal({
                unitPrice: expectedSysPrice,
                quantity: item.quantity,
                discountType: item.discountType,
                discountValue: item.discountValue,
              })
              mismatchedLines.push({
                productId: item.productId,
                productName: item.productName,
                quantity: item.quantity,
                soldUnitPrice: effectiveUnitPrice,
                serverUnitPrice: expectedSysPrice,
                unitPriceDiff: expectedSysPrice - effectiveUnitPrice,
                soldLineTotal: effectiveLineTotal,
                serverLineTotal: serverLineRes.lineTotal,
                lineTotalDiff: serverLineRes.lineTotal - effectiveLineTotal,
                devicePriceSource,
                serverPriceSource: resolvedPrice.source,
                devicePriceSourceDetail,
                serverPriceSourceDetail: resolvedPrice.sourceDetail,
              })
              isPriceMismatchAdjusted = true
            }
          }
        }

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
            priceSource: itemPriceSource,
            priceSourceDetail: itemPriceSourceDetail,
            // R2: ảnh chụp hệ số quy đổi và giá vốn một đơn vị gốc, đọc sau khi đã khóa sản phẩm
            conversionFactor: conv?.conversionFactor ?? 1,
            unitCost: itemCostPrice,
          })
          .returning({ id: orderItems.id })
        insertedLines.push({ id: insertedItem!.id, lineTotal: effectiveLineTotal })

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
              belowCost: lineBelowCost,
              sellerId: actor.userId,
              sellerRole: actor.role,
              approvedBy: priceApproval.approver?.userId ?? null,
              approvedByRole: priceApproval.approver?.role ?? null,
            },
            ipAddress: meta?.ipAddress,
            userAgent: meta?.userAgent,
          })

          if (!effectivePriceOverridePinUsed && source === 'offline_sync') {
            emitEvent(rootDb, {
              storeId: actor.storeId,
              type: 'audit.price_override',
              severity: 'warn',
              title: 'Cảnh báo: Đơn ngoại tuyến sửa giá không có mã PIN',
              body: `Sản phẩm "${item.productName}" được bán với giá ${effectiveUnitPrice.toLocaleString('vi-VN')}đ (giá hệ thống: ${resolvedPrice.price.toLocaleString('vi-VN')}đ) mà chưa xác thực mã PIN.`,
              context: {
                orderId: createdId,
                orderNumber,
                productId: item.productId,
                unitPrice: effectiveUnitPrice,
                systemPrice: resolvedPrice.price,
                userId: actor.userId,
              },
            })
          }
        }

        // audit.price_override: cảnh báo chủ cửa hàng khi sửa giá hay chiết khấu xuống dưới giá vốn
        if (lineBelowCost && lineUnitCost !== null) {
          emitEvent(rootDb, {
            storeId: actor.storeId,
            type: 'audit.price_override',
            severity: 'warn',
            title: `Bán dưới giá vốn: ${item.productName}`,
            body: `Sản phẩm ${item.productName} được bán ${formatVnd(effectiveLineTotal)} cho ${item.quantity} đơn vị, thấp hơn giá vốn ${formatVnd(lineUnitCost * item.quantity)}`,
            context: {
              orderId: createdId,
              productName: item.productName,
              originalPrice: item.originalPrice ?? null,
              newPrice: effectiveUnitPrice,
              lineTotal: effectiveLineTotal,
              costPrice: lineUnitCost,
              userId: actor.userId,
              approvedBy: priceApproval.approver?.userId ?? null,
            },
          })
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
          priceSource: itemPriceSource,
          priceSourceDetail: itemPriceSourceDetail,
          sku: itemSku,
          // BC-13: chỉ người có quyền xem giá vốn nhận con số; người khác chỉ nhận cờ.
          // Giá vốn MỘT đơn vị bán (đã nhân hệ số quy đổi), như chi tiết đơn.
          ...(canViewCost
            ? {
                costPrice:
                  itemCostPrice !== null ? itemCostPrice * (conv?.conversionFactor ?? 1) : null,
              }
            : {}),
          belowCost: lineBelowCost,
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

          // Chỉ đọc thiết lập khi cần cảnh báo; phần ghi sổ kho ở trên luôn chạy.
          if (newStock < 0) {
            if (negativeStockAlertsEnabled === undefined) {
              const setting = await tx.query.stores.findFirst({
                where: eq(stores.id, actor.storeId),
                columns: { negativeStockAlertsEnabled: true },
              })
              if (!setting) throw new ApiError('NOT_FOUND', 'Không tìm thấy cửa hàng')
              negativeStockAlertsEnabled = setting.negativeStockAlertsEnabled
            }
            if (negativeStockAlertsEnabled) {
              emitEvent(rootDb, {
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
      }

      // BC-10, TIEN-101: chia chiết khấu đơn xuống từng dòng một lần lúc bán. Báo cáo theo sản
      // phẩm và tiền hoàn khi trả hàng đọc lại đúng phần này, không tự chia lại.
      if (input.discountAmount > 0) {
        const shares = allocateOrderDiscount(
          insertedLines.map((l) => l.lineTotal),
          input.discountAmount,
        )
        for (const [idx, l] of insertedLines.entries()) {
          if (shares[idx]! === 0) continue
          await tx
            .update(orderItems)
            .set({ orderDiscountAllocated: shares[idx]! })
            .where(eq(orderItems.id, l.id))
        }
      }

      if (isPriceMismatchAdjusted && mismatchedLines.length > 0) {
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
            soldSubtotal: input.subtotal,
            soldTotal: input.total,
            oldSubtotal: input.subtotal,
            newSubtotal: input.subtotal,
            oldTotal: input.total,
            newTotal: input.total,
            lines: mismatchedLines,
            mismatchedLines,
          },
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
        })

        emitEvent(rootDb, {
          storeId: actor.storeId,
          type: 'order.price_mismatch_adjusted',
          severity: 'warn',
          title: `Cảnh báo lệch giá đơn ngoại tuyến: ${orderNumber}`,
          body: `Đơn ${orderNumber} có ${mismatchedLines.length} dòng hàng lệch giá so với giá hiện hành trên máy chủ. Tổng tiền đã chốt: ${formatVnd(input.total)}.`,
          context: {
            orderId: createdId,
            orderNumber,
            soldTotal: input.total,
            mismatchedLines,
          },
        })
      }

      if (priceApproval.hasDiscount) {
        // POS-01: chiết khấu ghi lại cả người bán lẫn người duyệt
        await logAction({
          db: txDb,
          storeId: actor.storeId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'order.discount_applied',
          targetType: 'order',
          targetId: createdId,
          changes: {
            orderId: createdId,
            orderNumber,
            orderDiscountType: input.discountType ?? null,
            orderDiscountValue: input.discountValue,
            orderDiscountAmount: input.discountAmount,
            orderBelowCost: priceApproval.orderBelowCost,
            lines: input.items.flatMap((item, idx) =>
              item.discountAmount > 0
                ? [
                    {
                      productId: item.productId,
                      variantId: item.variantId ?? null,
                      discountType: item.discountType ?? null,
                      discountValue: item.discountValue,
                      discountAmount: item.discountAmount,
                      belowCost: priceApproval.belowCostLines.has(idx),
                    },
                  ]
                : [],
            ),
            sellerId: actor.userId,
            sellerRole: actor.role,
            approvedBy: priceApproval.approver?.userId ?? null,
            approvedByRole: priceApproval.approver?.role ?? null,
            approved: priceApproval.approved,
            source,
          },
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
        })
      }

      if (!priceApproval.approved) {
        // Chỉ đơn ngoại tuyến tới được đây: đã bán tại quầy nên nhận đơn, ghi thiếu duyệt để đối soát
        await logAction({
          db: txDb,
          storeId: actor.storeId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'order.approval_missing',
          targetType: 'order',
          targetId: createdId,
          changes: {
            orderId: createdId,
            orderNumber,
            requiredPermissions: priceApproval.required,
            reason: priceApproval.missingReason,
            sellerId: actor.userId,
            sellerRole: actor.role,
            source,
          },
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
        })
        // Dòng sửa giá đã có cảnh báo riêng ở trên, chỉ cảnh báo thêm khi đơn chỉ có chiết khấu
        if (!priceApproval.hasOverride)
          emitEvent(rootDb, {
            storeId: actor.storeId,
            type: 'audit.price_override',
            severity: 'warn',
            title: `Đơn ngoại tuyến chiết khấu chưa được duyệt: ${orderNumber}`,
            body: `Đơn ${orderNumber} có chiết khấu vượt quyền người bán mà chưa được duyệt (${priceApproval.missingReason ?? 'không rõ lý do'}). Tổng tiền đã chốt: ${formatVnd(input.total)}.`,
            context: {
              orderId: createdId,
              orderNumber,
              requiredPermissions: priceApproval.required,
              userId: actor.userId,
            },
          })
      }

      if (customerDiscrepancy) {
        await logAction({
          db: txDb,
          storeId: actor.storeId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'order.customer_mismatch_dropped',
          targetType: 'order',
          targetId: createdId,
          changes: {
            orderId: createdId,
            orderNumber,
            customerDiscrepancy,
          },
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
        })
      }

      if (priceListDiscrepancy) {
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
            priceListDiscrepancy,
          },
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
        })
      }

      let oldDebt: number | null = null
      let customerCurrentDebt: number | null = null
      let printCustomer: { code: string; name: string; phone: string | null } | null = null
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
            debtUnlimited: customers.debtUnlimited,
            groupId: customers.groupId,
            code: customers.code,
            phone: customers.phone,
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

        printCustomer = customer
        // ADR-0009: null chỉ khi khách có cờ không giới hạn; không có hạn mức nào áp thì là 0
        const effectiveDebtLimit = resolveEffectiveDebtLimit({
          debtUnlimited: customer.debtUnlimited,
          customerDebtLimit: customer.debtLimit,
          groupDebtLimit: customer.groupDebtLimit ?? null,
        })

        const debtBefore = customer.currentDebt
        const debtAfter = debtBefore + debtAmount
        oldDebt = debtBefore
        customerCurrentDebt = debtAfter

        // Kiểm hạn mức (POS-12, TIEN-106): hạn mức 0 hay chưa đặt nghĩa là không được nợ
        if (!skipDebtLimitCheck) {
          if (effectiveDebtLimit !== null && debtAfter > effectiveDebtLimit) {
            if (debtLimitApprover) {
              // Vượt hạn mức có người duyệt giữ pos.overrideDebtLimit: ghi cả người bán lẫn người duyệt
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
                  overrideBy: debtLimitApprover.userId,
                  overrideByRole: debtLimitApprover.role,
                  sellerId: actor.userId,
                  sellerRole: actor.role,
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
                effectiveDebtLimit === 0
                  ? 'Khách hàng chưa được cấp hạn mức nợ nên không thể ghi nợ. Chủ cửa hàng hoặc quản lý cần đặt hạn mức, hoặc duyệt bằng mã PIN'
                  : `Vượt hạn mức công nợ. Nợ hiện tại: ${formatVnd(debtBefore)}. Hạn mức: ${formatVnd(effectiveDebtLimit)}. Nợ thêm tối đa: ${formatVnd(maxAdditional)}`,
                {
                  currentDebt: debtBefore,
                  debtLimit: effectiveDebtLimit,
                  maxAdditional,
                },
              )
            } else if (source === 'offline_sync') {
              // Đơn ngoại tuyến vượt hạn mức nợ KHÔNG có PIN: KHÔNG từ chối, đánh dấu đơn là vượt hạn mức
              isDebtLimitExceeded = true
              policyViolations.push(
                debtLimitViolation({ effectiveDebtLimit, debtBefore, debtAfter }),
              )

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

              emitEvent(rootDb, {
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

        // Ghi khoản nợ và công nợ khách qua sổ công nợ (R3), khách đã khóa ở trên
        await addCustomerDebt(txDb, {
          storeId: actor.storeId,
          customerId: input.customerId,
          type: 'sale',
          orderId: createdId,
          amount: debtAmount,
        })

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
          .select({
            currentDebt: customers.currentDebt,
            code: customers.code,
            name: customers.name,
            phone: customers.phone,
          })
          .from(customers)
          .where(
            and(
              eq(customers.id, input.customerId),
              eq(customers.storeId, actor.storeId),
              isNull(customers.deletedAt),
            ),
          )
          .limit(1)
        printCustomer = customerRows[0] ?? null
        oldDebt = customerRows[0]?.currentDebt != null ? Number(customerRows[0].currentDebt) : 0
        customerCurrentDebt = oldDebt
      }

      // BC-08: công nợ khách ngay trước đơn, chụp để in lại không lấy công nợ hiện tại
      if (oldDebt !== null && printCustomer) {
        await tx.update(orders).set({ customerDebtBefore: oldDebt }).where(eq(orders.id, createdId))
      }

      let reviewStatus: OrderReviewStatus = 'none'
      if (policyViolations.length > 0) {
        // Chỉ đơn ngoại tuyến tới được đây với vi phạm: POS trực tuyến đã bị từ chối ở trên
        reviewStatus = 'pending_review'
        await tx
          .update(orders)
          .set({ reviewStatus, policyViolations })
          .where(eq(orders.id, createdId))

        const offlineAt =
          offlineCreatedAt ??
          ('createdAt' in input && typeof (input as { createdAt?: string }).createdAt === 'string'
            ? (input as { createdAt?: string }).createdAt
            : null)
        await logAction({
          db: txDb,
          storeId: actor.storeId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'order.policy_violation_offline',
          targetType: 'order',
          targetId: createdId,
          changes: {
            orderId: createdId,
            orderNumber,
            total: input.total,
            debtAmount,
            violations: policyViolations,
            sellerId: actor.userId,
            sellerRole: actor.role,
            clientId,
            offlineCreatedAt: offlineAt,
            device: { ipAddress: meta?.ipAddress ?? null, userAgent: meta?.userAgent ?? null },
          },
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
        })

        emitEvent(rootDb, {
          storeId: actor.storeId,
          type: 'order.policy_violation_offline',
          severity: 'error',
          title: `Đơn ngoại tuyến vi phạm chính sách, cần duyệt: ${orderNumber}`,
          body: `Đơn ${orderNumber} (${formatVnd(input.total)}) được đồng bộ từ thiết bị bán ngoại tuyến với vi phạm: ${policyViolations.map((v) => v.message).join('; ')}. Hàng đã giao nên đơn đã được ghi nhận; vào Đơn hàng, lọc "Chờ duyệt" để duyệt hoặc từ chối.`,
          context: {
            orderId: createdId,
            orderNumber,
            total: input.total,
            violations: policyViolations.map((v) => v.code),
            sellerId: actor.userId,
            userId: actor.userId,
            clientId,
          },
        })
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
          priceListId: input.priceListId ?? null,
          priceListName: snapshotPriceListName,
          itemCount: input.items.length,
          subtotal: input.subtotal,
          discountAmount: input.discountAmount,
          total: input.total,
          paymentMethod: input.paymentMethod,
          paymentStatus: payment.paymentStatus,
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
        emitEvent(rootDb, {
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
        customerCode: printCustomer?.code ?? null,
        customerName: printCustomer?.name ?? null,
        customerPhone: printCustomer?.phone ?? null,
        priceListId: input.priceListId ?? null,
        priceListName: snapshotPriceListName,
        subtotal: input.subtotal,
        discountAmount: input.discountAmount,
        total: input.total,
        paymentMethod: input.paymentMethod,
        paymentStatus: payment.paymentStatus,
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
        reviewStatus,
        policyViolations: redactViolations(
          policyViolations.length > 0 ? policyViolations : null,
          canViewCost,
        ),
        ...(warnings.length > 0 ? { warnings } : {}),
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
          priceListId: orders.priceListId,
          priceListName: orders.priceListName,
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
          reviewStatus: orders.reviewStatus,
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
          priceListId: dup.priceListId ?? null,
          priceListName: dup.priceListName ?? null,
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
          reviewStatus: dup.reviewStatus as OrderReviewStatus,
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
  debtUnlimited: boolean
  /** null chỉ khi khách không giới hạn nợ; 0 là không được nợ (ADR-0009) */
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
      debtUnlimited: customers.debtUnlimited,
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

  const effectiveDebtLimit = resolveEffectiveDebtLimit({
    debtUnlimited: row.debtUnlimited,
    customerDebtLimit: row.customerDebtLimit,
    groupDebtLimit: row.groupDebtLimit ?? null,
  })

  return {
    customerId: row.id,
    customerName: row.name,
    groupId: row.groupId,
    groupName: row.groupName ?? null,
    currentDebt: row.currentDebt,
    customerDebtLimit: row.customerDebtLimit,
    groupDebtLimit: row.groupDebtLimit ?? null,
    debtUnlimited: row.debtUnlimited,
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
  priceListId?: string | null
  priceListName?: string | null
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
  reviewStatus: OrderReviewStatus
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
    reviewStatus,
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
  if (reviewStatus) {
    conditions.push(eq(orders.reviewStatus, reviewStatus))
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
      priceListId: orders.priceListId,
      priceListName: orders.priceListName,
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
      reviewStatus: orders.reviewStatus,
      note: orders.note,
      createdAt: orders.createdAt,
      debtRemaining: debts.remaining,
      debtReduced: debts.reduced,
    })
    .from(orders)
    .leftJoin(
      customers,
      and(eq(orders.customerId, customers.id), eq(customers.storeId, orders.storeId)),
    )
    .leftJoin(users, eq(orders.userId, users.id))
    .leftJoin(debts, eq(debts.orderId, orders.id))
    .where(whereClause)
    .orderBy(desc(orders.createdAt))
    .limit(pageSize)
    .offset(offset)

  const totalRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .leftJoin(
      customers,
      and(eq(orders.customerId, customers.id), eq(customers.storeId, orders.storeId)),
    )
    .where(whereClause)

  const total = totalRows[0]?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const data: OrderListItem[] = rows.map((r) => {
    const totalAmount = Number(r.total)
    // CRIT-3: Lấy debtAmount từ debts.remaining (source of truth)
    const debtAmount = r.debtRemaining != null ? Number(r.debtRemaining) : 0
    // TIEN-01: phần nợ được cấn trừ khi trả hàng hay điều chỉnh giảm không phải tiền đã thu
    const paidAmount = totalAmount - debtAmount - Number(r.debtReduced ?? 0)

    return {
      id: r.id,
      orderNumber: r.orderNumber,
      customerId: r.customerId,
      customerName: r.customerName ?? null,
      customerPhone: r.customerPhone ?? null,
      priceListId: r.priceListId ?? null,
      priceListName: r.priceListName ?? null,
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
      reviewStatus: r.reviewStatus as OrderReviewStatus,
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
  customerCode: string | null
  customerPhone: string | null
  customerGroupName: string | null
  customerCurrentDebt?: number | null
  /** Công nợ khách ngay trước đơn, chụp lúc bán (BC-08). null với khách lẻ và đơn cũ */
  oldDebt?: number | null
  customerDebtBefore: number | null
  /** Khách đã trả lúc bán; null với đơn cũ không suy ra được */
  paidAmountAtSale: number | null
  /** Nợ ghi cho đơn lúc bán (total - paidAmountAtSale) */
  debtAmountAtSale: number | null
  priceListId?: string | null
  priceListName?: string | null
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
  reviewStatus: OrderReviewStatus
  policyViolations: OrderPolicyViolation[] | null
  reviewedByName: string | null
  reviewedAt: string | null
  reviewNote: string | null
  items: OrderDetailItem[]
  createdAt: string
  updatedAt: string
}

export interface GetOrderDetailDeps {
  db: Db
  storeId: string
  orderId: string
  /** BC-13: người xem không có quyền products.viewCost thì không nhận giá vốn từng dòng */
  canViewCost: boolean
}

export async function getOrderDetail({
  db,
  storeId,
  orderId,
  canViewCost,
}: GetOrderDetailDeps): Promise<OrderDetailFull> {
  const orderRows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      customerId: orders.customerId,
      priceListId: orders.priceListId,
      priceListName: orders.priceListName,
      customerName: customers.name,
      customerCode: customers.code,
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
      paidAmountAtSale: orders.paidAmountAtSale,
      customerDebtBefore: orders.customerDebtBefore,
      reviewStatus: orders.reviewStatus,
      policyViolations: orders.policyViolations,
      reviewedBy: orders.reviewedBy,
      reviewedAt: orders.reviewedAt,
      reviewNote: orders.reviewNote,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      debtRemaining: debts.remaining,
      debtReduced: debts.reduced,
    })
    .from(orders)
    .leftJoin(
      customers,
      and(eq(orders.customerId, customers.id), eq(customers.storeId, orders.storeId)),
    )
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
      priceSource: orderItems.priceSource,
      priceSourceDetail: orderItems.priceSourceDetail,
      sku: sql<string | null>`COALESCE(${productVariants.sku}, ${products.sku})`.as('sku'),
      // BC-01, BC-08: giá vốn một đơn vị bán chụp lúc bán, không đọc giá vốn hiện tại
      unitCost: orderItems.unitCost,
      conversionFactor: orderItems.conversionFactor,
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
    priceSource: it.priceSource ?? null,
    priceSourceDetail: it.priceSourceDetail ?? null,
    sku: it.sku ?? null,
    ...(canViewCost
      ? {
          costPrice: it.unitCost != null ? Number(it.unitCost) * Number(it.conversionFactor) : null,
        }
      : {}),
  }))

  const totalAmount = Number(row.total)
  // CRIT-3: Lấy debtAmount từ debts.remaining (source of truth)
  const debtAmount = row.debtRemaining != null ? Number(row.debtRemaining) : 0
  // TIEN-01: phần nợ được cấn trừ khi trả hàng hay điều chỉnh giảm không phải tiền đã thu
  const paidAmount = totalAmount - debtAmount - Number(row.debtReduced ?? 0)
  const currentDebt = row.customerCurrentDebt != null ? Number(row.customerCurrentDebt) : null
  // BC-08: in lại dùng số chụp lúc bán; đơn cũ chưa có ảnh chụp thì không suy từ công nợ hiện tại
  const customerDebtBefore = row.customerDebtBefore != null ? Number(row.customerDebtBefore) : null
  const paidAmountAtSale = row.paidAmountAtSale != null ? Number(row.paidAmountAtSale) : null
  const debtAmountAtSale = paidAmountAtSale != null ? totalAmount - paidAmountAtSale : null

  let reviewedByName: string | null = null
  if (row.reviewedBy) {
    const [reviewer] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, row.reviewedBy))
      .limit(1)
    reviewedByName = reviewer?.name ?? null
  }

  return {
    id: row.id,
    orderNumber: row.orderNumber,
    customerId: row.customerId,
    customerName: row.customerName ?? null,
    customerCode: row.customerCode ?? null,
    customerPhone: row.customerPhone ?? null,
    customerGroupName: row.customerGroupName ?? null,
    customerCurrentDebt: currentDebt,
    oldDebt: customerDebtBefore,
    customerDebtBefore,
    paidAmountAtSale,
    debtAmountAtSale,
    priceListId: row.priceListId ?? null,
    priceListName: row.priceListName ?? null,
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
    reviewStatus: row.reviewStatus as OrderReviewStatus,
    policyViolations: redactViolations(row.policyViolations ?? null, canViewCost),
    reviewedByName,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewNote: row.reviewNote ?? null,
    items,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * BC-13: người không được xem giá vốn không được biết đơn nào bị giữ vì dưới giá vốn; với họ vi
 * phạm đó chỉ hiện là sửa giá hoặc chiết khấu chưa được duyệt.
 */
export function redactViolations(
  violations: OrderPolicyViolation[] | null,
  canViewCost: boolean,
): OrderPolicyViolation[] | null {
  if (!violations || canViewCost) return violations
  return violations.map((v) =>
    v.code === 'below_cost_unapproved'
      ? {
          code: 'price_unapproved',
          message: 'Sửa giá hoặc chiết khấu vượt quyền người bán mà chưa được duyệt',
          requiredPermissions: ['pos.editPrice'],
        }
      : v,
  )
}

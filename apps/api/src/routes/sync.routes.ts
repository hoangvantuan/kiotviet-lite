import { notify } from '@kiotviet-lite/notifications'
import { and, eq, gt, inArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { uuidv7 } from 'uuidv7'

import {
  PGLITE_SCHEMA_VERSION,
  syncIncrementalQuerySchema,
  syncInitialQuerySchema,
  type SyncPushOrder,
  syncPushRequestSchema,
  type SyncPushResult,
} from '@kiotviet-lite/shared'
import {
  categories,
  customerGroups,
  customers,
  debts,
  inventoryTransactions,
  orderItems,
  orders,
  priceListItems,
  priceLists,
  printSettings,
  products,
  productUnitConversions,
  productVariants,
} from '@kiotviet-lite/shared/schema'

import type { Db } from '../db/index.js'
import { parseJson } from '../lib/http.js'
import { logger } from '../lib/logger.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import { getRequestMeta, logAction } from '../services/audit.service.js'
import {
  aggregateVariantStock,
  loadProductForUpdate,
  loadVariantForUpdate,
} from '../services/products-lock.helper.js'

async function getStorePriceListIds(db: Db, storeId: string) {
  const lists = await db
    .select({ id: priceLists.id })
    .from(priceLists)
    .where(eq(priceLists.storeId, storeId))
  return lists.map((l) => l.id)
}

export function createSyncRoutes({ db }: { db: Db }) {
  const app = new Hono()
  app.onError(errorHandler)
  app.use('*', requireAuth)

  app.get('/initial', async (c) => {
    const auth = c.get('auth')
    const query = syncInitialQuerySchema.parse(c.req.query())
    const limit = query.limit
    const storeId = auth.storeId

    const plIds = await getStorePriceListIds(db, storeId)

    const [
      productsData,
      variantsData,
      categoriesData,
      customersData,
      customerGroupsData,
      priceListsData,
      priceListItemsData,
      printSettingsData,
      unitsData,
    ] = await Promise.all([
      db.select().from(products).where(eq(products.storeId, storeId)).limit(limit),
      db.select().from(productVariants).where(eq(productVariants.storeId, storeId)).limit(limit),
      db.select().from(categories).where(eq(categories.storeId, storeId)).limit(limit),
      db.select().from(customers).where(eq(customers.storeId, storeId)).limit(limit),
      db.select().from(customerGroups).where(eq(customerGroups.storeId, storeId)).limit(limit),
      db.select().from(priceLists).where(eq(priceLists.storeId, storeId)).limit(limit),
      plIds.length > 0
        ? db
            .select()
            .from(priceListItems)
            .where(inArray(priceListItems.priceListId, plIds))
            .limit(limit)
        : Promise.resolve([]),
      db.select().from(printSettings).where(eq(printSettings.storeId, storeId)).limit(limit),
      db
        .select()
        .from(productUnitConversions)
        .where(eq(productUnitConversions.storeId, storeId))
        .limit(limit),
    ])

    return c.json({
      data: {
        products: productsData,
        variants: variantsData,
        categories: categoriesData,
        customers: customersData,
        customerGroups: customerGroupsData,
        priceLists: priceListsData,
        priceListItems: priceListItemsData,
        printSettings: printSettingsData,
        units: unitsData,
      },
      meta: {
        syncedAt: new Date().toISOString(),
      },
    })
  })

  app.get('/incremental', async (c) => {
    const auth = c.get('auth')
    const query = syncIncrementalQuerySchema.parse(c.req.query())
    const since = new Date(query.since)
    const storeId = auth.storeId

    const plIds = await getStorePriceListIds(db, storeId)

    const [
      productsData,
      variantsData,
      categoriesData,
      customersData,
      customerGroupsData,
      priceListsData,
      priceListItemsData,
      printSettingsData,
      unitsData,
    ] = await Promise.all([
      db
        .select()
        .from(products)
        .where(and(eq(products.storeId, storeId), gt(products.updatedAt, since))),
      db
        .select()
        .from(productVariants)
        .where(and(eq(productVariants.storeId, storeId), gt(productVariants.updatedAt, since))),
      db
        .select()
        .from(categories)
        .where(and(eq(categories.storeId, storeId), gt(categories.updatedAt, since))),
      db
        .select()
        .from(customers)
        .where(and(eq(customers.storeId, storeId), gt(customers.updatedAt, since))),
      db
        .select()
        .from(customerGroups)
        .where(and(eq(customerGroups.storeId, storeId), gt(customerGroups.updatedAt, since))),
      db
        .select()
        .from(priceLists)
        .where(and(eq(priceLists.storeId, storeId), gt(priceLists.updatedAt, since))),
      plIds.length > 0
        ? db
            .select()
            .from(priceListItems)
            .where(
              and(inArray(priceListItems.priceListId, plIds), gt(priceListItems.updatedAt, since)),
            )
        : Promise.resolve([]),
      db
        .select()
        .from(printSettings)
        .where(and(eq(printSettings.storeId, storeId), gt(printSettings.updatedAt, since))),
      db
        .select()
        .from(productUnitConversions)
        .where(
          and(
            eq(productUnitConversions.storeId, storeId),
            gt(productUnitConversions.updatedAt, since),
          ),
        ),
    ])

    return c.json({
      data: {
        products: productsData,
        variants: variantsData,
        categories: categoriesData,
        customers: customersData,
        customerGroups: customerGroupsData,
        priceLists: priceListsData,
        priceListItems: priceListItemsData,
        printSettings: printSettingsData,
        units: unitsData,
      },
      meta: {
        syncedAt: new Date().toISOString(),
      },
    })
  })

  app.get('/schema-version', async (c) => {
    return c.json({ data: { version: PGLITE_SCHEMA_VERSION } })
  })

  app.post('/push', requirePermission('pos.sell'), async (c) => {
    const auth = c.get('auth')
    const input = await parseJson(c, syncPushRequestSchema)
    const storeId = auth.storeId
    const userId = auth.userId
    const role = auth.role
    const meta = getRequestMeta(c)
    const results: SyncPushResult[] = []

    for (const offlineOrder of input.orders) {
      try {
        const result = await processSyncOrder({
          db,
          storeId,
          userId,
          role,
          offlineOrder,
          meta,
        })
        results.push(result)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        logger.error(
          { entity: 'order', action: 'sync_push', storeId, clientId: offlineOrder.clientId, err },
          'sync push order failed',
        )
        results.push({
          clientId: offlineOrder.clientId,
          status: 'error',
          error: { code: 'INTERNAL_ERROR', message },
        })
      }
    }

    return c.json({
      data: {
        results,
        syncedAt: new Date().toISOString(),
      },
    })
  })

  return app
}

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

async function generateSyncOrderNumber({
  tx,
  storeId,
}: {
  tx: Db
  storeId: string
}): Promise<string> {
  const dateStr = formatDateForCode(new Date())
  const prefix = `HD-${dateStr.slice(2)}-`
  const rows = await tx
    .select({ code: sql<string>`MAX(${orders.orderNumber})` })
    .from(orders)
    .where(and(eq(orders.storeId, storeId), sql`${orders.orderNumber} LIKE ${prefix + '%'}`))
  const maxCode = rows[0]?.code ?? null
  const nextSeq = maxCode ? parseInt(maxCode.slice(-4), 10) + 1 : 1
  if (nextSeq > MAX_DAILY_ORDER_SEQUENCE) {
    throw new Error('Vượt quá 9999 đơn hàng trong ngày')
  }
  return `${prefix}${String(nextSeq).padStart(4, '0')}`
}

interface ProcessSyncOrderDeps {
  db: Db
  storeId: string
  userId: string
  role: string
  offlineOrder: SyncPushOrder
  meta?: { ipAddress?: string; userAgent?: string }
}

async function processSyncOrder({
  db,
  storeId,
  userId,
  role,
  offlineOrder,
  meta,
}: ProcessSyncOrderDeps): Promise<SyncPushResult> {
  const { clientId, orderData } = offlineOrder

  // Dedup: check existing order with same clientId (note contains 'offline:<clientId>')
  const existing = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(eq(orders.storeId, storeId), sql`${orders.note} LIKE ${'%offline:' + clientId + '%'}`),
    )
    .limit(1)

  if (existing.length > 0) {
    return { clientId, serverId: existing[0]!.id, status: 'duplicate' }
  }

  const debtAmount = orderData.debtAmount ?? 0

  let change = 0
  if (orderData.paymentMethod === 'cash' && orderData.cashAmount != null) {
    change = orderData.cashAmount - orderData.total
  } else if (orderData.paymentMethod === 'combined') {
    const cashPart = orderData.cashAmount ?? 0
    const transferPart = orderData.transferAmount ?? 0
    change = cashPart + transferPart - orderData.total
  } else if (orderData.paymentMethod === 'debt' && orderData.cashAmount != null) {
    change = orderData.cashAmount - (orderData.total - debtAmount)
  }
  change = Math.max(0, change)

  const serverId = await db.transaction(async (tx) => {
    const txDb = tx as unknown as Db
    const orderNumber = await generateSyncOrderNumber({ tx: txDb, storeId })

    const noteWithClientId = orderData.note
      ? `${orderData.note} | offline:${clientId}`
      : `offline:${clientId}`

    const [row] = await tx
      .insert(orders)
      .values({
        storeId,
        orderNumber,
        customerId: orderData.customerId ?? null,
        userId,
        subtotal: orderData.subtotal,
        discountType: orderData.discountType ?? null,
        discountValue: orderData.discountValue,
        discountAmount: orderData.discountAmount,
        total: orderData.total,
        paymentMethod: orderData.paymentMethod,
        paymentStatus: orderData.paymentStatus,
        cashAmount: orderData.cashAmount ?? null,
        transferAmount: orderData.transferAmount ?? null,
        change,
        note: noteWithClientId,
        status: 'completed',
      })
      .returning({ id: orders.id })

    if (!row) throw new Error('Insert order failed')
    const orderId = row.id

    const negativeStockProducts: Array<{ productId: string; productName: string; stock: number }> =
      []

    for (const item of orderData.items) {
      const product = await loadProductForUpdate({
        tx: txDb,
        storeId,
        productId: item.productId,
      })

      await tx.insert(orderItems).values({
        orderId,
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

      if (product.trackInventory) {
        let deductQty = item.quantity
        if (item.unitConversionId) {
          const convRows = await tx
            .select({ conversionFactor: productUnitConversions.conversionFactor })
            .from(productUnitConversions)
            .where(eq(productUnitConversions.id, item.unitConversionId))
            .limit(1)
          if (convRows[0]) {
            deductQty = item.quantity * convRows[0].conversionFactor
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
          const aggStock = await aggregateVariantStock({ tx: txDb, productId: item.productId })
          await tx
            .update(products)
            .set({ currentStock: aggStock })
            .where(eq(products.id, item.productId))
        } else {
          await tx
            .update(products)
            .set({ currentStock: sql`${products.currentStock} - ${deductQty}` })
            .where(eq(products.id, item.productId))
          const [updated] = await tx
            .select({ currentStock: products.currentStock })
            .from(products)
            .where(eq(products.id, item.productId))
            .limit(1)
          newStock = updated?.currentStock ?? product.currentStock - deductQty
        }

        await tx.insert(inventoryTransactions).values({
          storeId,
          productId: item.productId,
          variantId: item.variantId ?? null,
          type: 'sale',
          quantity: -deductQty,
          stockAfter: newStock,
          note: `${orderNumber} (offline sync)`,
          createdBy: userId,
        })

        if (newStock < 0) {
          negativeStockProducts.push({
            productId: item.productId,
            productName: item.productName,
            stock: newStock,
          })
        }
      }
    }

    // Debt handling for offline orders (skip limit check, client already committed)
    if (debtAmount > 0 && orderData.customerId) {
      await tx.insert(debts).values({
        storeId,
        orderId,
        customerId: orderData.customerId,
        amount: debtAmount,
        paid: 0,
        remaining: debtAmount,
      })

      await tx
        .update(customers)
        .set({ currentDebt: sql`${customers.currentDebt} + ${debtAmount}` })
        .where(eq(customers.id, orderData.customerId))

      await logAction({
        db: txDb,
        storeId,
        actorId: userId,
        actorRole: role,
        action: 'debt.created',
        targetType: 'order',
        targetId: orderId,
        changes: { customerId: orderData.customerId, amount: debtAmount, source: 'offline_sync' },
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      })
    }

    await logAction({
      db: txDb,
      storeId,
      actorId: userId,
      actorRole: role,
      action: 'order.created',
      targetType: 'order',
      targetId: orderId,
      changes: {
        orderNumber,
        itemCount: orderData.items.length,
        total: orderData.total,
        paymentMethod: orderData.paymentMethod,
        source: 'offline_sync',
        clientId,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    if (negativeStockProducts.length > 0) {
      for (const nsp of negativeStockProducts) {
        logger.warn(
          {
            entity: 'product',
            entityId: nsp.productId,
            action: 'stock.negative_after_sync',
            storeId,
            stock: nsp.stock,
            productName: nsp.productName,
          },
          `stock negative after offline sync: ${nsp.productName} = ${nsp.stock}`,
        )

        notify(db, {
          id: uuidv7(),
          storeId,
          type: 'stock.negative',
          severity: 'error',
          title: `Tồn kho âm: ${nsp.productName}`,
          body: `Tồn kho ${nsp.productName} bị âm (${nsp.stock}) sau đồng bộ đơn offline. Cần nhập thêm hoặc kiểm kho.`,
          occurredAt: new Date().toISOString(),
        }).catch((err) => {
          logger.error({ err, productId: nsp.productId }, 'notify stock.negative failed')
        })
      }
    }

    logger.info(
      {
        entity: 'order',
        entityId: orderId,
        action: 'sync_push',
        storeId,
        userId,
        clientId,
        orderNumber,
        total: orderData.total,
      },
      'offline order synced',
    )

    return orderId
  })

  return { clientId, serverId, status: 'synced' }
}

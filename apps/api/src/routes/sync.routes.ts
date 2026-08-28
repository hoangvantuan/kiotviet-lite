import { and, eq, gt, inArray } from 'drizzle-orm'
import { Hono } from 'hono'

import {
  PGLITE_SCHEMA_VERSION,
  syncIncrementalQuerySchema,
  syncInitialQuerySchema,
  syncPushRequestSchema,
  type SyncPushResult,
  type UserRole,
} from '@kiotviet-lite/shared'
import {
  categories,
  customerGroups,
  customers,
  priceListItems,
  priceLists,
  printSettings,
  products,
  productUnitConversions,
  productVariants,
} from '@kiotviet-lite/shared/schema'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { parseJson } from '../lib/http.js'
import { logger } from '../lib/logger.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import { getRequestMeta } from '../services/audit.service.js'
import { emitEvent } from '../services/notification-emitter.js'
import { createOrder } from '../services/orders.service.js'

async function getStorePriceListIds(db: Db, storeId: string) {
  const lists = await db
    .select({ id: priceLists.id })
    .from(priceLists)
    .where(eq(priceLists.storeId, storeId))
  return lists.map((l) => l.id)
}

// Track consecutive sync push failures per store
const syncFailureCounters = new Map<string, { count: number; lastError: string }>()

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
    const role = auth.role as UserRole
    const meta = getRequestMeta(c)
    const results: SyncPushResult[] = []

    for (const offlineOrder of input.orders) {
      try {
        const order = await createOrder({
          db,
          actor: {
            userId,
            storeId,
            role,
          },
          input: offlineOrder.orderData,
          meta,
          source: 'offline_sync',
          clientId: offlineOrder.clientId,
          offlineCreatedAt: offlineOrder.createdAt,
        })

        results.push({
          clientId: offlineOrder.clientId,
          serverId: order.id,
          status: order.isDuplicate ? 'duplicate' : 'synced',
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        const code = err instanceof ApiError ? err.code : 'INTERNAL_ERROR'
        logger.error(
          { entity: 'order', action: 'sync_push', storeId, clientId: offlineOrder.clientId, err },
          'sync push order failed',
        )
        results.push({
          clientId: offlineOrder.clientId,
          status: 'error',
          error: { code, message },
        })
      }
    }

    // Track consecutive sync failures per store
    const errorCount = results.filter((r) => r.status === 'error').length
    if (errorCount > 0) {
      const key = storeId
      const current = syncFailureCounters.get(key) ?? { count: 0, lastError: '' }
      current.count += errorCount
      current.lastError =
        results.find((r) => r.status === 'error')?.error?.message ?? 'Unknown error'
      syncFailureCounters.set(key, current)

      if (current.count >= 3) {
        emitEvent(db, {
          storeId,
          type: 'sync.failed_repeatedly',
          severity: 'error',
          title: 'Đồng bộ thất bại liên tiếp',
          body: `Đồng bộ đơn offline thất bại ${current.count} lần liên tiếp. Lỗi gần nhất: ${current.lastError}`,
          context: {
            failCount: current.count,
            lastError: current.lastError,
            pendingCount: input.orders.length,
          },
        })
        syncFailureCounters.delete(key)
      }
    } else {
      // Reset counter on success
      syncFailureCounters.delete(storeId)
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

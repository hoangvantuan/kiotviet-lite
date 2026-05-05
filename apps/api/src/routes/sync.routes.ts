import { and, eq, gt, inArray } from 'drizzle-orm'
import { Hono } from 'hono'

import {
  PGLITE_SCHEMA_VERSION,
  syncIncrementalQuerySchema,
  syncInitialQuerySchema,
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
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'

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

  return app
}

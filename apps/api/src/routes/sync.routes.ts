import { and, eq, gt, inArray } from 'drizzle-orm'
import { Hono } from 'hono'

import {
  hasPermission,
  PGLITE_SCHEMA_VERSION,
  syncIncrementalQuerySchema,
  syncInitialQuerySchema,
  syncPushOrderSchema,
  syncPushRequestSchema,
  type SyncPushResult,
  type UserRole,
} from '@kiotviet-lite/shared'
import {
  categories,
  customerGroups,
  customers,
  orders,
  priceListItems,
  priceLists,
  printSettings,
  products,
  productUnitConversions,
  productVariants,
  users,
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
import { createOrder, type OrdersActor } from '../services/orders.service.js'

async function getStorePriceListIds(db: Db, storeId: string) {
  const lists = await db
    .select({ id: priceLists.id })
    .from(priceLists)
    .where(eq(priceLists.storeId, storeId))
  return lists.map((l) => l.id)
}

/**
 * BC-13: bỏ cột giá vốn khỏi dòng sản phẩm và biến thể khi người đồng bộ không có quyền
 * products.viewCost. Thiết bị của nhân viên không bao giờ nhận giá vốn, kể cả khi ngoại tuyến.
 */
function stripCost<T extends { costPrice: unknown }>(
  rows: T[],
  canViewCost: boolean,
): Array<Omit<T, 'costPrice'>> {
  if (canViewCost) return rows
  return rows.map((row) => {
    const copy: Partial<T> = { ...row }
    delete copy.costPrice
    return copy as Omit<T, 'costPrice'>
  })
}

/**
 * OFF-05: người bán gốc của đơn ngoại tuyến. Máy khách gửi, nên máy chủ kiểm: phải cùng cửa hàng
 * với người đồng bộ (đơn của cửa hàng khác không bao giờ vào cửa hàng này), còn hoạt động và còn
 * quyền bán. Không đạt thì từ chối đơn, không ghi đơn cho người đồng bộ.
 */
async function resolveSeller(
  db: Db,
  auth: { userId: string; storeId: string; role: string },
  sellerId: string,
): Promise<OrdersActor> {
  if (sellerId === auth.userId) {
    return { userId: auth.userId, storeId: auth.storeId, role: auth.role as UserRole }
  }
  const [seller] = await db
    .select({
      id: users.id,
      name: users.name,
      storeId: users.storeId,
      role: users.role,
      isActive: users.isActive,
    })
    .from(users)
    .where(and(eq(users.id, sellerId), eq(users.storeId, auth.storeId)))
    .limit(1)
  if (!seller) {
    throw new ApiError(
      'FORBIDDEN',
      'Đơn được bán bằng tài khoản không thuộc cửa hàng đang đăng nhập. Đăng nhập tài khoản của cửa hàng đã bán để đồng bộ đơn này',
      { reason: 'seller_not_in_store' },
    )
  }
  if (!seller.isActive || !hasPermission(seller.role, 'pos.sell')) {
    throw new ApiError(
      'BUSINESS_RULE_VIOLATION',
      `Tài khoản người bán "${seller.name}" đã bị khóa hoặc không còn quyền bán hàng. Chủ cửa hàng mở lại tài khoản rồi đồng bộ lại đơn này`,
      { reason: 'seller_inactive' },
    )
  }
  return { userId: seller.id, storeId: seller.storeId, role: seller.role }
}

async function findSyncedOrder(db: Db, storeId: string, clientId: string) {
  const [row] = await db
    .select({ id: orders.id, orderNumber: orders.orderNumber })
    .from(orders)
    .where(and(eq(orders.storeId, storeId), eq(orders.clientId, clientId)))
    .limit(1)
  return row ?? null
}

// Track consecutive sync push failures per store
const syncFailureCounters = new Map<string, { count: number; lastError: string }>()

export function createSyncRoutes({ db }: { db: Db }) {
  const app = new Hono()
  app.onError(errorHandler)
  app.use('*', requireAuth(db))

  app.get('/initial', async (c) => {
    const auth = c.get('auth')
    const query = syncInitialQuerySchema.parse(c.req.query())
    const limit = query.limit
    const storeId = auth.storeId
    const canViewCost = hasPermission(auth.role, 'products.viewCost')

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
        products: stripCost(productsData, canViewCost),
        variants: stripCost(variantsData, canViewCost),
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
    const canViewCost = hasPermission(auth.role, 'products.viewCost')

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
        products: stripCost(productsData, canViewCost),
        variants: stripCost(variantsData, canViewCost),
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
    const meta = getRequestMeta(c)
    const results: SyncPushResult[] = []
    const sellers = new Map<string, Promise<OrdersActor>>()

    // OFF-10: mỗi đơn có kết quả riêng, một đơn sai không chặn các đơn còn lại trong lô
    for (const raw of input.orders) {
      const parsed = syncPushOrderSchema.safeParse(raw)
      if (!parsed.success) {
        const issue = parsed.error.issues[0]
        results.push({
          clientId: raw.clientId,
          status: 'error',
          error: {
            code: 'VALIDATION_ERROR',
            message: `Dữ liệu đơn không hợp lệ${issue ? ` (${issue.path.join('.')}: ${issue.message})` : ''}`,
          },
        })
        continue
      }
      const offlineOrder = parsed.data
      try {
        // OFF-05: đơn ghi cho người bán lúc bán, không phải người đang đồng bộ
        const sellerId = offlineOrder.sellerUserId ?? auth.userId
        let seller = sellers.get(sellerId)
        if (!seller) {
          seller = resolveSeller(db, auth, sellerId)
          sellers.set(sellerId, seller)
        }
        const actor = await seller.catch(async (err: unknown) => {
          // Đơn đã có trên máy chủ (lần đồng bộ trước mất phản hồi) thì vẫn báo trùng
          const existing = await findSyncedOrder(db, storeId, offlineOrder.clientId)
          if (existing) return { duplicate: existing }
          throw err
        })
        if ('duplicate' in actor) {
          results.push({
            clientId: offlineOrder.clientId,
            serverId: actor.duplicate.id,
            orderNumber: actor.duplicate.orderNumber,
            status: 'duplicate',
          })
          continue
        }

        const order = await createOrder({
          db,
          actor,
          input: offlineOrder.orderData,
          meta,
          source: 'offline_sync',
          clientId: offlineOrder.clientId,
          offlineCreatedAt: offlineOrder.createdAt,
          syncedByUserId: actor.userId === auth.userId ? null : auth.userId,
        })

        results.push({
          clientId: offlineOrder.clientId,
          serverId: order.id,
          orderNumber: order.orderNumber,
          status: order.isDuplicate ? 'duplicate' : 'synced',
          ...(order.warnings ? { warnings: order.warnings } : {}),
          ...(order.reviewStatus && order.reviewStatus !== 'none'
            ? { reviewStatus: order.reviewStatus }
            : {}),
        })
      } catch (err) {
        // OFF-08, OFF-14: lỗi không phải ApiError (lỗi SQL, lỗi lập trình) không được lộ ra máy
        // khách. Máy khách coi INTERNAL_ERROR là lỗi tạm thời và tự thử lại sau.
        const apiError = err instanceof ApiError ? err : null
        const reason = (apiError?.details as { reason?: unknown } | undefined)?.reason
        logger.error(
          { entity: 'order', action: 'sync_push', storeId, clientId: offlineOrder.clientId, err },
          'sync push order failed',
        )
        results.push({
          clientId: offlineOrder.clientId,
          status: 'error',
          error: {
            code: apiError?.code ?? 'INTERNAL_ERROR',
            message:
              apiError?.message ?? 'Máy chủ gặp lỗi khi ghi đơn này, hệ thống sẽ tự thử lại sau',
            ...(typeof reason === 'string' ? { reason } : {}),
          },
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

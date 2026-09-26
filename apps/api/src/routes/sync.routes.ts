import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'

import {
  hasPermission,
  PGLITE_SCHEMA_VERSION,
  syncPullQuerySchema,
  syncPushOrderSchema,
  syncPushRequestSchema,
  type SyncPushResult,
  type UserRole,
} from '@kiotviet-lite/shared'
import { orders, users } from '@kiotviet-lite/shared/schema'

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
import { pullSyncPage } from '../services/sync-pull.service.js'

interface ResolvedSeller {
  actor: OrdersActor
  /** Người bán đã bị khóa hoặc mất quyền bán sau khi bán ngoại tuyến */
  inactiveName: string | null
}

/**
 * OFF-05: người bán gốc của đơn ngoại tuyến. Máy khách gửi, nên máy chủ kiểm: phải cùng cửa hàng
 * với người đồng bộ (đơn của cửa hàng khác không bao giờ vào cửa hàng này). Người đồng bộ khác
 * người bán thì gắn vào actor.syncedBy, chính sách giá lấy giao quyền của hai người (không ai mượn
 * được quyền của người kia). Người bán đã bị khóa vẫn nhận đơn (tiền đã thu), đơn chờ chủ duyệt.
 */
async function resolveSeller(
  db: Db,
  auth: { userId: string; storeId: string; role: string },
  sellerId: string,
): Promise<ResolvedSeller> {
  if (sellerId === auth.userId) {
    return {
      actor: { userId: auth.userId, storeId: auth.storeId, role: auth.role as UserRole },
      inactiveName: null,
    }
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
  return {
    actor: {
      userId: seller.id,
      storeId: seller.storeId,
      role: seller.role,
      syncedBy: { userId: auth.userId, role: auth.role as UserRole },
    },
    inactiveName: !seller.isActive || !hasPermission(seller.role, 'pos.sell') ? seller.name : null,
  }
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

  // GL-03: một trang của một loại dữ liệu danh mục, xem sync-pull.service.ts. Chỉ máy bán hàng cần
  // (khách, công nợ, bảng giá), nên đòi quyền bán hàng như /push
  app.get('/pull', requirePermission('pos.sell'), async (c) => {
    const auth = c.get('auth')
    const query = syncPullQuerySchema.parse(c.req.query())
    const page = await pullSyncPage({
      db,
      storeId: auth.storeId,
      canViewCost: hasPermission(auth.role, 'products.viewCost'),
      query,
    })
    return c.json(page)
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
    const sellers = new Map<string, Promise<ResolvedSeller>>()

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
        const resolved = await seller.catch(async (err: unknown) => {
          // Đơn đã có trên máy chủ (lần đồng bộ trước mất phản hồi) thì vẫn báo trùng
          const existing = await findSyncedOrder(db, storeId, offlineOrder.clientId)
          if (existing) return { duplicate: existing }
          throw err
        })
        if ('duplicate' in resolved) {
          results.push({
            clientId: offlineOrder.clientId,
            serverId: resolved.duplicate.id,
            orderNumber: resolved.duplicate.orderNumber,
            status: 'duplicate',
          })
          continue
        }

        const order = await createOrder({
          db,
          actor: resolved.actor,
          input: offlineOrder.orderData,
          meta,
          source: 'offline_sync',
          clientId: offlineOrder.clientId,
          offlineCreatedAt: offlineOrder.createdAt,
          offlineViolations: resolved.inactiveName
            ? [
                {
                  code: 'seller_inactive',
                  message: `Tài khoản người bán "${resolved.inactiveName}" đã bị khóa hoặc không còn quyền bán hàng khi đơn được đồng bộ`,
                  requiredPermissions: ['pos.editPrice'],
                },
              ]
            : [],
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

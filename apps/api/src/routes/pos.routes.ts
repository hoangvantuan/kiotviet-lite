import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'

import {
  createOrderSchema,
  hasPermission,
  PERMISSIONS,
  priceLists,
  resolvePricesSchema,
  type UserRole,
  users,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { toIsoDate } from '../lib/date.js'
import { ApiError } from '../lib/errors.js'
import { parseJson } from '../lib/http.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import { getRequestMeta } from '../services/audit.service.js'
import { isApprovalPermission } from '../services/order-policy.js'
import { createOrder, getCustomerDebtInfo, getStockInfo } from '../services/orders.service.js'
import { resolvePrices } from '../services/pricing.service.js'
import { searchProductsForPos } from '../services/products.service.js'

export interface PosRoutesDeps {
  db: Db
}

export function createPosRoutes({ db }: PosRoutesDeps) {
  const app = new Hono()
  app.onError(errorHandler)
  app.use('*', requireAuth(db))
  app.use('*', requirePermission('pos.sell'))

  // Issue #35 - List active valid price lists for POS selection
  app.get('/price-lists', async (c) => {
    const auth = c.get('auth')
    const today = toIsoDate(new Date())
    const lists = await db
      .select({
        id: priceLists.id,
        name: priceLists.name,
      })
      .from(priceLists)
      .where(
        and(
          eq(priceLists.storeId, auth.storeId),
          isNull(priceLists.deletedAt),
          eq(priceLists.isActive, true),
          sql`(${priceLists.effectiveFrom} IS NULL OR ${priceLists.effectiveFrom} <= ${today})`,
          sql`(${priceLists.effectiveTo} IS NULL OR ${priceLists.effectiveTo} >= ${today})`,
        ),
      )
      .orderBy(asc(priceLists.name))
    return c.json({ data: lists })
  })

  // Story 3.1 - POS product search
  app.get('/products/search', async (c) => {
    const auth = c.get('auth')
    const search = c.req.query('q') ?? undefined
    const categoryId = c.req.query('categoryId') ?? undefined
    const data = await searchProductsForPos({
      db,
      storeId: auth.storeId,
      search,
      categoryId,
      includeCost: hasPermission(auth.role, 'products.viewCost'),
    })
    return c.json({ data })
  })

  // POS-01, POS-04: người có thể duyệt một thao tác vượt quyền (đang hoạt động, đã đặt PIN).
  // Người bán chọn người duyệt rồi người đó nhập PIN của chính mình.
  app.get('/approvers', async (c) => {
    const auth = c.get('auth')
    const permission = c.req.query('permission') ?? ''
    if (!isApprovalPermission(permission)) {
      throw new ApiError('VALIDATION_ERROR', 'Quyền duyệt không hợp lệ')
    }
    const roles = PERMISSIONS[permission] as ReadonlyArray<UserRole>
    const rows = await db
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(
        and(
          eq(users.storeId, auth.storeId),
          eq(users.isActive, true),
          isNotNull(users.pinHash),
          inArray(users.role, [...roles]),
        ),
      )
      .orderBy(asc(users.name))
    return c.json({ data: rows })
  })

  // Story 4.5 - Resolve prices (6-tier pricing engine)
  app.post('/resolve-prices', async (c) => {
    const auth = c.get('auth')
    const parsed = await parseJson(c, resolvePricesSchema)
    const data = await resolvePrices({ db, storeId: auth.storeId, input: parsed })
    return c.json({ data })
  })

  // Story 3.3 - Create order (POST before parameterized routes)
  app.post('/orders', async (c) => {
    const auth = c.get('auth')
    const parsed = await parseJson(c, createOrderSchema)
    const meta = getRequestMeta(c)
    const data = await createOrder({
      db,
      actor: {
        userId: auth.userId,
        storeId: auth.storeId,
        role: auth.role,
      },
      input: parsed,
      meta,
    })
    return c.json({ data }, 201)
  })

  // Story 5.1 - Customer debt info (literal route, an toàn vì /:id dùng prefix khác)
  app.get('/customer-debt/:customerId', async (c) => {
    const auth = c.get('auth')
    const customerId = z.string().uuid().parse(c.req.param('customerId'))
    const data = await getCustomerDebtInfo({
      db,
      storeId: auth.storeId,
      customerId,
    })
    return c.json({ data })
  })

  // Story 3.3 - Stock info (parameterized route AFTER literal routes)
  app.get('/stock/:productId', async (c) => {
    const auth = c.get('auth')
    const productId = z.string().uuid().parse(c.req.param('productId'))
    const data = await getStockInfo({
      db,
      storeId: auth.storeId,
      productId,
    })
    return c.json({ data })
  })

  return app
}

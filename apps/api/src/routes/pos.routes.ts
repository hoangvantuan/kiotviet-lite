import { Hono } from 'hono'
import { z } from 'zod'

import { createOrderSchema, resolvePricesSchema } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import { getRequestMeta } from '../services/audit.service.js'
import { createOrder, getStockInfo } from '../services/orders.service.js'
import { resolvePrices } from '../services/pricing.service.js'
import { searchProductsForPos } from '../services/products.service.js'

export interface PosRoutesDeps {
  db: Db
}

export function createPosRoutes({ db }: PosRoutesDeps) {
  const app = new Hono()
  app.onError(errorHandler)
  app.use('*', requireAuth)
  app.use('*', requirePermission('pos.sell'))

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
    })
    return c.json({ data })
  })

  // Story 4.5 - Resolve prices (6-tier pricing engine)
  app.post('/resolve-prices', async (c) => {
    const auth = c.get('auth')
    const body = await c.req.json()
    const parsed = resolvePricesSchema.parse(body)
    const data = await resolvePrices({ db, storeId: auth.storeId, input: parsed })
    return c.json({ data })
  })

  // Story 3.3 - Create order (POST before parameterized routes)
  app.post('/orders', async (c) => {
    const auth = c.get('auth')
    const body = await c.req.json()
    const parsed = createOrderSchema.parse(body)
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

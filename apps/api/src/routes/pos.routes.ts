import { Hono } from 'hono'

import type { Db } from '../db/index.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
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

  return app
}

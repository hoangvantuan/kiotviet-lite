import { Hono } from 'hono'
import { z } from 'zod'

import { productHistoryQuerySchema } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import {
  listProductPurchaseHistory,
  listProductStockCheckHistory,
} from '../services/product-history.service.js'

const uuidParam = z.string().uuid('ID không hợp lệ')

export interface ProductHistoryRoutesDeps {
  db: Db
}

export function createProductHistoryRoutes({ db }: ProductHistoryRoutesDeps) {
  const app = new Hono()
  app.onError(errorHandler)
  app.use('*', requireAuth)
  app.use('*', requirePermission('inventory.manage'))

  app.get('/:productId/purchase-history', async (c) => {
    const auth = c.get('auth')
    const productId = uuidParam.parse(c.req.param('productId'))
    const query = productHistoryQuerySchema.parse(c.req.query())
    const result = await listProductPurchaseHistory({
      db,
      storeId: auth.storeId,
      productId,
      query,
    })
    return c.json({
      data: result.items,
      meta: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
    })
  })

  app.get('/:productId/stock-check-history', async (c) => {
    const auth = c.get('auth')
    const productId = uuidParam.parse(c.req.param('productId'))
    const query = productHistoryQuerySchema.parse(c.req.query())
    const result = await listProductStockCheckHistory({
      db,
      storeId: auth.storeId,
      productId,
      query,
    })
    return c.json({
      data: result.items,
      meta: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
    })
  })

  return app
}

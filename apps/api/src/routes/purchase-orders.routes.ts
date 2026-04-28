import { Hono } from 'hono'
import { z } from 'zod'

import { createPurchaseOrderSchema, listPurchaseOrdersQuerySchema } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { parseJson } from '../lib/http.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import { getRequestMeta } from '../services/audit.service.js'
import {
  createPurchaseOrder,
  getPurchaseOrder,
  listPurchaseOrders,
} from '../services/purchase-orders.service.js'

const uuidParam = z.string().uuid('ID không hợp lệ')

export interface PurchaseOrdersRoutesDeps {
  db: Db
}

export function createPurchaseOrdersRoutes({ db }: PurchaseOrdersRoutesDeps) {
  const app = new Hono()
  app.onError(errorHandler)
  app.use('*', requireAuth)
  app.use('*', requirePermission('inventory.manage'))

  app.get('/', async (c) => {
    const auth = c.get('auth')
    const query = listPurchaseOrdersQuerySchema.parse(c.req.query())
    const result = await listPurchaseOrders({ db, storeId: auth.storeId, query })
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

  app.get('/:id', async (c) => {
    const auth = c.get('auth')
    const orderId = uuidParam.parse(c.req.param('id'))
    const data = await getPurchaseOrder({ db, storeId: auth.storeId, orderId })
    return c.json({ data })
  })

  app.post('/', async (c) => {
    const auth = c.get('auth')
    const input = await parseJson(c, createPurchaseOrderSchema)
    const data = await createPurchaseOrder({
      db,
      actor: auth,
      input,
      meta: getRequestMeta(c),
    })
    return c.json({ data }, 201)
  })

  return app
}

import { Hono } from 'hono'
import { z } from 'zod'

import { listOrdersQuerySchema } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import { getOrderDetail, listOrders } from '../services/orders.service.js'

const uuidParam = z.string().uuid('ID không hợp lệ')

export interface OrdersRoutesDeps {
  db: Db
}

export function createOrdersRoutes({ db }: OrdersRoutesDeps) {
  const app = new Hono()
  app.onError(errorHandler)
  app.use('*', requireAuth)
  app.use('*', requirePermission('pos.sell'))

  // GET / - List orders (paginated, filtered)
  app.get('/', async (c) => {
    const auth = c.get('auth')
    const query = listOrdersQuerySchema.parse(c.req.query())
    const result = await listOrders({ db, storeId: auth.storeId, query })
    return c.json(result)
  })

  // GET /:id - Order detail
  app.get('/:id', async (c) => {
    const auth = c.get('auth')
    const id = uuidParam.parse(c.req.param('id'))
    const data = await getOrderDetail({ db, storeId: auth.storeId, orderId: id })
    return c.json({ data })
  })

  return app
}

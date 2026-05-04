import { Hono } from 'hono'
import { z } from 'zod'

import { createOrderReturnSchema, listOrdersQuerySchema } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { parseJson } from '../lib/http.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import { getOrderDetail, listOrders } from '../services/orders.service.js'
import { getRequestMeta } from '../services/audit.service.js'
import { createReturn, getOrderReturns, getReturnableItems } from '../services/returns.service.js'

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

  // GET /:id/returnable-items - Items with returned quantities
  app.get('/:id/returnable-items', requirePermission('orders.return'), async (c) => {
    const auth = c.get('auth')
    const id = uuidParam.parse(c.req.param('id'))
    const data = await getReturnableItems({ db, storeId: auth.storeId, orderId: id })
    return c.json({ data })
  })

  // GET /:id/returns - Return history for an order
  app.get('/:id/returns', async (c) => {
    const auth = c.get('auth')
    const id = uuidParam.parse(c.req.param('id'))
    const data = await getOrderReturns({ db, storeId: auth.storeId, orderId: id })
    return c.json({ data })
  })

  // POST /:id/returns - Create a return
  app.post('/:id/returns', requirePermission('orders.return'), async (c) => {
    const auth = c.get('auth')
    const id = uuidParam.parse(c.req.param('id'))
    const input = await parseJson(c, createOrderReturnSchema)
    const data = await createReturn({
      db,
      actor: auth,
      orderId: id,
      input,
      meta: getRequestMeta(c),
    })
    return c.json({ data }, 201)
  })

  return app
}

import { Hono } from 'hono'
import { z } from 'zod'

import {
  createOrderReturnSchema,
  hasPermission,
  listOrdersQuerySchema,
  reviewOrderSchema,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { parseJson } from '../lib/http.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import { getRequestMeta } from '../services/audit.service.js'
import { countPendingReview, reviewOrder } from '../services/order-review.service.js'
import { getOrderDetail, listOrders } from '../services/orders.service.js'
import {
  createReturn,
  getOrderPrepaymentApplied,
  getOrderReturns,
  getReturnableItems,
} from '../services/returns.service.js'

const uuidParam = z.string().uuid('ID không hợp lệ')

export interface OrdersRoutesDeps {
  db: Db
}

export function createOrdersRoutes({ db }: OrdersRoutesDeps) {
  const app = new Hono()
  app.onError(errorHandler)
  app.use('*', requireAuth(db))
  app.use('*', requirePermission('orders.view'))

  // GET / - List orders (paginated, filtered)
  app.get('/', async (c) => {
    const auth = c.get('auth')
    const query = listOrdersQuerySchema.parse(c.req.query())
    const result = await listOrders({ db, storeId: auth.storeId, query })
    return c.json(result)
  })

  // ADR-0009: số đơn ngoại tuyến vi phạm chính sách đang chờ duyệt (literal route trước /:id)
  app.get('/pending-review/count', requirePermission('orders.reviewPolicy'), async (c) => {
    const auth = c.get('auth')
    const data = await countPendingReview({ db, storeId: auth.storeId })
    return c.json({ data: { count: data } })
  })

  // GET /:id - Order detail
  app.get('/:id', async (c) => {
    const auth = c.get('auth')
    const id = uuidParam.parse(c.req.param('id'))
    const data = await getOrderDetail({
      db,
      storeId: auth.storeId,
      orderId: id,
      canViewCost: hasPermission(auth.role, 'products.viewCost'),
    })
    return c.json({ data })
  })

  // GET /:id/returnable-items - Items with returned quantities
  app.get('/:id/returnable-items', requirePermission('orders.return'), async (c) => {
    const auth = c.get('auth')
    const id = uuidParam.parse(c.req.param('id'))
    const data = await getReturnableItems({ db, storeId: auth.storeId, orderId: id })
    const prepaymentApplied = await getOrderPrepaymentApplied({
      db,
      storeId: auth.storeId,
      orderId: id,
    })
    return c.json({ data, meta: { prepaymentApplied } })
  })

  // GET /:id/returns - Return history for an order
  app.get('/:id/returns', async (c) => {
    const auth = c.get('auth')
    const id = uuidParam.parse(c.req.param('id'))
    const data = await getOrderReturns({ db, storeId: auth.storeId, orderId: id })
    return c.json({ data })
  })

  // POST /:id/review - Duyệt hoặc từ chối đơn ngoại tuyến vi phạm chính sách (ADR-0009)
  app.post('/:id/review', requirePermission('orders.reviewPolicy'), async (c) => {
    const auth = c.get('auth')
    const id = uuidParam.parse(c.req.param('id'))
    const input = await parseJson(c, reviewOrderSchema)
    const data = await reviewOrder({
      db,
      actor: auth,
      orderId: id,
      input,
      meta: getRequestMeta(c),
    })
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

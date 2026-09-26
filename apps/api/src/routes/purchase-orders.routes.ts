import { Hono } from 'hono'
import { z } from 'zod'

import {
  cancelDocumentSchema,
  createPurchaseOrderSchema,
  createPurchaseReturnSchema,
  listPurchaseOrdersQuerySchema,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { parseJson } from '../lib/http.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { idempotent } from '../middleware/idempotency.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import { getRequestMeta } from '../services/audit.service.js'
import {
  cancelPurchaseOrder,
  createPurchaseReturn,
} from '../services/purchase-order-reversal.service.js'
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
  app.use('*', requireAuth(db))
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

  app.post(
    '/',
    idempotent(db, async (c, transaction) => {
      const auth = c.get('auth')
      const input = await parseJson(c, createPurchaseOrderSchema)
      const data = await createPurchaseOrder({
        db,
        transaction,
        actor: auth,
        input,
        meta: getRequestMeta(c),
      })
      return c.json({ data }, 201)
    }),
  )

  // KHO-11: hủy phiếu nhập, rút lại hàng và công nợ NCC của phiếu
  app.post(
    '/:id/cancel',
    idempotent(db, async (c, transaction) => {
      const auth = c.get('auth')
      const purchaseOrderId = uuidParam.parse(c.req.param('id'))
      const input = await parseJson(c, cancelDocumentSchema)
      const data = await cancelPurchaseOrder({
        db,
        transaction,
        actor: auth,
        purchaseOrderId,
        input,
        meta: getRequestMeta(c),
      })
      return c.json({ data })
    }),
  )

  // KHO-11: trả hàng nhập theo phiếu nhập gốc (chứng từ mới, mã THN- từ bộ đếm)
  app.post(
    '/:id/returns',
    idempotent(db, async (c, transaction) => {
      const auth = c.get('auth')
      const purchaseOrderId = uuidParam.parse(c.req.param('id'))
      const input = await parseJson(c, createPurchaseReturnSchema)
      const data = await createPurchaseReturn({
        db,
        transaction,
        actor: auth,
        purchaseOrderId,
        input,
        meta: getRequestMeta(c),
      })
      return c.json({ data }, 201)
    }),
  )

  return app
}

import { Hono } from 'hono'
import { z } from 'zod'

import { createReceiptSchema, listReceiptsQuerySchema } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { parseJson } from '../lib/http.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import { getRequestMeta } from '../services/audit.service.js'
import {
  createReceipt,
  getReceipt,
  listCustomerOpenDebts,
  listReceipts,
} from '../services/receipts.service.js'

const uuidParam = z.string().uuid('ID không hợp lệ')
const customerIdParam = z.string().uuid('ID khách hàng không hợp lệ')

export interface ReceiptsRoutesDeps {
  db: Db
}

export function createReceiptsRoutes({ db }: ReceiptsRoutesDeps) {
  const app = new Hono()
  app.onError(errorHandler)
  app.use('*', requireAuth)
  app.use('*', requirePermission('customers.manage'))

  app.get('/', async (c) => {
    const auth = c.get('auth')
    const query = listReceiptsQuerySchema.parse(c.req.query())
    const result = await listReceipts({ db, storeId: auth.storeId, query })
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

  // Literal route trước param route (Hono ordering)
  app.get('/customer-debts/:customerId', async (c) => {
    const auth = c.get('auth')
    const customerId = customerIdParam.parse(c.req.param('customerId'))
    const data = await listCustomerOpenDebts({ db, storeId: auth.storeId, customerId })
    return c.json({ data })
  })

  app.get('/:id', async (c) => {
    const auth = c.get('auth')
    const targetId = uuidParam.parse(c.req.param('id'))
    const data = await getReceipt({ db, storeId: auth.storeId, targetId })
    return c.json({ data })
  })

  app.post('/', async (c) => {
    const auth = c.get('auth')
    const input = await parseJson(c, createReceiptSchema)
    const data = await createReceipt({
      db,
      actor: auth,
      input,
      meta: getRequestMeta(c),
    })
    return c.json({ data }, 201)
  })

  return app
}

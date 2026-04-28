import { Hono } from 'hono'
import { z } from 'zod'

import {
  createCustomerSchema,
  listCustomersQuerySchema,
  quickCreateCustomerSchema,
  updateCustomerSchema,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { parseJson } from '../lib/http.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import { getRequestMeta } from '../services/audit.service.js'
import {
  createCustomer,
  deleteCustomer,
  getCustomer,
  listCustomers,
  listTrashedCustomers,
  quickCreateCustomer,
  restoreCustomer,
  updateCustomer,
} from '../services/customers.service.js'

const uuidParam = z.string().uuid('ID không hợp lệ')

export interface CustomersRoutesDeps {
  db: Db
}

export function createCustomersRoutes({ db }: CustomersRoutesDeps) {
  const app = new Hono()
  app.onError(errorHandler)
  app.use('*', requireAuth)
  app.use('*', requirePermission('customers.manage'))

  app.get('/', async (c) => {
    const auth = c.get('auth')
    const query = listCustomersQuerySchema.parse(c.req.query())
    const result = await listCustomers({ db, storeId: auth.storeId, query })
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

  app.get('/trashed', async (c) => {
    const auth = c.get('auth')
    const pageRaw = c.req.query('page')
    const pageSizeRaw = c.req.query('pageSize')
    const page = pageRaw ? Math.max(1, parseInt(pageRaw, 10)) : 1
    const pageSize = pageSizeRaw ? Math.min(100, Math.max(1, parseInt(pageSizeRaw, 10))) : 20
    const result = await listTrashedCustomers({ db, storeId: auth.storeId, page, pageSize })
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

  app.post('/quick-create', async (c) => {
    const auth = c.get('auth')
    const input = await parseJson(c, quickCreateCustomerSchema)
    const data = await quickCreateCustomer({
      db,
      actor: auth,
      input,
      meta: getRequestMeta(c),
    })
    return c.json({ data }, 201)
  })

  app.get('/:id', async (c) => {
    const auth = c.get('auth')
    const targetId = uuidParam.parse(c.req.param('id'))
    const data = await getCustomer({ db, storeId: auth.storeId, targetId })
    return c.json({ data })
  })

  app.post('/', async (c) => {
    const auth = c.get('auth')
    const input = await parseJson(c, createCustomerSchema)
    const data = await createCustomer({
      db,
      actor: auth,
      input,
      meta: getRequestMeta(c),
    })
    return c.json({ data }, 201)
  })

  app.patch('/:id', async (c) => {
    const auth = c.get('auth')
    const targetId = uuidParam.parse(c.req.param('id'))
    const input = await parseJson(c, updateCustomerSchema)
    const data = await updateCustomer({
      db,
      actor: auth,
      targetId,
      input,
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  app.delete('/:id', async (c) => {
    const auth = c.get('auth')
    const targetId = uuidParam.parse(c.req.param('id'))
    const data = await deleteCustomer({
      db,
      actor: auth,
      targetId,
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  app.post('/:id/restore', async (c) => {
    const auth = c.get('auth')
    const targetId = uuidParam.parse(c.req.param('id'))
    const data = await restoreCustomer({
      db,
      actor: auth,
      targetId,
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  return app
}

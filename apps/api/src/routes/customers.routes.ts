import { Hono } from 'hono'
import { z } from 'zod'

import {
  createCustomerSchema,
  listCustomerOrdersQuerySchema,
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
  getCustomerDebts,
  getCustomerStats,
  listCustomerOrders,
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

  app.get('/', requirePermission('customers.view'), async (c) => {
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

  app.get('/trashed', requirePermission('customers.manage'), async (c) => {
    const auth = c.get('auth')
    const pageRaw = c.req.query('page')
    const pageSizeRaw = c.req.query('pageSize')
    const pageNum = pageRaw ? Number.parseInt(pageRaw, 10) : 1
    const pageSizeNum = pageSizeRaw ? Number.parseInt(pageSizeRaw, 10) : 20
    const page = Number.isInteger(pageNum) && pageNum > 0 ? pageNum : 1
    const pageSize =
      Number.isInteger(pageSizeNum) && pageSizeNum > 0 ? Math.min(100, pageSizeNum) : 20
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

  app.post('/quick-create', requirePermission('customers.view'), async (c) => {
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

  app.get('/:id', requirePermission('customers.view'), async (c) => {
    const auth = c.get('auth')
    const targetId = uuidParam.parse(c.req.param('id'))
    const data = await getCustomer({ db, storeId: auth.storeId, targetId })
    return c.json({ data })
  })

  app.post('/', requirePermission('customers.manage'), async (c) => {
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

  app.patch('/:id', requirePermission('customers.manage'), async (c) => {
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

  app.delete('/:id', requirePermission('customers.manage'), async (c) => {
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

  app.post('/:id/restore', requirePermission('customers.manage'), async (c) => {
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

  app.get('/:id/orders', requirePermission('customers.view'), async (c) => {
    const auth = c.get('auth')
    const targetId = uuidParam.parse(c.req.param('id'))
    const query = listCustomerOrdersQuerySchema.parse(c.req.query())
    const result = await listCustomerOrders({
      db,
      storeId: auth.storeId,
      targetId,
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

  app.get('/:id/debts', requirePermission('customers.view'), async (c) => {
    const auth = c.get('auth')
    const targetId = uuidParam.parse(c.req.param('id'))
    const data = await getCustomerDebts({
      db,
      storeId: auth.storeId,
      targetId,
    })
    return c.json({ data })
  })

  app.get('/:id/stats', requirePermission('customers.view'), async (c) => {
    const auth = c.get('auth')
    const targetId = uuidParam.parse(c.req.param('id'))
    const data = await getCustomerStats({
      db,
      storeId: auth.storeId,
      targetId,
    })
    return c.json({ data })
  })

  return app
}

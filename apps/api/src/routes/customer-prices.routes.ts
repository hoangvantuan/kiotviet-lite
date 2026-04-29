import { Hono } from 'hono'
import { z } from 'zod'

import {
  createCustomerPriceSchema,
  listCustomerPricesQuerySchema,
  updateCustomerPriceSchema,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { parseJson } from '../lib/http.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import { getRequestMeta } from '../services/audit.service.js'
import {
  createCustomerPrice,
  deleteCustomerPrice,
  getCustomerPrice,
  listCustomerPrices,
  updateCustomerPrice,
} from '../services/customer-prices.service.js'

const uuidParam = z.string().uuid('ID không hợp lệ')

export interface CustomerPricesRoutesDeps {
  db: Db
}

export function createCustomerPricesRoutes({ db }: CustomerPricesRoutesDeps) {
  const app = new Hono()
  app.onError(errorHandler)
  app.use('*', requireAuth)
  app.use('*', requirePermission('pricing.manage'))

  app.get('/', async (c) => {
    const auth = c.get('auth')
    const query = listCustomerPricesQuerySchema.parse(c.req.query())
    const result = await listCustomerPrices({ db, storeId: auth.storeId, query })
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
    const id = uuidParam.parse(c.req.param('id'))
    const data = await getCustomerPrice({ db, storeId: auth.storeId, id })
    return c.json({ data })
  })

  app.post('/', async (c) => {
    const auth = c.get('auth')
    const input = await parseJson(c, createCustomerPriceSchema)
    const data = await createCustomerPrice({
      db,
      actor: auth,
      input,
      meta: getRequestMeta(c),
    })
    return c.json({ data }, 201)
  })

  app.patch('/:id', async (c) => {
    const auth = c.get('auth')
    const id = uuidParam.parse(c.req.param('id'))
    const input = await parseJson(c, updateCustomerPriceSchema)
    const data = await updateCustomerPrice({
      db,
      actor: auth,
      id,
      input,
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  app.delete('/:id', async (c) => {
    const auth = c.get('auth')
    const id = uuidParam.parse(c.req.param('id'))
    const data = await deleteCustomerPrice({
      db,
      actor: auth,
      id,
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  return app
}

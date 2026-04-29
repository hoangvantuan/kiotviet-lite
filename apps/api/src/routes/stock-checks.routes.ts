import { Hono } from 'hono'
import { z } from 'zod'

import {
  createStockCheckBodySchema,
  listStockChecksQuerySchema,
  updateStockCheckBodySchema,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { parseJson } from '../lib/http.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import { getRequestMeta } from '../services/audit.service.js'
import {
  confirmStockCheck,
  createStockCheck,
  deleteStockCheck,
  getStockCheckById,
  listStockChecks,
  updateStockCheck,
} from '../services/stock-checks.service.js'

const uuidParam = z.string().uuid('ID không hợp lệ')

export interface StockChecksRoutesDeps {
  db: Db
}

export function createStockChecksRoutes({ db }: StockChecksRoutesDeps) {
  const app = new Hono()
  app.onError(errorHandler)
  app.use('*', requireAuth)
  app.use('*', requirePermission('inventory.manage'))

  app.get('/', async (c) => {
    const auth = c.get('auth')
    const query = listStockChecksQuerySchema.parse(c.req.query())
    const result = await listStockChecks({ db, storeId: auth.storeId, query })
    return c.json({
      data: result.items,
      meta: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
        counts: result.counts,
      },
    })
  })

  app.post('/', async (c) => {
    const auth = c.get('auth')
    const input = await parseJson(c, createStockCheckBodySchema)
    const data = await createStockCheck({
      db,
      actor: auth,
      input,
      meta: getRequestMeta(c),
    })
    return c.json({ data }, 201)
  })

  // Mount /:id/confirm BEFORE /:id (although Hono usually handles, defensive)
  app.post('/:id/confirm', async (c) => {
    const auth = c.get('auth')
    const id = uuidParam.parse(c.req.param('id'))
    const data = await confirmStockCheck({
      db,
      actor: auth,
      stockCheckId: id,
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  app.get('/:id', async (c) => {
    const auth = c.get('auth')
    const id = uuidParam.parse(c.req.param('id'))
    const data = await getStockCheckById({ db, storeId: auth.storeId, stockCheckId: id })
    return c.json({ data })
  })

  app.patch('/:id', async (c) => {
    const auth = c.get('auth')
    const id = uuidParam.parse(c.req.param('id'))
    const input = await parseJson(c, updateStockCheckBodySchema)
    const data = await updateStockCheck({
      db,
      actor: auth,
      stockCheckId: id,
      input,
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  app.delete('/:id', async (c) => {
    const auth = c.get('auth')
    const id = uuidParam.parse(c.req.param('id'))
    const data = await deleteStockCheck({
      db,
      actor: auth,
      stockCheckId: id,
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  return app
}

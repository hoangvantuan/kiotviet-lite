import { Hono } from 'hono'
import { z } from 'zod'

import { listVolumePricesQuerySchema, replaceVolumePricesSchema } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { parseJson } from '../lib/http.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import { getRequestMeta } from '../services/audit.service.js'
import {
  listVolumePrices,
  listVolumePricesForProduct,
  replaceVolumePricesForProduct,
} from '../services/volume-prices.service.js'

const uuidParam = z.string().uuid('ID không hợp lệ')

export interface VolumePricesRoutesDeps {
  db: Db
}

export function createVolumePricesRoutes({ db }: VolumePricesRoutesDeps) {
  const app = new Hono()
  app.onError(errorHandler)
  app.use('*', requireAuth)
  app.use('*', requirePermission('pricing.manage'))

  app.get('/', async (c) => {
    const auth = c.get('auth')
    const query = listVolumePricesQuerySchema.parse(c.req.query())
    const result = await listVolumePrices({ db, storeId: auth.storeId, query })
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

  app.get('/products/:productId', async (c) => {
    const auth = c.get('auth')
    const productId = uuidParam.parse(c.req.param('productId'))
    const data = await listVolumePricesForProduct({ db, storeId: auth.storeId, productId })
    return c.json({ data })
  })

  app.put('/products/:productId', async (c) => {
    const auth = c.get('auth')
    const productId = uuidParam.parse(c.req.param('productId'))
    const input = await parseJson(c, replaceVolumePricesSchema)
    const data = await replaceVolumePricesForProduct({
      db,
      actor: auth,
      productId,
      input,
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  return app
}

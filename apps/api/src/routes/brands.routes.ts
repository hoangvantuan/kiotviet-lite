import { Hono } from 'hono'
import { z } from 'zod'

import { createBrandSchema, listBrandsQuerySchema, updateBrandSchema } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { parseJson } from '../lib/http.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import { getRequestMeta } from '../services/audit.service.js'
import {
  createBrand,
  deleteBrand,
  listBrands,
  restoreBrand,
  updateBrand,
} from '../services/brands.service.js'

const uuidParam = z.string().uuid('ID không hợp lệ')

export interface BrandsRoutesDeps {
  db: Db
}
export type BrandsApp = Hono

export function createBrandsRoutes({ db }: BrandsRoutesDeps): BrandsApp {
  const app = new Hono()
  app.onError(errorHandler)
  app.use('*', requireAuth)
  app.use('*', requirePermission('products.manage'))

  app.get('/', async (c) => {
    const { storeId } = c.get('auth')
    const result = await listBrands({
      db,
      storeId,
      query: listBrandsQuerySchema.parse(c.req.query()),
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

  app.post('/', async (c) => {
    const data = await createBrand({
      db,
      actor: c.get('auth'),
      input: await parseJson(c, createBrandSchema),
      meta: getRequestMeta(c),
    })
    return c.json({ data }, 201)
  })

  app.patch('/:id', async (c) => {
    const data = await updateBrand({
      db,
      actor: c.get('auth'),
      targetId: uuidParam.parse(c.req.param('id')),
      input: await parseJson(c, updateBrandSchema),
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  app.delete('/:id', async (c) => {
    const data = await deleteBrand({
      db,
      actor: c.get('auth'),
      targetId: uuidParam.parse(c.req.param('id')),
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  app.post('/:id/restore', async (c) => {
    const data = await restoreBrand({
      db,
      actor: c.get('auth'),
      targetId: uuidParam.parse(c.req.param('id')),
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  return app
}

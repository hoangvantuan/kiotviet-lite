import { Hono } from 'hono'
import { z } from 'zod'

import {
  createProductSchema,
  listProductsQuerySchema,
  updateProductSchema,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { parseJson } from '../lib/http.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import { getRequestMeta } from '../services/audit.service.js'
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  listTrashed,
  restoreProduct,
  updateProduct,
} from '../services/products.service.js'

const uuidParam = z.string().uuid('ID không hợp lệ')

export interface ProductsRoutesDeps {
  db: Db
}

export function createProductsRoutes({ db }: ProductsRoutesDeps) {
  const app = new Hono()
  app.onError(errorHandler)
  app.use('*', requireAuth)
  app.use('*', requirePermission('products.manage'))

  app.get('/', async (c) => {
    const auth = c.get('auth')
    const query = listProductsQuerySchema.parse(c.req.query())
    const result = await listProducts({ db, storeId: auth.storeId, query })
    return c.json({
      data: result.items,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / query.pageSize)),
      },
    })
  })

  // Mount /trashed TRƯỚC /:id để Hono không match :id với literal "trashed"
  app.get('/trashed', async (c) => {
    const auth = c.get('auth')
    const query = listProductsQuerySchema.parse(c.req.query())
    const result = await listTrashed({ db, storeId: auth.storeId, query })
    return c.json({
      data: result.items,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / query.pageSize)),
      },
    })
  })

  app.get('/:id', async (c) => {
    const auth = c.get('auth')
    const id = uuidParam.parse(c.req.param('id'))
    const data = await getProduct({ db, storeId: auth.storeId, productId: id })
    return c.json({ data })
  })

  app.post('/', async (c) => {
    const auth = c.get('auth')
    const input = await parseJson(c, createProductSchema)
    const data = await createProduct({ db, actor: auth, input, meta: getRequestMeta(c) })
    return c.json({ data }, 201)
  })

  app.patch('/:id', async (c) => {
    const auth = c.get('auth')
    const id = uuidParam.parse(c.req.param('id'))
    const input = await parseJson(c, updateProductSchema)
    const data = await updateProduct({
      db,
      actor: auth,
      productId: id,
      input,
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  app.delete('/:id', async (c) => {
    const auth = c.get('auth')
    const id = uuidParam.parse(c.req.param('id'))
    const data = await deleteProduct({
      db,
      actor: auth,
      productId: id,
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  app.post('/:id/restore', async (c) => {
    const auth = c.get('auth')
    const id = uuidParam.parse(c.req.param('id'))
    const data = await restoreProduct({
      db,
      actor: auth,
      productId: id,
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  return app
}

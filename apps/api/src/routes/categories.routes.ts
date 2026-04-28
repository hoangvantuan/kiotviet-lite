import { Hono } from 'hono'
import { z } from 'zod'

import {
  createCategorySchema,
  reorderCategoriesSchema,
  updateCategorySchema,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { parseJson } from '../lib/http.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import { getRequestMeta } from '../services/audit.service.js'
import {
  createCategory,
  deleteCategory,
  listCategories,
  reorderCategories,
  updateCategory,
} from '../services/categories.service.js'

const uuidParam = z.string().uuid('ID không hợp lệ')

export interface CategoriesRoutesDeps {
  db: Db
}

export function createCategoriesRoutes({ db }: CategoriesRoutesDeps) {
  const app = new Hono()
  app.onError(errorHandler)
  app.use('*', requireAuth)
  app.use('*', requirePermission('products.manage'))

  app.get('/', async (c) => {
    const auth = c.get('auth')
    const data = await listCategories({ db, storeId: auth.storeId })
    return c.json({ data })
  })

  app.post('/', async (c) => {
    const auth = c.get('auth')
    const input = await parseJson(c, createCategorySchema)
    const data = await createCategory({
      db,
      actor: auth,
      input,
      meta: getRequestMeta(c),
    })
    return c.json({ data }, 201)
  })

  app.post('/reorder', async (c) => {
    const auth = c.get('auth')
    const input = await parseJson(c, reorderCategoriesSchema)
    const data = await reorderCategories({
      db,
      actor: auth,
      input,
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  app.patch('/:id', async (c) => {
    const auth = c.get('auth')
    const targetId = uuidParam.parse(c.req.param('id'))
    const input = await parseJson(c, updateCategorySchema)
    const data = await updateCategory({
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
    const data = await deleteCategory({
      db,
      actor: auth,
      targetId,
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  return app
}

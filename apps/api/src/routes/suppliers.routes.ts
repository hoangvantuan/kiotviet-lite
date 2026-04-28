import { Hono } from 'hono'
import { z } from 'zod'

import {
  createSupplierSchema,
  listSuppliersQuerySchema,
  updateSupplierSchema,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { parseJson } from '../lib/http.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import { getRequestMeta } from '../services/audit.service.js'
import {
  createSupplier,
  deleteSupplier,
  getSupplier,
  listSuppliers,
  listTrashedSuppliers,
  restoreSupplier,
  updateSupplier,
} from '../services/suppliers.service.js'

const uuidParam = z.string().uuid('ID không hợp lệ')

export interface SuppliersRoutesDeps {
  db: Db
}

export function createSuppliersRoutes({ db }: SuppliersRoutesDeps) {
  const app = new Hono()
  app.onError(errorHandler)
  app.use('*', requireAuth)
  app.use('*', requirePermission('inventory.manage'))

  app.get('/', async (c) => {
    const auth = c.get('auth')
    const query = listSuppliersQuerySchema.parse(c.req.query())
    const result = await listSuppliers({ db, storeId: auth.storeId, query })
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
    const pageSize = pageSizeRaw ? Math.min(100, Math.max(1, parseInt(pageSizeRaw, 10))) : 50
    const result = await listTrashedSuppliers({ db, storeId: auth.storeId, page, pageSize })
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
    const targetId = uuidParam.parse(c.req.param('id'))
    const data = await getSupplier({ db, storeId: auth.storeId, targetId })
    return c.json({ data })
  })

  app.post('/', async (c) => {
    const auth = c.get('auth')
    const input = await parseJson(c, createSupplierSchema)
    const data = await createSupplier({
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
    const input = await parseJson(c, updateSupplierSchema)
    const data = await updateSupplier({
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
    const data = await deleteSupplier({
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
    const data = await restoreSupplier({
      db,
      actor: auth,
      targetId,
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  return app
}

import { Hono } from 'hono'
import { z } from 'zod'

import {
  createPriceListItemSchema,
  createPriceListSchema,
  listPriceListItemsQuerySchema,
  listPriceListsQuerySchema,
  listTrashedPriceListsQuerySchema,
  updatePriceListItemSchema,
  updatePriceListSchema,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { parseJson } from '../lib/http.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import { getRequestMeta } from '../services/audit.service.js'
import {
  createPriceListItem,
  deletePriceListItem,
  listPriceListItems,
  updatePriceListItem,
} from '../services/price-list-items.service.js'
import {
  createPriceList,
  deletePriceList,
  getPriceList,
  listPriceLists,
  listTrashedPriceLists,
  recalculatePriceList,
  restorePriceList,
  updatePriceList,
} from '../services/price-lists.service.js'

const uuidParam = z.string().uuid('ID không hợp lệ')

export interface PriceListsRoutesDeps {
  db: Db
}

export function createPriceListsRoutes({ db }: PriceListsRoutesDeps) {
  const app = new Hono()
  app.onError(errorHandler)
  app.use('*', requireAuth)
  app.use('*', requirePermission('pricing.manage'))

  app.get('/', async (c) => {
    const auth = c.get('auth')
    const query = listPriceListsQuerySchema.parse(c.req.query())
    const result = await listPriceLists({ db, storeId: auth.storeId, query })
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
    const { page, pageSize } = listTrashedPriceListsQuerySchema.parse(c.req.query())
    const result = await listTrashedPriceLists({ db, storeId: auth.storeId, page, pageSize })
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
    const data = await getPriceList({ db, storeId: auth.storeId, targetId })
    return c.json({ data })
  })

  app.get('/:id/items', async (c) => {
    const auth = c.get('auth')
    const priceListId = uuidParam.parse(c.req.param('id'))
    const query = listPriceListItemsQuerySchema.parse(c.req.query())
    const result = await listPriceListItems({
      db,
      storeId: auth.storeId,
      priceListId,
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

  app.post('/', async (c) => {
    const auth = c.get('auth')
    const input = await parseJson(c, createPriceListSchema)
    const data = await createPriceList({ db, actor: auth, input, meta: getRequestMeta(c) })
    return c.json({ data }, 201)
  })

  app.patch('/:id', async (c) => {
    const auth = c.get('auth')
    const targetId = uuidParam.parse(c.req.param('id'))
    const input = await parseJson(c, updatePriceListSchema)
    const data = await updatePriceList({
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
    const data = await deletePriceList({
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
    const data = await restorePriceList({
      db,
      actor: auth,
      targetId,
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  app.post('/:id/recalculate', async (c) => {
    const auth = c.get('auth')
    const targetId = uuidParam.parse(c.req.param('id'))
    const data = await recalculatePriceList({
      db,
      actor: auth,
      targetId,
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  app.post('/:id/items', async (c) => {
    const auth = c.get('auth')
    const priceListId = uuidParam.parse(c.req.param('id'))
    const input = await parseJson(c, createPriceListItemSchema)
    const data = await createPriceListItem({
      db,
      actor: auth,
      priceListId,
      input,
      meta: getRequestMeta(c),
    })
    return c.json({ data }, 201)
  })

  app.patch('/:id/items/:itemId', async (c) => {
    const auth = c.get('auth')
    const priceListId = uuidParam.parse(c.req.param('id'))
    const itemId = uuidParam.parse(c.req.param('itemId'))
    const input = await parseJson(c, updatePriceListItemSchema)
    const data = await updatePriceListItem({
      db,
      actor: auth,
      priceListId,
      itemId,
      input,
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  app.delete('/:id/items/:itemId', async (c) => {
    const auth = c.get('auth')
    const priceListId = uuidParam.parse(c.req.param('id'))
    const itemId = uuidParam.parse(c.req.param('itemId'))
    const data = await deletePriceListItem({
      db,
      actor: auth,
      priceListId,
      itemId,
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  return app
}

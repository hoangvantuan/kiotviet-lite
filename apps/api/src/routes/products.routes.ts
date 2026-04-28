import { Hono } from 'hono'
import { z } from 'zod'

import {
  createProductSchema,
  listInventoryTransactionsQuerySchema,
  listProductsQuerySchema,
  recordManualAdjustInputSchema,
  recordPurchaseInputSchema,
  unitConversionInputSchema,
  unitConversionUpdateSchema,
  updateProductSchema,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { parseJson } from '../lib/http.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import { getRequestMeta } from '../services/audit.service.js'
import {
  getLowStockCount,
  listInventoryTransactions,
  listLowStockProducts,
  recordManualAdjustment,
  recordPurchaseTransaction,
} from '../services/inventory-transactions.service.js'
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  listTrashed,
  restoreProduct,
  updateProduct,
} from '../services/products.service.js'
import {
  createUnitConversion,
  deleteUnitConversion,
  listUnitConversions,
  updateUnitConversion,
} from '../services/unit-conversions.service.js'

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

  // Story 2.4 - mount BEFORE /:id (literal paths)
  app.get('/low-stock-count', async (c) => {
    const auth = c.get('auth')
    const count = await getLowStockCount({ db, storeId: auth.storeId })
    return c.json({ data: { count } })
  })

  app.get('/low-stock', async (c) => {
    const auth = c.get('auth')
    const pageRaw = c.req.query('page')
    const pageSizeRaw = c.req.query('pageSize')
    const page = pageRaw ? Math.max(1, parseInt(pageRaw, 10)) : 1
    const pageSize = pageSizeRaw ? Math.min(100, Math.max(1, parseInt(pageSizeRaw, 10))) : 50
    const result = await listLowStockProducts({ db, storeId: auth.storeId, page, pageSize })
    return c.json({
      data: result.items,
      meta: {
        page,
        pageSize,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / pageSize)),
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

  // ========== Story 2.4: Unit conversions CRUD ==========

  app.get('/:productId/unit-conversions', async (c) => {
    const auth = c.get('auth')
    const productId = uuidParam.parse(c.req.param('productId'))
    const items = await listUnitConversions({ db, storeId: auth.storeId, productId })
    return c.json({ data: items })
  })

  app.post('/:productId/unit-conversions', async (c) => {
    const auth = c.get('auth')
    const productId = uuidParam.parse(c.req.param('productId'))
    const input = await parseJson(c, unitConversionInputSchema)
    const data = await createUnitConversion({
      db,
      actor: auth,
      productId,
      input,
      meta: getRequestMeta(c),
    })
    return c.json({ data }, 201)
  })

  app.patch('/:productId/unit-conversions/:conversionId', async (c) => {
    const auth = c.get('auth')
    const productId = uuidParam.parse(c.req.param('productId'))
    const conversionId = uuidParam.parse(c.req.param('conversionId'))
    const input = await parseJson(c, unitConversionUpdateSchema)
    const data = await updateUnitConversion({
      db,
      actor: auth,
      productId,
      conversionId,
      input,
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  app.delete('/:productId/unit-conversions/:conversionId', async (c) => {
    const auth = c.get('auth')
    const productId = uuidParam.parse(c.req.param('productId'))
    const conversionId = uuidParam.parse(c.req.param('conversionId'))
    await deleteUnitConversion({
      db,
      actor: auth,
      productId,
      conversionId,
      meta: getRequestMeta(c),
    })
    return c.body(null, 204)
  })

  // ========== Story 2.4: Inventory helpers ==========
  // HELPER for Story 2.4 — replaced by Story 6.1 purchase order endpoint

  app.post('/:productId/inventory/purchase', async (c) => {
    const auth = c.get('auth')
    const productId = uuidParam.parse(c.req.param('productId'))
    const input = await parseJson(c, recordPurchaseInputSchema)
    const data = await recordPurchaseTransaction({
      db,
      actor: auth,
      productId,
      input,
      meta: getRequestMeta(c),
    })
    return c.json({ data }, 201)
  })

  app.post('/:productId/inventory/adjust', async (c) => {
    const auth = c.get('auth')
    const productId = uuidParam.parse(c.req.param('productId'))
    const input = await parseJson(c, recordManualAdjustInputSchema)
    const data = await recordManualAdjustment({
      db,
      actor: auth,
      productId,
      input,
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  app.get('/:productId/inventory-transactions', async (c) => {
    const auth = c.get('auth')
    const productId = uuidParam.parse(c.req.param('productId'))
    const query = listInventoryTransactionsQuerySchema.parse(c.req.query())
    const result = await listInventoryTransactions({
      db,
      storeId: auth.storeId,
      productId,
      query,
    })
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

  return app
}

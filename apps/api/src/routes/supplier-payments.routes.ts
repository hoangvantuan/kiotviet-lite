import { Hono } from 'hono'
import { z } from 'zod'

import { createSupplierPaymentSchema, listSupplierPaymentsQuerySchema } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { parseJson } from '../lib/http.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import { getRequestMeta } from '../services/audit.service.js'
import {
  createSupplierPayment,
  getSupplierPayment,
  listSupplierPayments,
} from '../services/supplier-payments.service.js'

const uuidParam = z.string().uuid('ID không hợp lệ')

export interface SupplierPaymentsRoutesDeps {
  db: Db
}

export function createSupplierPaymentsRoutes({ db }: SupplierPaymentsRoutesDeps) {
  const app = new Hono()
  app.onError(errorHandler)
  app.use('*', requireAuth)
  app.use('*', requirePermission('inventory.manage'))

  app.get('/', async (c) => {
    const auth = c.get('auth')
    const query = listSupplierPaymentsQuerySchema.parse(c.req.query())
    const result = await listSupplierPayments({ db, storeId: auth.storeId, query })
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
    const data = await getSupplierPayment({ db, storeId: auth.storeId, targetId })
    return c.json({ data })
  })

  app.post('/', async (c) => {
    const auth = c.get('auth')
    // Layer 2: route inline check (chỉ Owner mới tạo được)
    if (auth.role !== 'owner') {
      throw new ApiError('FORBIDDEN', 'Chỉ chủ cửa hàng mới được tạo phiếu chi')
    }
    const input = await parseJson(c, createSupplierPaymentSchema)
    const data = await createSupplierPayment({
      db,
      actor: auth,
      input,
      meta: getRequestMeta(c),
    })
    return c.json({ data }, 201)
  })

  return app
}

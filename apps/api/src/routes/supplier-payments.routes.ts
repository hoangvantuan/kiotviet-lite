import { Hono } from 'hono'
import { z } from 'zod'

import {
  cancelDocumentSchema,
  createSupplierPaymentSchema,
  listSupplierPaymentsQuerySchema,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { parseJson } from '../lib/http.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { idempotent } from '../middleware/idempotency.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import { getRequestMeta } from '../services/audit.service.js'
import {
  cancelSupplierPayment,
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
  app.use('*', requireAuth(db))
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

  app.post(
    '/',
    idempotent(db, async (c, transaction) => {
      const auth = c.get('auth')
      // Layer 2: route inline check (chỉ Owner mới tạo được)
      if (auth.role !== 'owner') {
        throw new ApiError('FORBIDDEN', 'Chỉ chủ cửa hàng mới được tạo phiếu chi')
      }
      const input = await parseJson(c, createSupplierPaymentSchema)
      const data = await createSupplierPayment({
        db,
        transaction,
        actor: auth,
        input,
        meta: getRequestMeta(c),
      })
      return c.json({ data }, 201)
    }),
  )

  // TIEN-107: hủy phiếu chi, chỉ chủ cửa hàng (như lập phiếu chi)
  app.post(
    '/:id/cancel',
    idempotent(db, async (c, transaction) => {
      const auth = c.get('auth')
      if (auth.role !== 'owner') {
        throw new ApiError('FORBIDDEN', 'Chỉ chủ cửa hàng mới được hủy phiếu chi')
      }
      const paymentId = uuidParam.parse(c.req.param('id'))
      const input = await parseJson(c, cancelDocumentSchema)
      const data = await cancelSupplierPayment({
        db,
        transaction,
        actor: auth,
        paymentId,
        input,
        meta: getRequestMeta(c),
      })
      return c.json({ data })
    }),
  )

  return app
}

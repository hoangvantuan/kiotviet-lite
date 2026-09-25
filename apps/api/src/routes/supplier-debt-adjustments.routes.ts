import { Hono } from 'hono'
import { z } from 'zod'

import {
  createOpeningDebtSchema,
  createSupplierDebtAdjustmentSchema,
  listSupplierDebtAdjustmentsQuerySchema,
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
  createSupplierDebtAdjustment,
  createSupplierOpeningDebt,
  listSupplierDebtAdjustments,
} from '../services/supplier-debt-adjustments.service.js'

export function createSupplierDebtAdjustmentsRoutes({ db }: { db: Db }) {
  const app = new Hono()
  app.onError(errorHandler)
  app.use('*', requireAuth(db))
  app.use('*', requirePermission('inventory.manage'))

  app.get('/', async (c) => {
    const auth = c.get('auth')
    const query = listSupplierDebtAdjustmentsQuerySchema.parse(c.req.query())
    const result = await listSupplierDebtAdjustments({ db, storeId: auth.storeId, query })
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

  app.post(
    '/',
    idempotent(db, async (c, transaction) => {
      const auth = c.get('auth')
      if (auth.role !== 'owner')
        throw new ApiError('FORBIDDEN', 'Chỉ chủ cửa hàng mới được điều chỉnh công nợ nhà cung cấp')
      const input = await parseJson(c, createSupplierDebtAdjustmentSchema)
      const data = await createSupplierDebtAdjustment({
        db,
        transaction,
        actor: auth,
        input,
        meta: getRequestMeta(c),
      })
      return c.json({ data }, 201)
    }),
  )

  app.post(
    '/:id/opening-debt',
    idempotent(db, async (c, transaction) => {
      const auth = c.get('auth')
      if (auth.role !== 'owner')
        throw new ApiError('FORBIDDEN', 'Chỉ chủ cửa hàng mới được nạp nợ đầu kỳ')
      const supplierId = z.string().uuid('ID không hợp lệ').parse(c.req.param('id'))
      const input = await parseJson(c, createOpeningDebtSchema)
      const data = await createSupplierOpeningDebt({
        db,
        transaction,
        actor: auth,
        supplierId,
        input,
        meta: getRequestMeta(c),
      })
      return c.json({ data }, 201)
    }),
  )
  return app
}

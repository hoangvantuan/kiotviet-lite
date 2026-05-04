import { Hono } from 'hono'

import { createDebtAdjustmentSchema, listDebtAdjustmentsQuerySchema } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { parseJson } from '../lib/http.js'
import { ApiError } from '../lib/errors.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import { getRequestMeta } from '../services/audit.service.js'
import {
  createDebtAdjustment,
  listDebtAdjustments,
} from '../services/debt-adjustments.service.js'

export interface DebtAdjustmentsRoutesDeps {
  db: Db
}

export function createDebtAdjustmentsRoutes({ db }: DebtAdjustmentsRoutesDeps) {
  const app = new Hono()
  app.onError(errorHandler)
  app.use('*', requireAuth)
  app.use('*', requirePermission('customers.manage'))

  app.get('/', async (c) => {
    const auth = c.get('auth')
    const query = listDebtAdjustmentsQuerySchema.parse(c.req.query())
    const result = await listDebtAdjustments({ db, storeId: auth.storeId, query })
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
    if (auth.role !== 'owner') {
      throw new ApiError('FORBIDDEN', 'Chỉ chủ cửa hàng mới được điều chỉnh nợ')
    }
    const input = await parseJson(c, createDebtAdjustmentSchema)
    const data = await createDebtAdjustment({
      db,
      actor: auth,
      input,
      meta: getRequestMeta(c),
    })
    return c.json({ data }, 201)
  })

  return app
}

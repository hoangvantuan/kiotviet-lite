import { Hono } from 'hono'

import { cashFlowReportQuerySchema } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import { getCashFlowReport } from '../services/cash-flow-report.service.js'

export interface CashReportsRoutesDeps {
  db: Db
}

/** BC-06: báo cáo dòng tiền theo phương thức, đối soát tiền mặt cuối ngày. */
export function createCashReportsRoutes({ db }: CashReportsRoutesDeps) {
  const app = new Hono()
  app.onError(errorHandler)
  app.use('*', requireAuth(db), requirePermission('reports.view'))

  app.get('/cash-flow', async (c) => {
    const auth = c.get('auth')
    const query = cashFlowReportQuerySchema.parse(c.req.query())
    const data = await getCashFlowReport({ db, storeId: auth.storeId, query })
    return c.json({ data })
  })

  return app
}

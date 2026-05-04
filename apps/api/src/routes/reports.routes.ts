import { Hono } from 'hono'

import { debtAgingQuerySchema, debtSummaryQuerySchema } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import {
  buildAgingCsv,
  buildSummaryCsv,
  getDebtAgingReport,
  getDebtSummaryReport,
} from '../services/reports.service.js'

export function createReportsRoutes({ db }: { db: Db }) {
  const app = new Hono()

  app.use('*', requireAuth, requirePermission('reports.view'))

  app.get('/debt-aging', async (c) => {
    const auth = c.get('auth')
    const raw = { from: c.req.query('from'), to: c.req.query('to') }
    const query = debtAgingQuerySchema.parse({
      from: raw.from || undefined,
      to: raw.to || undefined,
    })
    const data = await getDebtAgingReport({ db, storeId: auth.storeId, query })
    return c.json({ data })
  })

  app.get('/debt-aging/csv', async (c) => {
    const auth = c.get('auth')
    const raw = { from: c.req.query('from'), to: c.req.query('to') }
    const query = debtAgingQuerySchema.parse({
      from: raw.from || undefined,
      to: raw.to || undefined,
    })
    const report = await getDebtAgingReport({ db, storeId: auth.storeId, query })
    const csv = buildAgingCsv(report)
    const today = new Date().toISOString().slice(0, 10)
    c.header('Content-Type', 'text/csv; charset=utf-8')
    c.header('Content-Disposition', `attachment; filename="bao-cao-tuoi-no-${today}.csv"`)
    return c.body(csv)
  })

  app.get('/debt-summary', async (c) => {
    const auth = c.get('auth')
    const raw = { from: c.req.query('from'), to: c.req.query('to') }
    const query = debtSummaryQuerySchema.parse({
      from: raw.from || undefined,
      to: raw.to || undefined,
    })
    const data = await getDebtSummaryReport({ db, storeId: auth.storeId, query })
    return c.json({ data })
  })

  app.get('/debt-summary/csv', async (c) => {
    const auth = c.get('auth')
    const raw = { from: c.req.query('from'), to: c.req.query('to') }
    const query = debtSummaryQuerySchema.parse({
      from: raw.from || undefined,
      to: raw.to || undefined,
    })
    const report = await getDebtSummaryReport({ db, storeId: auth.storeId, query })
    const csv = buildSummaryCsv(report)
    const today = new Date().toISOString().slice(0, 10)
    c.header('Content-Type', 'text/csv; charset=utf-8')
    c.header('Content-Disposition', `attachment; filename="bao-cao-tong-hop-cong-no-${today}.csv"`)
    return c.body(csv)
  })

  return app
}

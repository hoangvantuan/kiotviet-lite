import { Hono } from 'hono'

import { auditLogQuerySchema } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { formatZodIssues } from '../lib/http.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import { listAudit } from '../services/audit.service.js'

export interface AuditRoutesDeps {
  db: Db
}

export function createAuditRoutes({ db }: AuditRoutesDeps) {
  const app = new Hono()
  app.onError(errorHandler)

  app.use('*', requireAuth)

  app.get('/', requirePermission('audit.viewOwn'), async (c) => {
    const auth = c.get('auth')
    const rawQuery = c.req.queries()
    const flat: Record<string, string | string[]> = {}
    for (const [key, values] of Object.entries(rawQuery)) {
      if (!values || values.length === 0) continue
      flat[key] = values.length === 1 ? (values[0] as string) : values
    }
    const parsed = auditLogQuerySchema.safeParse(flat)
    if (!parsed.success) {
      throw new ApiError('VALIDATION_ERROR', 'Tham số không hợp lệ', formatZodIssues(parsed.error))
    }
    const result = await listAudit({
      db,
      actor: auth,
      query: parsed.data,
    })
    return c.json({ data: result })
  })

  return app
}

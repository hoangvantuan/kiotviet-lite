import { Hono } from 'hono'

import { updatePrintSettingsSchema } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { parseJson } from '../lib/http.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import { getRequestMeta } from '../services/audit.service.js'
import {
  getPrintSettings,
  upsertPrintSettings,
} from '../services/print-settings.service.js'

export interface PrintSettingsRoutesDeps {
  db: Db
}

export function createPrintSettingsRoutes({ db }: PrintSettingsRoutesDeps) {
  const app = new Hono()
  app.onError(errorHandler)

  app.use('*', requireAuth)

  app.get('/', async (c) => {
    const auth = c.get('auth')
    const data = await getPrintSettings(db, auth.storeId)
    return c.json({ data })
  })

  app.put('/', requirePermission('store.manage'), async (c) => {
    const auth = c.get('auth')
    const input = await parseJson(c, updatePrintSettingsSchema)
    const data = await upsertPrintSettings({
      db,
      actor: { userId: auth.userId, storeId: auth.storeId },
      input,
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  return app
}

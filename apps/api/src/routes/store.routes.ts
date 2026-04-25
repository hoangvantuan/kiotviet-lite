import { Hono } from 'hono'

import { updateStoreSchema } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { parseJson } from '../lib/http.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import { getRequestMeta } from '../services/audit.service.js'
import { getStore, updateStore } from '../services/store.service.js'

export interface StoreRoutesDeps {
  db: Db
}

export function createStoreRoutes({ db }: StoreRoutesDeps) {
  const app = new Hono()
  app.onError(errorHandler)

  app.use('*', requireAuth)

  app.get('/', async (c) => {
    const auth = c.get('auth')
    const data = await getStore({ db, storeId: auth.storeId })
    return c.json({ data })
  })

  app.patch('/', requirePermission('store.manage'), async (c) => {
    const auth = c.get('auth')
    const input = await parseJson(c, updateStoreSchema)
    const data = await updateStore({
      db,
      actor: { userId: auth.userId, storeId: auth.storeId },
      input,
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  return app
}

import { Hono } from 'hono'
import { z } from 'zod'

import { createCustomerGroupSchema, updateCustomerGroupSchema } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { parseJson } from '../lib/http.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import { getRequestMeta } from '../services/audit.service.js'
import {
  createCustomerGroup,
  deleteCustomerGroup,
  getCustomerGroup,
  listCustomerGroups,
  updateCustomerGroup,
} from '../services/customer-groups.service.js'

const uuidParam = z.string().uuid('ID không hợp lệ')

export interface CustomerGroupsRoutesDeps {
  db: Db
}

export function createCustomerGroupsRoutes({ db }: CustomerGroupsRoutesDeps) {
  const app = new Hono()
  app.onError(errorHandler)
  app.use('*', requireAuth)
  app.use('*', requirePermission('customers.manage'))

  app.get('/', async (c) => {
    const auth = c.get('auth')
    const data = await listCustomerGroups({ db, storeId: auth.storeId })
    return c.json({ data })
  })

  app.get('/:id', async (c) => {
    const auth = c.get('auth')
    const targetId = uuidParam.parse(c.req.param('id'))
    const data = await getCustomerGroup({ db, storeId: auth.storeId, targetId })
    return c.json({ data })
  })

  app.post('/', async (c) => {
    const auth = c.get('auth')
    const input = await parseJson(c, createCustomerGroupSchema)
    const data = await createCustomerGroup({
      db,
      actor: auth,
      input,
      meta: getRequestMeta(c),
    })
    return c.json({ data }, 201)
  })

  app.patch('/:id', async (c) => {
    const auth = c.get('auth')
    const targetId = uuidParam.parse(c.req.param('id'))
    const input = await parseJson(c, updateCustomerGroupSchema)
    const data = await updateCustomerGroup({
      db,
      actor: auth,
      targetId,
      input,
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  app.delete('/:id', async (c) => {
    const auth = c.get('auth')
    const targetId = uuidParam.parse(c.req.param('id'))
    const data = await deleteCustomerGroup({
      db,
      actor: auth,
      targetId,
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  return app
}

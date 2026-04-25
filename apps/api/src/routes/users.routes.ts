import { Hono } from 'hono'
import { z } from 'zod'

import { createUserSchema, updateUserSchema, verifyPinSchema } from '@kiotviet-lite/shared'

const uuidParam = z.string().uuid('ID không hợp lệ')

import type { Db } from '../db/index.js'
import { parseJson } from '../lib/http.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import { getRequestMeta } from '../services/audit.service.js'
import { verifyPin } from '../services/pin.service.js'
import {
  createUser,
  listUsers,
  lockUser,
  unlockUser,
  updateUser,
} from '../services/users.service.js'

export interface UsersRoutesDeps {
  db: Db
}

export function createUsersRoutes({ db }: UsersRoutesDeps) {
  const app = new Hono()
  app.onError(errorHandler)

  app.use('*', requireAuth)

  app.post('/verify-pin', async (c) => {
    const auth = c.get('auth')
    const input = await parseJson(c, verifyPinSchema)
    const result = await verifyPin({
      db,
      userId: auth.userId,
      storeId: auth.storeId,
      pin: input.pin,
      meta: getRequestMeta(c),
    })
    return c.json({ data: result })
  })

  app.get('/', requirePermission('users.manage'), async (c) => {
    const auth = c.get('auth')
    const data = await listUsers({ db, storeId: auth.storeId })
    return c.json({ data })
  })

  app.post('/', requirePermission('users.manage'), async (c) => {
    const auth = c.get('auth')
    const input = await parseJson(c, createUserSchema)
    const data = await createUser({
      db,
      actor: auth,
      input,
      meta: getRequestMeta(c),
    })
    return c.json({ data }, 201)
  })

  app.patch('/:id', requirePermission('users.manage'), async (c) => {
    const auth = c.get('auth')
    const targetId = uuidParam.parse(c.req.param('id'))
    const input = await parseJson(c, updateUserSchema)
    const data = await updateUser({
      db,
      actor: auth,
      targetId,
      input,
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  app.post('/:id/lock', requirePermission('users.manage'), async (c) => {
    const auth = c.get('auth')
    const targetId = uuidParam.parse(c.req.param('id'))
    const data = await lockUser({
      db,
      actor: auth,
      targetId,
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  app.post('/:id/unlock', requirePermission('users.manage'), async (c) => {
    const auth = c.get('auth')
    const targetId = uuidParam.parse(c.req.param('id'))
    const data = await unlockUser({
      db,
      actor: auth,
      targetId,
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  return app
}

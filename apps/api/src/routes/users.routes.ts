import { Hono } from 'hono'
import { z } from 'zod'

import { createUserSchema, updateUserSchema, verifyPinSchema } from '@kiotviet-lite/shared'

const uuidParam = z.string().uuid('ID không hợp lệ')

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { parseJson } from '../lib/http.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { createUserRateLimit } from '../middleware/rate-limit.middleware.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import { getRequestMeta } from '../services/audit.service.js'
import { verifyApproval } from '../services/order-policy.js'
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

  app.use('*', requireAuth(db))

  app.post('/verify-pin', async (c) => {
    const auth = c.get('auth')
    const input = await parseJson(c, verifyPinSchema)
    const meta = getRequestMeta(c)
    if (input.userId || input.permissions?.length) {
      const permissions = input.permissions ?? []
      if (input.userId && input.userId !== auth.userId && permissions.length === 0) {
        // Schema đã chặn; giữ lại để route không bao giờ kiểm PIN người khác mà không nêu quyền
        throw new ApiError('VALIDATION_ERROR', 'Kiểm PIN người duyệt cần nêu quyền cần duyệt')
      }
      // Kiểm PIN người duyệt: cùng cửa hàng, có đủ quyền được yêu cầu, qua bộ chặn dò PIN
      const approver = await verifyApproval({
        db,
        storeId: auth.storeId,
        approverUserId: input.userId ?? auth.userId,
        pin: input.pin,
        permissions,
        requester: { userId: auth.userId, ipAddress: meta.ipAddress },
        meta,
      })
      return c.json({ data: { ok: true as const, approver } })
    }
    const result = await verifyPin({
      db,
      userId: auth.userId,
      storeId: auth.storeId,
      pin: input.pin,
      meta,
    })
    return c.json({ data: result })
  })

  app.get('/', requirePermission('users.manage'), async (c) => {
    const auth = c.get('auth')
    const data = await listUsers({ db, storeId: auth.storeId })
    return c.json({ data })
  })

  app.post('/', requirePermission('users.manage'), createUserRateLimit, async (c) => {
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

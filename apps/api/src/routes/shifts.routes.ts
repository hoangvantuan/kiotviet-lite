import { Hono } from 'hono'
import { z } from 'zod'

import { closeShiftSchema, listShiftsQuerySchema, openShiftSchema } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { parseJson } from '../lib/http.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { idempotent } from '../middleware/idempotency.js'
import { getRequestMeta } from '../services/audit.service.js'
import {
  closeShift,
  getCurrentShift,
  getShift,
  listShifts,
  openShift,
} from '../services/shifts.service.js'

const uuidParam = z.string().uuid('ID không hợp lệ')

export interface ShiftsRoutesDeps {
  db: Db
}

/**
 * POS-06: mọi người bán mở và đóng ca của mình. Xem ca người khác và đóng ca thay cần
 * 'shifts.manage', service tự lọc theo quyền.
 */
export function createShiftsRoutes({ db }: ShiftsRoutesDeps) {
  const app = new Hono()
  app.onError(errorHandler)
  app.use('*', requireAuth(db))

  app.get('/', async (c) => {
    const auth = c.get('auth')
    const query = listShiftsQuerySchema.parse(c.req.query())
    const result = await listShifts({ db, actor: auth, query })
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

  // Literal route trước param route (Hono ordering)
  app.get('/current', async (c) => {
    const auth = c.get('auth')
    const data = await getCurrentShift({ db, actor: auth })
    return c.json({ data })
  })

  app.post(
    '/open',
    idempotent(db, async (c, transaction) => {
      const auth = c.get('auth')
      const input = await parseJson(c, openShiftSchema)
      const data = await openShift({ db, transaction, actor: auth, input, meta: getRequestMeta(c) })
      return c.json({ data }, 201)
    }),
  )

  app.get('/:id', async (c) => {
    const auth = c.get('auth')
    const shiftId = uuidParam.parse(c.req.param('id'))
    const data = await getShift({ db, actor: auth, shiftId })
    return c.json({ data })
  })

  app.post(
    '/:id/close',
    idempotent(db, async (c, transaction) => {
      const auth = c.get('auth')
      const shiftId = uuidParam.parse(c.req.param('id'))
      const input = await parseJson(c, closeShiftSchema)
      const data = await closeShift({
        db,
        transaction,
        actor: auth,
        shiftId,
        input,
        meta: getRequestMeta(c),
      })
      return c.json({ data })
    }),
  )

  return app
}

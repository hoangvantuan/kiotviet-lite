import { type DeliveryResult, notify } from '@kiotviet-lite/notifications'
import { Hono } from 'hono'
import { rateLimiter } from 'hono-rate-limiter'
import { uuidv7 } from 'uuidv7'
import { z } from 'zod'

import { notificationSeverityValues, notificationTypeValues } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { env } from '../lib/env.js'
import { parseJson } from '../lib/http.js'
import { logger } from '../lib/logger.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { requirePermission } from '../middleware/rbac.middleware.js'

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 60

const emitRateLimiter = rateLimiter({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMIT_MAX,
  keyGenerator: (c) =>
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'anonymous',
  standardHeaders: 'draft-7',
})

const MAX_CONTEXT_SIZE = 10_240
const MAX_CONTEXT_DEPTH = 3

function getMaxDepth(obj: unknown, current = 0, visited = new WeakSet<object>()): number {
  if (current > MAX_CONTEXT_DEPTH) return current
  if (typeof obj !== 'object' || obj === null) return current
  if (visited.has(obj)) return current
  visited.add(obj)
  return Math.max(current, ...Object.values(obj).map((v) => getMaxDepth(v, current + 1, visited)))
}

const emitInputSchema = z
  .object({
    type: z.enum(notificationTypeValues),
    severity: z.enum(notificationSeverityValues),
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(2000),
    context: z
      .record(z.unknown())
      .optional()
      .refine(
        (ctx) => {
          if (!ctx) return true
          if (JSON.stringify(ctx).length > MAX_CONTEXT_SIZE) return false
          if (getMaxDepth(ctx) > MAX_CONTEXT_DEPTH) return false
          return true
        },
        { message: 'context too large or too deeply nested (max 10KB, max 3 levels)' },
      ),
  })
  .strict()

export interface NotificationRoutesDeps {
  db: Db
}

export function createNotificationRoutes({ db }: NotificationRoutesDeps) {
  const app = new Hono()
  app.onError(errorHandler)

  app.post('/emit', emitRateLimiter, requireAuth, requirePermission('store.manage'), async (c) => {
    const auth = c.get('auth')
    const input = await parseJson(c, emitInputSchema)

    const correlationId =
      c.get('requestId') ??
      (c.get('logger') as unknown as { bindings?: () => { requestId?: string } })?.bindings?.()
        ?.requestId

    const event = {
      id: uuidv7(),
      storeId: auth.storeId,
      type: input.type,
      severity: input.severity,
      title: input.title,
      body: input.body,
      context: input.context,
      occurredAt: new Date().toISOString(),
      correlationId,
    }

    let results: DeliveryResult[]
    try {
      results = await notify(db, event, { configKey: env.notificationConfigKey })
    } catch (error) {
      const invalidEvent = error instanceof Error && error.cause instanceof z.ZodError
      logger.error(
        {
          eventId: event.id,
          storeId: event.storeId,
          eventType: event.type,
          status: 'failed',
          errorCode: invalidEvent ? 'INVALID_EVENT' : 'ROUTING_FAILED',
        },
        'Notification emit failed',
      )
      return c.json(
        { error: invalidEvent ? 'Invalid notification event' : 'Notification routing failed' },
        invalidEvent ? 400 : 503,
      )
    }

    if (results.length === 0) {
      logger.warn(
        { eventId: event.id, storeId: event.storeId, eventType: event.type },
        'Notification had no matching rules',
      )
    }
    for (const result of results) {
      const fields = {
        eventId: event.id,
        storeId: event.storeId,
        eventType: event.type,
        channelId: result.channelId,
        status: result.status,
        attempts: result.attempts,
        ...(result.errorCode ? { errorCode: result.errorCode } : {}),
      }
      if (result.ok) logger.info(fields, 'Notification delivery outcome')
      else logger.error(fields, 'Notification delivery outcome')
    }
    const safeResults = results.map(({ ok, status, attempts }) => ({ ok, status, attempts }))
    return c.json({
      data: {
        accepted: results.length > 0 && results.every((result) => result.ok),
        results: safeResults,
      },
    })
  })

  return app
}

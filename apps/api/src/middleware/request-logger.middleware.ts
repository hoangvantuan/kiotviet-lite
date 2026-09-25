import type { MiddlewareHandler } from 'hono'
import { routePath } from 'hono/route'
import type pino from 'pino'

import { logger, withRequestLogContext } from '../lib/logger.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
declare module 'hono' {
  interface ContextVariableMap {
    logger: pino.Logger
    requestId: string
  }
}

export const requestLoggerMiddleware: MiddlewareHandler = (c, next) => {
  const incomingId = c.req.header('x-request-id')
  const requestId = incomingId && UUID.test(incomingId) ? incomingId : crypto.randomUUID()
  const start = performance.now()

  c.set('requestId', requestId)
  c.set('logger', logger)
  c.header('X-Request-Id', requestId)

  return withRequestLogContext(requestId, async () => {
    logger.info({ method: c.req.method }, 'request started')
    try {
      await next()
    } finally {
      logger.info(
        {
          method: c.req.method,
          route: routePath(c),
          status: c.res.status,
          durationMs: Math.round(performance.now() - start),
        },
        'request completed',
      )
    }
  })
}

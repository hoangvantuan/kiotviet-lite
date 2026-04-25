import type { MiddlewareHandler } from 'hono'
import type pino from 'pino'

import { logger } from '../lib/logger.js'

declare module 'hono' {
  interface ContextVariableMap {
    logger: pino.Logger
  }
}

export const requestLoggerMiddleware: MiddlewareHandler = async (c, next) => {
  const requestId = crypto.randomUUID()
  const start = performance.now()
  const reqLogger = logger.child({ requestId })

  c.set('logger', reqLogger)
  c.header('X-Request-Id', requestId)

  reqLogger.info(
    { method: c.req.method, path: c.req.path, userAgent: c.req.header('user-agent') },
    'request started',
  )

  try {
    await next()
  } finally {
    const duration = Math.round(performance.now() - start)
    reqLogger.info(
      { method: c.req.method, path: c.req.path, status: c.res.status, duration },
      'request completed',
    )
  }
}

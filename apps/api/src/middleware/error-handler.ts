import type { ErrorHandler } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { ZodError } from 'zod'

import { db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { formatZodIssues } from '../lib/http.js'
import { logger } from '../lib/logger.js'
import { emitEvent } from '../services/notification-emitter.js'

export const errorHandler: ErrorHandler = (err, c) => {
  const reqLogger = c.get('logger') ?? logger

  if (err instanceof ApiError) {
    if (err.status >= 500) {
      reqLogger.error({ err }, err.message)
    } else {
      reqLogger.warn({ err }, err.message)
    }
    return c.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      err.status as ContentfulStatusCode,
    )
  }
  if (err instanceof ZodError) {
    reqLogger.warn({ zodIssues: formatZodIssues(err) }, 'validation error')
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dữ liệu không hợp lệ',
          details: formatZodIssues(err),
        },
      },
      400,
    )
  }
  reqLogger.error({ err }, 'unhandled error')

  // system.error.unhandled: emit critical notification
  const auth = c.get('auth') as { storeId?: string } | undefined
  if (auth?.storeId) {
    emitEvent(db, {
      storeId: auth.storeId,
      type: 'system.error.unhandled',
      severity: 'critical',
      title: 'Lỗi hệ thống không xác định',
      body: err instanceof Error ? err.message : 'Unknown error',
      context: {
        errorMessage: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
        requestId:
          (c.get('requestId') as string | undefined) ??
          (reqLogger as unknown as { bindings?: () => { requestId?: string } })?.bindings?.()
            ?.requestId,
      },
    })
  }

  return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Đã xảy ra lỗi không xác định' } }, 500)
}

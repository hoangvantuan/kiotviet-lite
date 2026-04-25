import type { ErrorHandler } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { ZodError } from 'zod'

import { ApiError } from '../lib/errors.js'
import { formatZodIssues } from '../lib/http.js'
import { logger } from '../lib/logger.js'

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
  return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Đã xảy ra lỗi không xác định' } }, 500)
}

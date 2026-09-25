import type { ErrorHandler } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { ZodError } from 'zod'

import { db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { formatZodIssues } from '../lib/http.js'
import { logger } from '../lib/logger.js'
import { getPgErrorCode, isRetryableTxConflict } from '../lib/pg-errors.js'
import { emitEvent } from '../services/notification-emitter.js'

export const errorHandler: ErrorHandler = (err, c) => {
  const reqLogger = c.get('logger') ?? logger

  if (err instanceof ApiError) {
    if (err.status >= 500) {
      reqLogger.error({ err, code: err.code, status: err.status }, 'api error')
    } else {
      reqLogger.warn({ code: err.code, status: err.status }, 'request rejected')
    }
    return c.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      err.status as ContentfulStatusCode,
    )
  }
  if (err instanceof ZodError) {
    reqLogger.warn(
      { issueCount: err.issues.length, fields: err.issues.map((issue) => issue.path.join('.')) },
      'validation error',
    )
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
  if (isRetryableTxConflict(err)) {
    reqLogger.warn({ pgCode: getPgErrorCode(err) }, 'transaction conflict')
    return c.json(
      {
        error: {
          code: 'CONFLICT',
          message: 'Hệ thống đang bận xử lý giao dịch khác, vui lòng thử lại',
        },
      },
      409,
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
      body: 'Yêu cầu gặp lỗi hệ thống. Tra cứu log bằng mã yêu cầu.',
      context: {
        requestId: c.get('requestId'),
      },
    })
  }

  return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Đã xảy ra lỗi không xác định' } }, 500)
}

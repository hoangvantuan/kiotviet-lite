import type { ErrorHandler } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { ZodError } from 'zod'

import { ApiError } from '../lib/errors.js'
import { formatZodIssues } from '../lib/http.js'

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof ApiError) {
    return c.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      err.status as ContentfulStatusCode,
    )
  }
  if (err instanceof ZodError) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Dữ liệu không hợp lệ', details: formatZodIssues(err) } },
      400,
    )
  }
  console.error('[unhandled]', err)
  return c.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Đã xảy ra lỗi không xác định' } },
    500,
  )
}

import type { Context } from 'hono'
import { type z,type ZodError, type ZodTypeAny } from 'zod'

import { ApiError } from './errors.js'

export async function parseJson<S extends ZodTypeAny>(c: Context, schema: S): Promise<z.infer<S>> {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'Body không hợp lệ')
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    throw new ApiError('VALIDATION_ERROR', 'Dữ liệu không hợp lệ', formatZodIssues(result.error))
  }
  return result.data
}

export function formatZodIssues(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }))
}

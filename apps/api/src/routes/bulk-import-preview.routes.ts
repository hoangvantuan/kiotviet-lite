import { Hono } from 'hono'
import { rateLimiter } from 'hono-rate-limiter'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import {
  BULK_IMPORT_MAX_BYTES,
  previewBulkImport,
  type BulkImportKind,
  type BulkImportMode,
} from '../services/bulk-import-preview.service.js'

const uploadRateLimit = rateLimiter({
  windowMs: 60_000,
  limit: 6,
  keyGenerator: (c) => `${c.get('auth').storeId}:${c.get('auth').userId}`,
  skip: () => process.env.NODE_ENV === 'test' || (process.env.NODE_ENV !== 'production' && process.env.RATE_LIMIT_DISABLED === 'true'),
  message: { error: { code: 'RATE_LIMITED', message: 'Quá nhiều lần tải tệp, vui lòng thử lại sau' } },
})
const MAX_MULTIPART_BYTES = BULK_IMPORT_MAX_BYTES + 16 * 1024

export function createBulkImportPreviewRoutes({ db }: { db: Db }) {
  const app = new Hono()
  app.onError(errorHandler)
  app.use('*', requireAuth)
  app.use('*', async (c, next) => {
    if (c.get('auth').role !== 'owner') throw new ApiError('FORBIDDEN', 'Chỉ chủ cửa hàng được nhập dữ liệu')
    await next()
  })
  app.post('/:kind/preview', uploadRateLimit, async (c) => {
    const kind = c.req.param('kind')
    if (kind !== 'products' && kind !== 'customers' && kind !== 'suppliers') {
      throw new ApiError('VALIDATION_ERROR', 'Loại dữ liệu nhập không hợp lệ')
    }
    if (!c.req.header('Content-Type')?.toLowerCase().startsWith('multipart/form-data;')) {
      throw new ApiError('VALIDATION_ERROR', 'Cần gửi một tệp XLSX bằng multipart/form-data')
    }
    const length = Number(c.req.header('Content-Length'))
    if (Number.isFinite(length) && length > MAX_MULTIPART_BYTES) {
      throw new ApiError('VALIDATION_ERROR', 'Tệp tải lên vượt giới hạn 8 MB')
    }
    const reader = c.req.raw.body?.getReader()
    if (!reader) throw new ApiError('VALIDATION_ERROR', 'Thiếu nội dung tệp tải lên')
    const chunks: Uint8Array[] = []
    let size = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_MULTIPART_BYTES) {
        await reader.cancel()
        throw new ApiError('VALIDATION_ERROR', 'Tệp tải lên vượt giới hạn 8 MB')
      }
      chunks.push(value)
    }
    const body = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
    let form: FormData
    try {
      form = await new Request(c.req.url, { method: 'POST', headers: c.req.raw.headers, body }).formData()
    } catch {
      throw new ApiError('VALIDATION_ERROR', 'Nội dung multipart không hợp lệ')
    }
    const files = form.getAll('file')
    const modes = form.getAll('mode')
    if (files.length !== 1 || !(files[0] instanceof File)) {
      throw new ApiError('VALIDATION_ERROR', 'Chỉ được gửi đúng một tệp XLSX ở trường file')
    }
    if (modes.length !== 1 || (modes[0] !== 'create-only' && modes[0] !== 'upsert')) {
      throw new ApiError('VALIDATION_ERROR', 'Chế độ nhập phải là create-only hoặc upsert')
    }
    if ([...form.keys()].some((key) => key !== 'file' && key !== 'mode')) {
      throw new ApiError('VALIDATION_ERROR', 'Chỉ nhận hai trường file và mode')
    }
    const file = files[0]
    if (file.size > BULK_IMPORT_MAX_BYTES) throw new ApiError('VALIDATION_ERROR', 'Tệp XLSX vượt giới hạn 8 MB')
    const preview = await previewBulkImport({ db, actor: c.get('auth'), kind: kind as BulkImportKind,
      mode: modes[0] as BulkImportMode, bytes: new Uint8Array(await file.arrayBuffer()), filename: file.name })
    return c.json({ data: preview })
  })
  return app
}

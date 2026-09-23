import { Hono } from 'hono'
import { z } from 'zod'

import { BULK_IMPORT_MODES, BULK_IMPORT_TYPES } from '@kiotviet-lite/shared/schema'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import {
  cancelBulkImportJob,
  createBulkImportJob,
  deleteExpiredBulkImportJobs,
  downloadBulkImportFile,
  getBulkImportJob,
  importStorageRoot,
  listBulkImportJobs,
  MAX_IMPORT_FILE_BYTES,
  recoverInterruptedBulkImportJobs,
  verifyImportStorageRoot,
} from '../services/bulk-import-jobs.service.js'

const confirmationSchema = z.object({
  type: z.enum(BULK_IMPORT_TYPES),
  mode: z.enum(BULK_IMPORT_MODES),
  filename: z.string().min(1).max(255),
  totalRows: z.coerce.number().int().min(0).max(100_000),
})
const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000
const idSchema = z.string().uuid()

async function readLimitedFile(request: Request): Promise<Uint8Array> {
  const length = request.headers.get('content-length')
  if (length && Number(length) > MAX_IMPORT_FILE_BYTES) {
    throw new ApiError('VALIDATION_ERROR', 'Tệp vượt giới hạn 10 MB')
  }
  if (!request.body) throw new ApiError('VALIDATION_ERROR', 'Thiếu tệp XLSX')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_IMPORT_FILE_BYTES) {
        await reader.cancel()
        throw new ApiError('VALIDATION_ERROR', 'Tệp vượt giới hạn 10 MB')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const file = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    file.set(chunk, offset)
    offset += chunk.byteLength
  }
  return file
}

// Mount once at /api/v1/bulk-import-jobs; storage verification and recovery start immediately.
export function createBulkImportJobsRoutes(args: { db: Db; storageRoot?: string }) {
  const { db } = args
  const storageRoot = args.storageRoot ?? importStorageRoot()
  const app = new Hono()
  app.onError(errorHandler)
  let lastCleanup = 0
  let cleanup: Promise<number> | undefined
  const cleanupExpired = () => {
    cleanup ??= deleteExpiredBulkImportJobs({ db, storageRoot })
      .then((deleted) => {
        lastCleanup = Date.now()
        return deleted
      })
      .finally(() => {
        cleanup = undefined
      })
    return cleanup
  }
  const ready = verifyImportStorageRoot(storageRoot)
    .then(() => recoverInterruptedBulkImportJobs(db))
    .then(() => cleanupExpired())
  void ready
    .then(() => {
      setInterval(() => {
        void cleanupExpired().catch((err: unknown) =>
          logger.error({ err }, 'Import retention failed'),
        )
      }, RETENTION_INTERVAL_MS).unref()
    })
    .catch((err: unknown) => logger.error({ err }, 'Import storage startup failed'))

  app.use('*', requireAuth)
  app.use('*', async (c, next) => {
    if (c.get('auth').role !== 'owner') {
      throw new ApiError('FORBIDDEN', 'Chỉ chủ cửa hàng mới được nhập dữ liệu')
    }
    await ready
    if (Date.now() - lastCleanup >= RETENTION_INTERVAL_MS) await cleanupExpired()
    await next()
  })

  // Called only after the separate preview flow is confirmed. This route never parses or executes rows.
  app.post('/confirm', async (c) => {
    const { type, mode, filename, totalRows } = confirmationSchema.parse(c.req.query())
    const contentType = c.req.header('content-type')?.split(';')[0]?.toLowerCase()
    if (
      contentType !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' &&
      contentType !== 'application/octet-stream'
    ) {
      throw new ApiError('VALIDATION_ERROR', 'Yêu cầu tệp XLSX dạng binary')
    }
    const file = await readLimitedFile(c.req.raw)
    const job = await createBulkImportJob({
      db,
      storageRoot,
      actor: c.get('auth'),
      type,
      mode,
      originalFilename: filename,
      totalRows,
      file,
    })
    return c.json({ data: job }, 201)
  })

  app.get('/', async (c) => {
    const limit = z.coerce.number().int().min(1).max(100).optional().parse(c.req.query('limit'))
    return c.json({ data: await listBulkImportJobs({ db, actor: c.get('auth'), limit }) })
  })

  app.get('/:id', async (c) => {
    const id = idSchema.parse(c.req.param('id'))
    return c.json({ data: await getBulkImportJob({ db, actor: c.get('auth'), id }) })
  })

  app.get('/:id/file', async (c) => {
    const id = idSchema.parse(c.req.param('id'))
    const { job, bytes } = await downloadBulkImportFile({
      db,
      storageRoot,
      actor: c.get('auth'),
      id,
    })
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="import.xlsx"; filename*=UTF-8''${encodeURIComponent(job.originalFilename)}`,
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  })

  app.post('/:id/cancel', async (c) => {
    const id = idSchema.parse(c.req.param('id'))
    return c.json({ data: await cancelBulkImportJob({ db, actor: c.get('auth'), id }) })
  })
  return app
}

import { Hono } from 'hono'
import { mkdir } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { z } from 'zod'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import {
  cancelBulkImportJob,
  deleteExpiredBulkImportJobs,
  downloadBulkImportFile,
  getBulkImportJob,
  importStorageRoot,
  listBulkImportJobs,
  recoverInterruptedBulkImportJobs,
  verifyImportStorageRoot,
} from '../services/bulk-import-jobs.service.js'
import { pollBulkImportQueue } from '../services/bulk-import-runner.service.js'

const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000
const idSchema = z.string().uuid()

// Mount once at /api/v1/bulk-import-jobs; storage verification and recovery start immediately.
export function createBulkImportJobsRoutes(args: { db: Db; storageRoot?: string }) {
  const { db } = args
  const storageRoot = args.storageRoot ?? importStorageRoot()
  if (!isAbsolute(storageRoot)) throw new Error('Import storage root must be absolute')
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
  const ready = (
    process.env.NODE_ENV === 'production'
      ? Promise.resolve()
      : mkdir(storageRoot, { recursive: true, mode: 0o700 })
  )
    .then(() => verifyImportStorageRoot(storageRoot))
    .then(async () => {
      const recovered = await recoverInterruptedBulkImportJobs(db)
      for (const job of recovered) {
        logger.warn(
          {
            jobId: job.id,
            storeId: job.storeId,
            status: 'failed',
            jobType: job.type,
            errorCode: 'INTERRUPTED',
          },
          'Import job recovered after interruption',
        )
      }
    })
    .then(() => {
      pollBulkImportQueue({ db, storageRoot })
      return cleanupExpired()
    })
    .then(() => {
      setInterval(() => {
        void cleanupExpired().catch((error: unknown) =>
          logger.error(
            { errorCode: error instanceof ApiError ? error.code : 'UNEXPECTED_ERROR' },
            'Import retention failed',
          ),
        )
      }, RETENTION_INTERVAL_MS).unref()
    })
  void ready.catch((error: unknown) =>
    logger.error(
      { errorCode: error instanceof ApiError ? error.code : 'UNEXPECTED_ERROR' },
      'Import storage startup failed',
    ),
  )

  app.use('*', requireAuth(db))
  app.use('*', async (c, next) => {
    if (c.get('auth').role !== 'owner') {
      throw new ApiError('FORBIDDEN', 'Chỉ chủ cửa hàng mới được nhập dữ liệu')
    }
    await ready
    if (Date.now() - lastCleanup >= RETENTION_INTERVAL_MS) await cleanupExpired()
    await next()
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

import { count, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import { bulkImportJobs, customers } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { markShuttingDown, resetLifecycleForTest } from '../lib/lifecycle.js'
import { errorHandler } from '../middleware/error-handler.js'
import { createBulkImportJobsRoutes } from '../routes/bulk-import-jobs.routes.js'
import { BULK_EXPORT_HEADERS } from '../services/bulk-export.service.js'
import { createBulkImportJob } from '../services/bulk-import-jobs.service.js'
import { previewBulkImport } from '../services/bulk-import-preview.service.js'
import {
  drainBulkImportRunner,
  resetBulkImportRunnerForTest,
  runBulkImportJob,
} from '../services/bulk-import-runner.service.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

function customerWorkbook(rows: number): Uint8Array {
  const book = XLSX.utils.book_new()
  const data = Array.from({ length: rows }, (_, index) => [`SD-${index}`, `Khách ${index}`])
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([[...BULK_EXPORT_HEADERS.customers], ...data]),
    'Dữ liệu',
  )
  return new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }))
}

describe('tắt êm khi đang có job nhập hàng loạt (GL-11)', () => {
  let env: TestEnv
  let root: string
  const actor = () => ({ storeId: env.storeId, userId: env.owner.id, role: 'owner' as const })
  const job = async (id: string) =>
    (await env.db.select().from(bulkImportJobs).where(eq(bulkImportJobs.id, id)))[0]!
  const customerCount = async () =>
    (
      await env.db
        .select({ value: count() })
        .from(customers)
        .where(eq(customers.storeId, env.storeId))
    )[0]!.value

  async function queueJob(rows: number) {
    const bytes = customerWorkbook(rows)
    const plan = await previewBulkImport({
      db: env.db,
      actor: actor(),
      kind: 'customers',
      mode: 'create-only',
      bytes,
      filename: 'shutdown.xlsx',
    })
    return createBulkImportJob({
      db: env.db,
      storageRoot: root,
      actor: actor(),
      type: 'customer',
      mode: 'create-only',
      originalFilename: 'shutdown.xlsx',
      totalRows: plan.totalRows,
      file: bytes,
      digest: plan.digest,
      approveNewNames: false,
    })
  }

  beforeAll(async () => {
    env = await createTestEnv()
    root = await mkdtemp(join(tmpdir(), 'shutdown-import-'))
  }, 30000)
  afterEach(() => {
    resetLifecycleForTest()
    resetBulkImportRunnerForTest()
  })
  afterAll(async () => {
    await env?.close()
    await rm(root, { recursive: true, force: true })
  })

  it('quá hạn chờ: dừng job tại ranh giới dòng, rollback và trả về hàng đợi; lần sau chạy lại được', async () => {
    const queued = await queueJob(400)
    const running = runBulkImportJob({
      db: env.db,
      storageRoot: root,
      storeId: env.storeId,
      id: queued.id,
    })
    markShuttingDown()
    const started = Date.now()
    const result = await drainBulkImportRunner({ graceMs: 10, abortMs: 20_000 })
    await running
    expect(result).toEqual({ finished: true, interrupted: 1 })
    expect(Date.now() - started).toBeLessThan(20_000)

    const interrupted = await job(queued.id)
    expect(interrupted).toMatchObject({ status: 'queued', processedRows: 0, startedAt: null })
    // Transaction rollback: không có khách nào được ghi dở dang.
    expect(await customerCount()).toBe(0)

    // Khởi động lại: job được chạy lại từ đầu và hoàn tất.
    resetLifecycleForTest()
    resetBulkImportRunnerForTest()
    await runBulkImportJob({ db: env.db, storageRoot: root, storeId: env.storeId, id: queued.id })
    expect((await job(queued.id)).status).toBe('completed')
    expect(await customerCount()).toBe(400)
  })

  it('đang tắt: không nhận job mới, job vẫn ở hàng đợi', async () => {
    await env.db.delete(customers).where(eq(customers.storeId, env.storeId))
    const queued = await queueJob(1)
    markShuttingDown()
    await runBulkImportJob({ db: env.db, storageRoot: root, storeId: env.storeId, id: queued.id })
    expect((await job(queued.id)).status).toBe('queued')
    await env.db.delete(bulkImportJobs).where(eq(bulkImportJobs.id, queued.id))
  })

  it('không có job: drain trả về ngay', async () => {
    markShuttingDown()
    expect(await drainBulkImportRunner({ graceMs: 60_000, abortMs: 60_000 })).toEqual({
      finished: true,
      interrupted: 0,
    })
  })
})

// GL-10: promise `ready` bị reject lúc khởi động (DB chưa sẵn sàng) từng được giữ vĩnh viễn,
// mọi request /bulk-import-jobs trả 500 cho tới khi restart API.
describe('khởi động kho tệp nhập thử lại sau lỗi (GL-10)', () => {
  it('lần đầu DB lỗi trả 500, request sau khởi động lại và trả 200', async () => {
    const env = await createTestEnv()
    const root = await mkdtemp(join(tmpdir(), 'ready-retry-'))
    try {
      let dbDown = true
      const flaky = new Proxy(env.db, {
        get(target, property, receiver) {
          if (property === 'update' && dbDown) {
            return () => {
              throw new Error('connect ECONNREFUSED')
            }
          }
          return Reflect.get(target, property, receiver)
        },
      }) as Db
      const app = new Hono()
      app.onError(errorHandler)
      app.route('/jobs', createBulkImportJobsRoutes({ db: flaky, storageRoot: root }))

      const first = await app.request('/jobs', { headers: env.owner.authHeader })
      expect(first.status).toBe(500)
      dbDown = false
      const second = await app.request('/jobs', { headers: env.owner.authHeader })
      expect(second.status).toBe(200)
    } finally {
      resetBulkImportRunnerForTest()
      await env.close()
      await rm(root, { recursive: true, force: true })
    }
  })
})

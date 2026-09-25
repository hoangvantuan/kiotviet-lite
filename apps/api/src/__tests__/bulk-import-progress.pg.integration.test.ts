import { eq } from 'drizzle-orm'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import { bulkImportJobs } from '@kiotviet-lite/shared'

import { BULK_EXPORT_HEADERS } from '../services/bulk-export.service.js'
import { createBulkImportJob } from '../services/bulk-import-jobs.service.js'
import { previewBulkImport } from '../services/bulk-import-preview.service.js'
import { runBulkImportJob } from '../services/bulk-import-runner.service.js'
import { createPgTestDb, type PgTestDb, testPgUrl } from './helpers/pg-test-db.js'

describe.skipIf(!testPgUrl)(
  'GL-18: tiến độ nhập thấy được từ phiên DB khác khi job đang chạy',
  () => {
    let pg: PgTestDb
    let root: string
    beforeAll(async () => {
      pg = await createPgTestDb('kvl_import_progress')
      root = await mkdtemp(join(tmpdir(), 'import-progress-'))
    })
    afterAll(async () => {
      await pg?.close()
      await rm(root, { recursive: true, force: true })
    })

    it('processed_rows tăng theo lô trước khi commit, succeeded_rows chỉ lên khi commit', async () => {
      const rows = Array.from({ length: 1500 }, (_, i) => [`KH${i}`, `Khách ${i}`])
      const book = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(
        book,
        XLSX.utils.aoa_to_sheet([[...BULK_EXPORT_HEADERS.customers], ...rows]),
        'Dữ liệu',
      )
      const bytes = new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }))
      const actor = { storeId: pg.storeId, userId: pg.ownerId, role: 'owner' as const }
      const plan = await previewBulkImport({
        db: pg.db,
        actor,
        kind: 'customers',
        mode: 'upsert',
        bytes,
        filename: 'progress.xlsx',
      })
      const job = await createBulkImportJob({
        db: pg.db,
        storageRoot: root,
        actor,
        type: 'customer',
        mode: 'upsert',
        originalFilename: 'progress.xlsx',
        totalRows: plan.totalRows,
        file: bytes,
        digest: plan.digest,
        approveNewNames: false,
      })
      const seen: { status: string; processed: number; succeeded: number }[] = []
      let polling = true
      const poll = (async () => {
        while (polling) {
          const [row] = await pg.db
            .select({
              status: bulkImportJobs.status,
              processed: bulkImportJobs.processedRows,
              succeeded: bulkImportJobs.succeededRows,
            })
            .from(bulkImportJobs)
            .where(eq(bulkImportJobs.id, job.id))
          if (row?.status === 'running') seen.push(row)
          await new Promise((resolve) => setTimeout(resolve, 5))
        }
      })()
      try {
        await runBulkImportJob({ db: pg.db, storageRoot: root, storeId: pg.storeId, id: job.id })
      } finally {
        polling = false
        await poll
      }
      const midRun = seen.filter((row) => row.processed > 0 && row.processed < 1500)
      expect(midRun.length).toBeGreaterThan(0)
      expect(seen.every((row) => row.succeeded === 0)).toBe(true)
      const [done] = await pg.db.select().from(bulkImportJobs).where(eq(bulkImportJobs.id, job.id))
      expect(done).toMatchObject({ status: 'completed', processedRows: 1500, succeededRows: 1500 })
    }, 120_000)
  },
)

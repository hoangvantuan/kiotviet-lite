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

const ROWS = 11_055

function workbook(price: number): Uint8Array {
  const rows: unknown[][] = []
  for (let i = 0; i < ROWS; i++) {
    rows.push([
      `SP${String(i).padStart(6, '0')}`,
      `Nồi nhôm số ${i}`,
      null,
      `Nhóm ${i % 31}`,
      `Hãng ${i % 21}`,
      price + i,
      price,
      'Cái',
      null,
      null,
      null,
      'active',
      'Có',
      0,
      0,
    ])
  }
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([[...BULK_EXPORT_HEADERS.products], ...rows]),
    'Dữ liệu',
  )
  return new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }))
}

describe.skipIf(!testPgUrl)('Hiệu năng nhập 11k sản phẩm trên Postgres thật', () => {
  let pg: PgTestDb
  let root: string
  beforeAll(async () => {
    pg = await createPgTestDb('kvl_import_perf')
    root = await mkdtemp(join(tmpdir(), 'import-perf-'))
  })
  afterAll(async () => {
    await pg?.close()
    await rm(root, { recursive: true, force: true })
  })

  async function importOnce(bytes: Uint8Array, label: string) {
    const actor = { storeId: pg.storeId, userId: pg.ownerId, role: 'owner' as const }
    const t0 = performance.now()
    const preview = await previewBulkImport({
      db: pg.db,
      actor,
      kind: 'products',
      mode: 'upsert',
      bytes,
      filename: 'perf.xlsx',
    })
    const t1 = performance.now()
    expect(preview.errors).toEqual([])
    const job = await createBulkImportJob({
      db: pg.db,
      storageRoot: root,
      actor,
      type: 'product',
      mode: 'upsert',
      originalFilename: 'perf.xlsx',
      totalRows: preview.totalRows,
      file: bytes,
      digest: preview.digest,
      approveNewNames: true,
    })
    await runBulkImportJob({ db: pg.db, storageRoot: root, storeId: pg.storeId, id: job.id })
    const t2 = performance.now()
    const [done] = await pg.db.select().from(bulkImportJobs).where(eq(bulkImportJobs.id, job.id))
    expect(done?.errorMessage ?? null).toBeNull()
    expect(done?.status).toBe('completed')
    console.info(
      `[perf] ${label}: xem trước ${((t1 - t0) / 1000).toFixed(2)} s, chạy ${((t2 - t1) / 1000).toFixed(2)} s (tạo ${preview.creates}, cập nhật ${preview.updates}, không đổi ${preview.noOps})`,
    )
    return (t2 - t1) / 1000
  }

  it('nhập mới, nhập lại có đổi giá, nhập lại không đổi', async () => {
    await importOnce(workbook(10_000), 'nhập mới')
    await importOnce(workbook(12_000), 'nhập lại đổi giá')
    await importOnce(workbook(12_000), 'nhập lại không đổi')
  }, 900_000)
})

import { and, count, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { mkdtemp, readFile, rm, stat, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import {
  auditLogs,
  brands,
  bulkImportJobs,
  categories,
  customers,
  products,
  stores,
  suppliers,
  users,
} from '@kiotviet-lite/shared'

import { signAccessToken } from '../lib/jwt.js'
import { errorHandler } from '../middleware/error-handler.js'
import { createBulkExportRoutes } from '../routes/bulk-export.routes.js'
import { createBulkImportJobsRoutes } from '../routes/bulk-import-jobs.routes.js'
import { createBulkImportPreviewRoutes } from '../routes/bulk-import-preview.routes.js'
import { BULK_EXPORT_HEADERS } from '../services/bulk-export.service.js'
import {
  claimBulkImportJob,
  clearBulkImportProgress,
  createBulkImportJob,
  deleteExpiredBulkImportJobs,
  downloadBulkImportFile,
  publishBulkImportProgress,
  recoverInterruptedBulkImportJobs,
} from '../services/bulk-import-jobs.service.js'
import { previewBulkImport } from '../services/bulk-import-preview.service.js'
import {
  runBulkImportJob,
  runQueuedBulkImportJobs,
} from '../services/bulk-import-runner.service.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.ACCESS_TOKEN_TTL_SECONDS = '900'
  process.env.REFRESH_TOKEN_TTL_SECONDS = '604800'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

type Kind = keyof typeof BULK_EXPORT_HEADERS

function workbook(kind: Kind, rows: unknown[][]): Uint8Array {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([[...BULK_EXPORT_HEADERS[kind]], ...rows]),
    'Dữ liệu',
  )
  return new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }))
}

function upload(
  app: Hono,
  kind: Kind,
  path: 'preview' | 'confirm',
  bytes: Uint8Array,
  auth: string | undefined,
  mode = 'upsert',
  digest?: string,
  approveNewNames = false,
) {
  const form = new FormData()
  form.append('file', new File([Buffer.from(bytes)], 'original.xlsx'))
  form.append('mode', mode)
  if (path === 'confirm') {
    form.append('digest', digest ?? '0'.repeat(64))
    form.append('approveNewNames', String(approveNewNames))
  }
  return app.request(`/api/v1/bulk-import/${kind}/${path}`, {
    method: 'POST',
    body: form,
    headers: auth ? { Authorization: auth } : {},
  })
}

async function json<T = { id: string; status: string }>(response: Response) {
  return (await response.json()) as {
    data: T
    error: { code: string; message: string; details?: unknown }
  }
}

describe('confirmed atomic bulk imports over HTTP and PGlite', () => {
  let env: TestEnv
  let root: string
  let app: Hono
  const auth = () => env.owner.authHeader.Authorization
  const actor = () => ({ storeId: env.storeId, userId: env.owner.id, role: 'owner' as const })
  const run = (job: { id: string }) =>
    runBulkImportJob({ db: env.db, storageRoot: root, storeId: env.storeId, id: job.id })
  const job = async (id: string) =>
    (await env.db.select().from(bulkImportJobs).where(eq(bulkImportJobs.id, id)))[0]!

  beforeAll(async () => {
    env = await createTestEnv()
    root = await mkdtemp(join(tmpdir(), 'confirmed-import-'))
    app = new Hono()
    app.onError(errorHandler)
    app.route(
      '/api/v1/bulk-import',
      createBulkImportPreviewRoutes({ db: env.db, storageRoot: root, schedule: () => {} }),
    )
    app.route(
      '/api/v1/bulk-import-jobs',
      createBulkImportJobsRoutes({ db: env.db, storageRoot: root }),
    )
    app.route('/api/v1/bulk-export', createBulkExportRoutes({ db: env.db }))
  }, 30000)
  afterAll(async () => {
    await env?.close()
    await rm(root, { recursive: true, force: true })
  })

  async function preview(kind: Kind, bytes: Uint8Array, mode = 'upsert') {
    const response = await upload(app, kind, 'preview', bytes, auth(), mode)
    expect(response.status).toBe(200)
    const { data } = await json<{
      digest: string
      totalRows: number
      errors: Array<{ row: number }>
      newCategories: string[]
      newBrands: string[]
      creates: number
      updates: number
      noOps: number
    }>(response)
    expect(data).not.toHaveProperty('rows')
    return data
  }

  async function confirm(kind: Kind, bytes: Uint8Array, mode = 'upsert', approve = false) {
    const plan = await preview(kind, bytes, mode)
    const response = await upload(app, kind, 'confirm', bytes, auth(), mode, plan.digest, approve)
    return { plan, response, result: await json(response) }
  }

  it('keeps unchanged exported rows as no-ops and preserves original bytes', async () => {
    await env.db.insert(products).values({
      storeId: env.storeId,
      sku: 'EXIST-P',
      name: 'Ống',
      sellingPrice: 10,
      currentStock: 17,
    })
    await env.db.insert(customers).values({ storeId: env.storeId, code: 'EXIST-C', name: 'Khách' })
    await env.db
      .insert(suppliers)
      .values({ storeId: env.storeId, code: 'EXIST-S', name: 'Nhà cung cấp' })
    for (const kind of ['products', 'customers', 'suppliers'] as const) {
      const exported = await app.request(`/api/v1/bulk-export/${kind}/export`, {
        headers: env.owner.authHeader,
      })
      expect(exported.status).toBe(200)
      const bytes = new Uint8Array(await exported.arrayBuffer())
      const { plan, response, result } = await confirm(kind, bytes)
      expect(response.status).toBe(201)
      expect(plan).toMatchObject({ creates: 0, updates: 0, noOps: 1 })
      expect(await readFile(join(root, env.storeId, `${result.data.id}.xlsx`))).toEqual(
        Buffer.from(bytes),
      )
      const downloaded = await app.request(`/api/v1/bulk-import-jobs/${result.data.id}/file`, {
        headers: env.owner.authHeader,
      })
      expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(bytes)
      const beforeAudit = (await env.db.select({ value: count() }).from(auditLogs))[0]!.value
      await run(result.data)
      expect((await job(result.data.id)).status).toBe('completed')
      expect((await env.db.select({ value: count() }).from(auditLogs))[0]!.value).toBe(beforeAudit)
    }
    expect(
      (await env.db.select().from(products).where(eq(products.sku, 'EXIST-P')))[0]?.currentStock,
    ).toBe(17)
  })

  it('rejects stale digest, create-only conflicts, duplicate rows, and bad middle row before storing jobs', async () => {
    const valid = workbook('suppliers', [['NEW-STABLE', 'Nhà cung cấp mới']])
    const { digest } = await preview('suppliers', valid)
    await env.db
      .insert(suppliers)
      .values({ storeId: env.storeId, code: 'NEW-STABLE', name: 'Nhà cung cấp mới' })
    const stale = await upload(app, 'suppliers', 'confirm', valid, auth(), 'upsert', digest)
    expect(stale.status).toBe(409)
    const conflict = await confirm(
      'suppliers',
      workbook('suppliers', [['EXIST-S', 'Không tạo']]),
      'create-only',
    )
    expect(conflict.plan.errors).toEqual([expect.objectContaining({ row: 2 })])
    expect(conflict.response.status).toBe(400)
    const duplicate = await confirm(
      'suppliers',
      workbook('suppliers', [
        ['DUP-KEY', 'A'],
        ['dup-key', 'B'],
      ]),
    )
    expect(duplicate.plan.errors.map((item) => item.row)).toEqual([2, 3])
    expect(duplicate.response.status).toBe(400)
    const broken = await confirm(
      'suppliers',
      workbook('suppliers', [
        ['FIRST', 'First'],
        ['BAD', ''],
        ['LAST', 'Last'],
      ]),
    )
    expect(broken.plan.errors).toEqual([expect.objectContaining({ row: 3 })])
    expect(broken.response.status).toBe(400)
    expect(await env.db.select().from(suppliers).where(eq(suppliers.code, 'FIRST'))).toEqual([])
  })

  it('applies blank retention and clear token; ignores stock and never creates variants', async () => {
    await env.db.update(suppliers).set({ phone: '0909876543' }).where(eq(suppliers.code, 'EXIST-S'))
    const supplier = await confirm('suppliers', workbook('suppliers', [['EXIST-S', '', '__XOA__']]))
    expect(supplier.response.status).toBe(201)
    await run(supplier.result.data)
    expect(
      (await env.db.select().from(suppliers).where(eq(suppliers.code, 'EXIST-S')))[0],
    ).toMatchObject({
      name: 'Nhà cung cấp',
      phone: null,
    })
    const product = await confirm(
      'products',
      workbook('products', [['EXIST-P', '', '', '', '', '', '', '', '', '', '', '', '', '', 1000]]),
    )
    expect(product.plan.noOps).toBe(1)
    expect(product.response.status).toBe(201)
    await run(product.result.data)
    expect(
      (await env.db.select().from(products).where(eq(products.sku, 'EXIST-P')))[0]?.currentStock,
    ).toBe(17)
    const created = await confirm(
      'products',
      workbook('products', [
        ['NEW-P', 'Cây', '', '', '', 50, '', '', '', '', '', '', 'Có', '', 12345],
      ]),
    )
    expect(created.response.status).toBe(201)
    await run(created.result.data)
    expect(
      (await env.db.select().from(products).where(eq(products.sku, 'NEW-P')))[0],
    ).toMatchObject({ currentStock: 0, hasVariants: false })
  })

  it('requires approval for new categories and brands and audits committed domain writes', async () => {
    const bytes = workbook('products', [
      ['BRANDED-P', 'Ống P', '', 'Vật liệu > Ống', 'Nhựa Việt', 100],
    ])
    const plan = await preview('products', bytes)
    expect(plan.newCategories).toEqual(['Vật liệu', 'Vật liệu > Ống'])
    expect(plan.newBrands).toEqual(['Nhựa Việt'])
    const denied = await upload(
      app,
      'products',
      'confirm',
      bytes,
      auth(),
      'upsert',
      plan.digest,
      false,
    )
    expect(denied.status).toBe(400)
    const allowed = await upload(
      app,
      'products',
      'confirm',
      bytes,
      auth(),
      'upsert',
      plan.digest,
      true,
    )
    expect(allowed.status).toBe(201)
    const { data } = await json(allowed)
    await run(data)
    expect((await job(data.id)).status).toBe('completed')
    expect(
      (await env.db.select().from(categories).where(eq(categories.storeId, env.storeId))).length,
    ).toBe(2)
    expect((await env.db.select().from(brands).where(eq(brands.storeId, env.storeId))).length).toBe(
      1,
    )
    expect((await env.db.select().from(auditLogs)).map((item) => item.action)).toEqual(
      expect.arrayContaining(['category.created', 'brand.created', 'product.created']),
    )
  })

  it('does not bind an imported product to a soft-deleted brand', async () => {
    const [deleted] = await env.db
      .insert(brands)
      .values({
        storeId: env.storeId,
        name: 'Đã xóa',
        deletedAt: new Date(),
      })
      .returning()
    const bytes = workbook('products', [['FRESH-BRAND', 'Sản phẩm mới', '', '', 'Đã xóa', 100]])
    const result = await confirm('products', bytes, 'upsert', true)
    expect(result.plan.newBrands).toEqual(['Đã xóa'])
    expect(result.response.status).toBe(201)
    await run(result.result.data)
    expect((await job(result.result.data.id)).status).toBe('completed')
    const [product] = await env.db.select().from(products).where(eq(products.sku, 'FRESH-BRAND'))
    expect(product?.brandId).toBeTruthy()
    expect(product?.brandId).not.toBe(deleted!.id)
  })

  it('rolls back earlier writes and audits when a later domain service rejects a row', async () => {
    const bytes = workbook('suppliers', [
      ['ROLLBACK-FIRST', 'One'],
      ['ROLLBACK-SECOND', 'Two', '0901234567'],
    ])
    const { result, response } = await confirm('suppliers', bytes)
    expect(response.status).toBe(201)
    await env.db.insert(suppliers).values({
      storeId: env.storeId,
      code: 'PHONE-OWNER',
      name: 'Phone owner',
      phone: '0901234567',
    })
    // Revalidation must reject stale plans and leave no partial domain or audit mutations.
    const before = (await env.db.select({ value: count() }).from(auditLogs))[0]!.value
    await run(result.data)
    expect((await job(result.data.id)).status).toBe('failed')
    expect((await job(result.data.id)).errorMessage).toContain('Dòng 3')
    expect(
      await env.db.select().from(suppliers).where(eq(suppliers.code, 'ROLLBACK-FIRST')),
    ).toEqual([])
    expect((await env.db.select({ value: count() }).from(auditLogs))[0]!.value).toBe(before)
  })

  it('isolates access, rejects old confirmation, enforces same-store/type mutex and cancellation', async () => {
    const bytes = workbook('customers', [['QUEUED-C', 'Khách hàng mới']])
    for (const access of [
      undefined,
      env.manager.authHeader.Authorization,
      env.staff.authHeader.Authorization,
    ]) {
      expect((await upload(app, 'customers', 'preview', bytes, access)).status).toBe(
        access ? 403 : 401,
      )
      expect((await upload(app, 'customers', 'confirm', bytes, access)).status).toBe(
        access ? 403 : 401,
      )
    }
    expect(
      (
        await app.request('/api/v1/bulk-import-jobs/confirm?totalRows=1', {
          method: 'POST',
          headers: env.owner.authHeader,
        })
      ).status,
    ).toBe(404)
    const first = await confirm('customers', bytes)
    expect(first.response.status).toBe(201)
    const second = await confirm('customers', bytes)
    expect(second.response.status).toBe(409)
    const [otherStore] = await env.db.insert(stores).values({ name: 'Second store' }).returning()
    const [otherOwner] = await env.db
      .insert(users)
      .values({
        storeId: otherStore!.id,
        name: 'Other owner',
        phone: '0912345678',
        role: 'owner',
        passwordHash: 'unused',
        pinHash: 'unused',
      })
      .returning()
    const foreign = `Bearer ${signAccessToken({ userId: otherOwner!.id, storeId: otherStore!.id, role: 'owner' })}`
    const foreignPreview = await upload(app, 'customers', 'preview', bytes, foreign)
    expect(foreignPreview.status).toBe(200)
    const { data: foreignPlan } = await json<{ digest: string }>(foreignPreview)
    const foreignConfirmation = await upload(
      app,
      'customers',
      'confirm',
      bytes,
      foreign,
      'upsert',
      foreignPlan.digest,
    )
    expect(foreignConfirmation.status).toBe(201)
    const { data: foreignJob } = await json(foreignConfirmation)
    await runBulkImportJob({
      db: env.db,
      storageRoot: root,
      storeId: otherStore!.id,
      id: foreignJob.id,
    })
    expect(
      (await env.db.select().from(customers).where(eq(customers.storeId, otherStore!.id))).length,
    ).toBe(1)
    const url = `/api/v1/bulk-import-jobs/${first.result.data.id}`
    expect((await app.request(url, { headers: { Authorization: foreign } })).status).toBe(404)
    expect((await app.request(`${url}/file`, { headers: { Authorization: foreign } })).status).toBe(
      404,
    )
    expect(
      (await app.request(`${url}/cancel`, { method: 'POST', headers: { Authorization: foreign } }))
        .status,
    ).toBe(409)
    expect((await app.request(url, { headers: env.manager.authHeader })).status).toBe(403)
    const cancelled = await app.request(`${url}/cancel`, {
      method: 'POST',
      headers: env.owner.authHeader,
    })
    expect((await json(cancelled)).data.status).toBe('cancelled')
    await run(first.result.data)
    expect((await job(first.result.data.id)).status).toBe('cancelled')
    expect(
      await env.db
        .select()
        .from(customers)
        .where(and(eq(customers.code, 'QUEUED-C'), eq(customers.storeId, env.storeId))),
    ).toEqual([])
    const next = await confirm(
      'customers',
      workbook('customers', [['CANCEL-RUNNING', 'Không tạo']]),
    )
    expect(next.response.status).toBe(201)
    await claimBulkImportJob({ db: env.db, storeId: env.storeId, id: next.result.data.id })
    expect(
      (
        await json(
          await app.request(`/api/v1/bulk-import-jobs/${next.result.data.id}/cancel`, {
            method: 'POST',
            headers: env.owner.authHeader,
          }),
        )
      ).data.status,
    ).toBe('cancelled')
    await run(next.result.data)
    expect(
      await env.db.select().from(customers).where(eq(customers.code, 'CANCEL-RUNNING')),
    ).toEqual([])
  })

  it('exposes actual in-flight batch progress without claiming uncommitted success', async () => {
    const rows = Array.from({ length: 101 }, (_, index) => [`LIVE-${index}`, `Khách ${index}`])
    const result = await confirm('customers', workbook('customers', rows))
    expect(result.response.status).toBe(201)
    const id = result.result.data.id
    await claimBulkImportJob({ db: env.db, storeId: env.storeId, id })
    publishBulkImportProgress(env.storeId, id, 100)
    const detail = await json<{
      id: string
      status: string
      processedRows: number
      succeededRows: number
    }>(await app.request(`/api/v1/bulk-import-jobs/${id}`, { headers: env.owner.authHeader }))
    expect(detail.data).toMatchObject({ status: 'running', processedRows: 100, succeededRows: 0 })
    const list = await json<Array<{ id: string; processedRows: number }>>(
      await app.request('/api/v1/bulk-import-jobs', { headers: env.owner.authHeader }),
    )
    expect(list.data.find((item) => item.id === id)?.processedRows).toBe(100)
    await app.request(`/api/v1/bulk-import-jobs/${id}/cancel`, {
      method: 'POST',
      headers: env.owner.authHeader,
    })
    const cancelled = await json<{ status: string; processedRows: number }>(
      await app.request(`/api/v1/bulk-import-jobs/${id}`, { headers: env.owner.authHeader }),
    )
    expect(cancelled.data).toMatchObject({ status: 'cancelled', processedRows: 0 })
    clearBulkImportProgress(id)
  })

  it('fails interrupted running jobs but resumes queued jobs on startup; retains files for 30 days', async () => {
    const bytes = workbook('customers', [['RESUME-C', 'Khách mới']])
    const plan = await previewBulkImport({
      db: env.db,
      actor: actor(),
      kind: 'customers',
      mode: 'create-only',
      bytes,
      filename: 'original.xlsx',
    })
    const previous = await createBulkImportJob({
      db: env.db,
      storageRoot: root,
      actor: actor(),
      type: 'customer',
      mode: 'create-only',
      originalFilename: 'original.xlsx',
      totalRows: plan.totalRows,
      file: bytes,
      digest: plan.digest,
      approveNewNames: false,
    })
    await env.db
      .update(bulkImportJobs)
      .set({ status: 'running' })
      .where(eq(bulkImportJobs.id, previous.id))
    const recovered = await recoverInterruptedBulkImportJobs(env.db)
    expect(recovered.map((item) => item.id)).toContain(previous.id)
    expect((await job(previous.id)).status).toBe('failed')
    const queued = await createBulkImportJob({
      db: env.db,
      storageRoot: root,
      actor: actor(),
      type: 'customer',
      mode: 'create-only',
      originalFilename: 'original.xlsx',
      totalRows: plan.totalRows,
      file: bytes,
      digest: plan.digest,
      approveNewNames: false,
    })
    expect(await recoverInterruptedBulkImportJobs(env.db)).toEqual([])
    await runQueuedBulkImportJobs({ db: env.db, storageRoot: root })
    expect((await job(queued.id)).status).toBe('completed')
    expect(
      await env.db.select().from(customers).where(eq(customers.code, 'RESUME-C')),
    ).toHaveLength(1)
    await env.db
      .update(bulkImportJobs)
      .set({ expiresAt: new Date('2020-01-01') })
      .where(eq(bulkImportJobs.id, queued.id))
    expect(await deleteExpiredBulkImportJobs({ db: env.db, storageRoot: root })).toBe(1)
    await expect(readFile(join(root, env.storeId, `${queued.id}.xlsx`))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('generates formula-safe Vietnamese errors workbook for owner only', async () => {
    const request = {
      method: 'POST',
      headers: { ...env.owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ errors: [{ row: 2, column: '=HYPERLINK("x")', message: '+cmd' }] }),
    }
    const response = await app.request('/api/v1/bulk-import/errors.xlsx', request)
    expect(response.status).toBe(200)
    const book = XLSX.read(new Uint8Array(await response.arrayBuffer()), { type: 'array' })
    const sheet = book.Sheets['Lỗi nhập liệu']!
    expect(XLSX.utils.sheet_to_json(sheet, { header: 1 })).toEqual([
      ['Dòng', 'Cột', 'Thông báo'],
      [2, '=HYPERLINK("x")', '+cmd'],
    ])
    expect(sheet.B2?.f).toBeUndefined()
    expect(
      (
        await app.request('/api/v1/bulk-import/errors.xlsx', {
          method: 'POST',
          headers: { ...env.owner.authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            errors: [{ row: 2, column: 'Tên', message: 'x'.repeat(16 * 1024 * 1024) }],
          }),
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await app.request('/api/v1/bulk-import/errors.xlsx', {
          ...request,
          headers: { ...env.staff.authHeader, 'Content-Type': 'application/json' },
        })
      ).status,
    ).toBe(403)
  })
  it('downloads all 11,055 row errors without truncating the workbook', async () => {
    const errors = Array.from({ length: 11_055 }, (_, index) => ({
      row: index + 2,
      column: 'Tên nhà cung cấp',
      message: 'Tên không hợp lệ',
    }))
    const response = await app.request('/api/v1/bulk-import/errors.xlsx', {
      method: 'POST',
      headers: { ...env.owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ errors }),
    })
    expect(response.status).toBe(200)
    const book = XLSX.read(new Uint8Array(await response.arrayBuffer()), { type: 'array' })
    const sheet = book.Sheets['Lỗi nhập liệu']!
    expect(sheet['!ref']).toBe('A1:C11056')
    expect(sheet.A11056?.v).toBe(11056)
  })

  it('creates a configured absolute import root for local startup', async () => {
    const directory = join(root, 'nested', 'imports')
    const mounted = createBulkImportJobsRoutes({ db: env.db, storageRoot: directory })
    expect((await mounted.request('/', { headers: env.owner.authHeader })).status).toBe(200)
    expect((await stat(directory)).isDirectory()).toBe(true)
  })

  it('refuses a substituted symlink in stored original downloads', async () => {
    const result = await confirm('suppliers', workbook('suppliers', [['SYMLINK-S', 'Không nhập']]))
    expect(result.response.status).toBe(201)
    await app.request(`/api/v1/bulk-import-jobs/${result.result.data.id}/cancel`, {
      method: 'POST',
      headers: env.owner.authHeader,
    })
    const file = join(root, env.storeId, `${result.result.data.id}.xlsx`)
    const unrelated = join(root, 'private.xlsx')
    await writeFile(unrelated, 'private data')
    await unlink(file)
    await symlink(unrelated, file)
    await expect(
      downloadBulkImportFile({
        db: env.db,
        storageRoot: root,
        actor: actor(),
        id: result.result.data.id,
      }),
    ).rejects.toThrow('Import file escaped its store directory')
  })
})

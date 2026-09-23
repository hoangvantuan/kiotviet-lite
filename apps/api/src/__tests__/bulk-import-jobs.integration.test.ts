import { eq } from 'drizzle-orm'
import type { Hono } from 'hono'
import { mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import { bulkImportJobs, stores, users } from '@kiotviet-lite/shared/schema'

import { signAccessToken } from '../lib/jwt.js'
import type { AuthContext } from '../middleware/auth.middleware.js'
import { createBulkImportJobsRoutes } from '../routes/bulk-import-jobs.routes.js'
import {
  cancelBulkImportJob,
  claimBulkImportJob,
  createBulkImportJob,
  deleteExpiredBulkImportJobs,
  downloadBulkImportFile,
  finishBulkImportJob,
  getBulkImportJob,
  loadBulkImportJobFile,
  updateBulkImportProgress,
} from '../services/bulk-import-jobs.service.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

const workbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Name'], ['Widget']]), 'Import')
const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer

async function postConfirmation(app: Hono, auth: { Authorization: string }, type = 'product') {
  return app.request(`/confirm?type=${type}&mode=create-only&filename=original.xlsx&totalRows=1`, {
    method: 'POST',
    headers: {
      ...auth,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
    body: new Uint8Array(bytes),
  })
}

describe('bulk import job storage and lifecycle', () => {
  let env: TestEnv
  let storageRoot: string
  let app: Hono
  let owner: AuthContext

  beforeEach(async () => {
    env = await createTestEnv()
    owner = { userId: env.owner.id, storeId: env.storeId, role: 'owner' }
    storageRoot = await mkdtemp(join(tmpdir(), 'bulk-import-jobs-'))
    app = createBulkImportJobsRoutes({ db: env.db, storageRoot })
  })
  afterEach(async () => {
    await env.close()
    await rm(storageRoot, { recursive: true, force: true })
  })

  it('only owner confirms a preview; persisted original bytes remain downloadable', async () => {
    expect((await postConfirmation(app, env.manager.authHeader)).status).toBe(403)
    expect((await app.request('/', { headers: env.manager.authHeader })).status).toBe(403)
    expect((await app.request('/', { headers: env.staff.authHeader })).status).toBe(403)
    const response = await postConfirmation(app, env.owner.authHeader)
    expect(response.status).toBe(201)
    const { data: job } = (await response.json()) as {
      data: { id: string; status: string; storeId: string; fileSizeBytes: number }
    }
    expect(job).toMatchObject({
      status: 'queued',
      storeId: env.storeId,
      fileSizeBytes: bytes.length,
    })
    const file = await app.request(`/${job.id}/file`, { headers: env.owner.authHeader })
    expect(file.status).toBe(200)
    expect(Buffer.from(await file.arrayBuffer())).toEqual(bytes)
    expect(await readFile(join(storageRoot, env.storeId, `${job.id}.xlsx`))).toEqual(bytes)
    expect(
      (
        await loadBulkImportJobFile({
          db: env.db,
          storageRoot,
          storeId: env.storeId,
          id: job.id,
        })
      ).bytes,
    ).toEqual(bytes)
    expect((await app.request(`/${job.id}/file`, { headers: env.manager.authHeader })).status).toBe(
      403,
    )
    expect((await postConfirmation(app, env.owner.authHeader)).status).toBe(409)
    expect((await readdir(join(storageRoot, env.storeId))).length).toBe(1)
  })

  it('isolates list, detail and download by tenant and scopes mutex to store+type', async () => {
    const localResponse = await postConfirmation(app, env.owner.authHeader)
    const { data: localJob } = (await localResponse.json()) as { data: { id: string } }
    const [foreignStore] = await env.db.insert(stores).values({ name: 'Other store' }).returning()
    const [foreignOwner] = await env.db
      .insert(users)
      .values({
        storeId: foreignStore!.id,
        name: 'Other owner',
        phone: '0912345678',
        role: 'owner',
        passwordHash: 'unused',
        pinHash: 'unused',
      })
      .returning()
    const auth = {
      Authorization: `Bearer ${signAccessToken({ userId: foreignOwner!.id, storeId: foreignStore!.id, role: 'owner' })}`,
    }
    expect((await app.request(`/${localJob.id}`, { headers: auth })).status).toBe(404)
    expect((await app.request(`/${localJob.id}/file`, { headers: auth })).status).toBe(404)
    await expect(
      loadBulkImportJobFile({
        db: env.db,
        storageRoot,
        storeId: foreignStore!.id,
        id: localJob.id,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const list = await app.request('/', { headers: auth })
    expect((await list.json()) as { data: unknown[] }).toEqual({ data: [] })
    expect((await postConfirmation(app, auth)).status).toBe(201)
    expect((await postConfirmation(app, env.owner.authHeader, 'customer')).status).toBe(201)
    await expect(
      env.db.insert(bulkImportJobs).values({
        storeId: env.storeId,
        createdBy: env.owner.id,
        type: 'product',
        mode: 'upsert',
        originalFilename: 'other.xlsx',
        fileSizeBytes: bytes.length,
        totalRows: 1,
        expiresAt: new Date(Date.now() + 86_400_000),
      }),
    ).rejects.toThrow()
  })

  it('guards atomic progress transitions and cancellation against stale workers', async () => {
    const confirmation = await postConfirmation(app, env.owner.authHeader, 'customer')
    const { data: customer } = (await confirmation.json()) as { data: { id: string } }
    await expect(
      updateBulkImportProgress({
        db: env.db,
        storeId: env.storeId,
        id: customer.id,
        processedRows: 1,
        succeededRows: 1,
        failedRows: 0,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await env.db.transaction(async (tx) =>
      claimBulkImportJob({
        db: tx,
        storeId: env.storeId,
        id: customer.id,
      }),
    )
    await expect(
      claimBulkImportJob({ db: env.db, storeId: env.storeId, id: customer.id }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await updateBulkImportProgress({
      db: env.db,
      storeId: env.storeId,
      id: customer.id,
      processedRows: 1,
      succeededRows: 1,
      failedRows: 0,
    })
    await expect(
      updateBulkImportProgress({
        db: env.db,
        storeId: env.storeId,
        id: customer.id,
        processedRows: 0,
        succeededRows: 0,
        failedRows: 0,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    const cancelled = await cancelBulkImportJob({ db: env.db, actor: owner, id: customer.id })
    expect(cancelled.status).toBe('cancelled')
    await expect(
      finishBulkImportJob({
        db: env.db,
        storeId: env.storeId,
        id: customer.id,
        status: 'completed',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    const replacement = await postConfirmation(app, env.owner.authHeader, 'customer')
    const { data: next } = (await replacement.json()) as { data: { id: string } }
    await claimBulkImportJob({ db: env.db, storeId: env.storeId, id: next.id })
    await expect(
      finishBulkImportJob({ db: env.db, storeId: env.storeId, id: next.id, status: 'completed' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(
      updateBulkImportProgress({
        db: env.db,
        storeId: env.storeId,
        id: next.id,
        processedRows: 2,
        succeededRows: 2,
        failedRows: 0,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await updateBulkImportProgress({
      db: env.db,
      storeId: env.storeId,
      id: next.id,
      processedRows: 1,
      succeededRows: 1,
      failedRows: 0,
    })
    expect(
      (
        await finishBulkImportJob({
          db: env.db,
          storeId: env.storeId,
          id: next.id,
          status: 'completed',
        })
      ).status,
    ).toBe('completed')
  })

  it('recovers interrupted jobs, releases the mutex, expires rows and files', async () => {
    await postConfirmation(app, env.owner.authHeader)
    await postConfirmation(app, env.owner.authHeader, 'customer')
    const rebooted = createBulkImportJobsRoutes({ db: env.db, storageRoot })
    const recovered = await rebooted.request('/', { headers: env.owner.authHeader })
    const { data: interrupted } = (await recovered.json()) as { data: Array<{ status: string }> }
    expect(interrupted).toHaveLength(2)
    expect(interrupted.every((job) => job.status === 'failed')).toBe(true)
    const created = await createBulkImportJob({
      db: env.db,
      storageRoot,
      actor: owner,
      type: 'product',
      mode: 'upsert',
      originalFilename: 'after-recovery.xlsx',
      totalRows: 1,
      file: bytes,
    })
    await env.db
      .update(bulkImportJobs)
      .set({ expiresAt: new Date('2020-01-01') })
      .where(eq(bulkImportJobs.id, created.id))
    await expect(
      getBulkImportJob({ db: env.db, actor: owner, id: created.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(await deleteExpiredBulkImportJobs({ db: env.db, storageRoot })).toBe(1)
    expect((await readdir(join(storageRoot, env.storeId))).includes(`${created.id}.xlsx`)).toBe(
      false,
    )
    expect(await deleteExpiredBulkImportJobs({ db: env.db, storageRoot })).toBe(0)
    const missingFile = await createBulkImportJob({
      db: env.db,
      storageRoot,
      actor: owner,
      type: 'supplier',
      mode: 'upsert',
      originalFilename: 'missing.xlsx',
      totalRows: 1,
      file: bytes,
    })
    await rm(join(storageRoot, env.storeId, `${missingFile.id}.xlsx`))
    await env.db
      .update(bulkImportJobs)
      .set({ expiresAt: new Date('2020-01-01') })
      .where(eq(bulkImportJobs.id, missingFile.id))
    expect(await deleteExpiredBulkImportJobs({ db: env.db, storageRoot })).toBe(1)
  })

  it('rejects a substituted symlink rather than exposing another local file', async () => {
    const job = await createBulkImportJob({
      db: env.db,
      storageRoot,
      actor: owner,
      type: 'product',
      mode: 'create-only',
      originalFilename: 'safe.xlsx',
      totalRows: 1,
      file: bytes,
    })
    const path = join(storageRoot, env.storeId, `${job.id}.xlsx`)
    const secret = join(storageRoot, 'not-an-import.xlsx')
    await writeFile(secret, 'sensitive')
    await rm(path)
    await symlink(secret, path)
    await expect(
      downloadBulkImportFile({ db: env.db, storageRoot, actor: owner, id: job.id }),
    ).rejects.toThrow('escaped')
    await rm(path)
    await rm(secret)
  })
  it('rejects bad uploads before persisting a row or file', async () => {
    const invalid = await app.request(
      '/confirm?type=product&mode=create-only&filename=../escape.xlsx&totalRows=1',
      {
        method: 'POST',
        headers: { ...env.owner.authHeader, 'Content-Type': 'application/octet-stream' },
        body: new Uint8Array(bytes),
      },
    )
    expect(invalid.status).toBe(400)
    const control = await app.request(
      '/confirm?type=product&mode=create-only&filename=unsafe%00.xlsx&totalRows=1',
      {
        method: 'POST',
        headers: { ...env.owner.authHeader, 'Content-Type': 'application/octet-stream' },
        body: new Uint8Array(bytes),
      },
    )
    expect(control.status).toBe(400)
    const oversized = await app.request(
      '/confirm?type=product&mode=create-only&filename=ok.xlsx&totalRows=1',
      {
        method: 'POST',
        headers: {
          ...env.owner.authHeader,
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(10 * 1024 * 1024 + 1),
        },
        body: new Uint8Array(bytes),
      },
    )
    expect(oversized.status).toBe(400)
    expect(await env.db.select().from(bulkImportJobs)).toEqual([])
    await expect(readdir(join(storageRoot, env.storeId))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('retains expired rows when persistent storage is unavailable', async () => {
    const job = await createBulkImportJob({
      db: env.db,
      storageRoot,
      actor: owner,
      type: 'supplier',
      mode: 'upsert',
      originalFilename: 'source.xlsx',
      totalRows: 1,
      file: bytes,
    })
    await env.db
      .update(bulkImportJobs)
      .set({ expiresAt: new Date('2020-01-01') })
      .where(eq(bulkImportJobs.id, job.id))
    await rm(storageRoot, { recursive: true })
    await expect(deleteExpiredBulkImportJobs({ db: env.db, storageRoot })).rejects.toMatchObject({
      code: 'ENOENT',
    })
    expect(await env.db.select().from(bulkImportJobs)).toHaveLength(1)
  })
})

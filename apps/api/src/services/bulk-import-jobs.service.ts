import { and, desc, eq, gt, gte, inArray, lt, lte } from 'drizzle-orm'
import { constants } from 'node:fs'
import { access, lstat, mkdir, open, readFile, realpath, unlink } from 'node:fs/promises'
import { isAbsolute, join, resolve, sep } from 'node:path'
import { uuidv7 } from 'uuidv7'

import {
  type BulkImportJob,
  bulkImportJobs,
  type BulkImportMode,
  type BulkImportType,
} from '@kiotviet-lite/shared/schema'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { isUniqueViolation } from '../lib/pg-errors.js'
import type { AuthContext } from '../middleware/auth.middleware.js'

// Structural DB surface shared by the pool and Drizzle transaction handles.
export type BulkImportJobDb = Pick<Db, 'insert' | 'select' | 'update' | 'delete'>

export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024
export const MAX_IMPORT_ROWS = 100_000
export const IMPORT_RETENTION_DAYS = 30
const ACTIVE_INDEX = 'uniq_bulk_import_jobs_active_store_type'
const retentionMs = IMPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000
// Uncommitted write progress is visible on the handling process without lying about
// committed success. The DB transaction is still the sole source of durable counts.
const liveProgress = new Map<string, { storeId: string; processedRows: number }>()

export function publishBulkImportProgress(
  storeId: string,
  id: string,
  processedRows: number,
): void {
  liveProgress.set(id, { storeId, processedRows })
}

export function clearBulkImportProgress(id: string): void {
  liveProgress.delete(id)
}

function visibleJob(job: BulkImportJob): BulkImportJob {
  const progress = liveProgress.get(job.id)
  if (job.status !== 'running' || progress?.storeId !== job.storeId) return job
  // Do not display 100% until the final CAS and the domain transaction commit.
  return { ...job, processedRows: Math.min(job.totalRows - 1, progress.processedRows) }
}

export function importStorageRoot(): string {
  const configured = process.env.BULK_IMPORT_DIR
  if (!configured || !isAbsolute(configured)) {
    throw new Error('BULK_IMPORT_DIR must be an absolute persistent directory')
  }
  return resolve(configured)
}

export async function verifyImportStorageRoot(root: string): Promise<void> {
  if (!isAbsolute(root)) throw new Error('Import storage root must be absolute')
  const stat = await lstat(root)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Import storage root is unsafe')
  await access(root, constants.R_OK | constants.W_OK | constants.X_OK)
}

function assertOwner(actor: AuthContext): void {
  if (actor.role !== 'owner')
    throw new ApiError('FORBIDDEN', 'Chỉ chủ cửa hàng mới được nhập dữ liệu')
}

function fileName(name: string): string {
  if (
    !name ||
    name.length > 255 ||
    name.includes('/') ||
    name.includes('\\') ||
    !name.toLowerCase().endsWith('.xlsx')
  ) {
    throw new ApiError('VALIDATION_ERROR', 'Tên tệp XLSX không hợp lệ')
  }
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) {
      throw new ApiError('VALIDATION_ERROR', 'Tên tệp XLSX không hợp lệ')
    }
  }
  return name
}

function assertUuid(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiError('VALIDATION_ERROR', 'ID không hợp lệ')
  }
}

function paths(root: string, storeId: string, id: string) {
  assertUuid(storeId)
  assertUuid(id)
  const base = resolve(root)
  const dir = join(base, storeId)
  return { base, dir, file: join(dir, `${id}.xlsx`) }
}

async function storeDirectory(root: string, storeId: string, id: string): Promise<string> {
  const target = paths(root, storeId, id)
  await verifyImportStorageRoot(target.base)
  try {
    await mkdir(target.dir, { mode: 0o700 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  const stat = await lstat(target.dir)
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error('Unsafe import storage directory')
  const base = await realpath(target.base)
  if ((await realpath(target.dir)) !== join(base, storeId)) {
    throw new Error('Import storage directory escaped its root')
  }
  return target.file
}

async function storedFile(root: string, storeId: string, id: string): Promise<string> {
  const target = paths(root, storeId, id)
  const base = await realpath(target.base)
  const actual = await realpath(target.file)
  if (!actual.startsWith(`${base}${sep}`) || actual !== join(base, storeId, `${id}.xlsx`)) {
    throw new Error('Import file escaped its store directory')
  }
  const stat = await lstat(target.file)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Unsafe import file')
  return actual
}

export async function createBulkImportJob(args: {
  db: BulkImportJobDb
  storageRoot: string
  actor: AuthContext
  type: BulkImportType
  mode: BulkImportMode
  originalFilename: string
  totalRows: number
  file: Uint8Array
  digest: string
  approveNewNames: boolean
}): Promise<BulkImportJob> {
  const { db, storageRoot, actor, type, mode, totalRows, file } = args
  if (!/^[0-9a-f]{64}$/.test(args.digest))
    throw new ApiError('VALIDATION_ERROR', 'Mã xác nhận không hợp lệ')
  assertOwner(actor)
  const originalFilename = fileName(args.originalFilename)
  if (
    !['product', 'customer', 'supplier'].includes(type) ||
    !['create-only', 'upsert'].includes(mode)
  ) {
    throw new ApiError('VALIDATION_ERROR', 'Loại hoặc chế độ nhập không hợp lệ')
  }
  if (!Number.isSafeInteger(totalRows) || totalRows < 0 || totalRows > MAX_IMPORT_ROWS) {
    throw new ApiError('VALIDATION_ERROR', 'Số dòng vượt giới hạn')
  }
  if (
    file.byteLength < 4 ||
    file.byteLength > MAX_IMPORT_FILE_BYTES ||
    file[0] !== 0x50 ||
    file[1] !== 0x4b ||
    file[2] !== 0x03 ||
    file[3] !== 0x04
  ) {
    throw new ApiError('VALIDATION_ERROR', 'Tệp XLSX không hợp lệ hoặc vượt giới hạn 10 MB')
  }
  const id = uuidv7()
  const now = new Date()
  const path = await storeDirectory(storageRoot, actor.storeId, id)
  const handle = await open(
    path,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
    0o600,
  )
  try {
    try {
      await handle.writeFile(file)
      await handle.sync()
    } finally {
      await handle.close()
    }
  } catch (error) {
    await unlink(path)
    throw error
  }
  try {
    const [job] = await db
      .insert(bulkImportJobs)
      .values({
        id,
        storeId: actor.storeId,
        createdBy: actor.userId,
        type,
        mode,
        originalFilename,
        confirmedDigest: args.digest,
        approveNewNames: args.approveNewNames,
        fileSizeBytes: file.byteLength,
        totalRows,
        expiresAt: new Date(now.getTime() + retentionMs),
      })
      .returning()
    return job!
  } catch (error) {
    await unlink(path)
    if (isUniqueViolation(error, ACTIVE_INDEX)) {
      throw new ApiError('CONFLICT', 'Đang có tác vụ nhập cùng loại cho cửa hàng')
    }
    throw error
  }
}

export async function listBulkImportJobs(args: {
  db: BulkImportJobDb
  actor: AuthContext
  limit?: number
}) {
  assertOwner(args.actor)
  const limit = args.limit ?? 50
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new ApiError('VALIDATION_ERROR', 'Giới hạn danh sách không hợp lệ')
  }
  const jobs = await args.db
    .select()
    .from(bulkImportJobs)
    .where(
      and(eq(bulkImportJobs.storeId, args.actor.storeId), gt(bulkImportJobs.expiresAt, new Date())),
    )
    .orderBy(desc(bulkImportJobs.createdAt), desc(bulkImportJobs.id))
    .limit(limit)
  return jobs.map(visibleJob)
}

export async function getBulkImportJob(args: {
  db: BulkImportJobDb
  actor: AuthContext
  id: string
}) {
  assertOwner(args.actor)
  assertUuid(args.id)
  const [job] = await args.db
    .select()
    .from(bulkImportJobs)
    .where(
      and(
        eq(bulkImportJobs.id, args.id),
        eq(bulkImportJobs.storeId, args.actor.storeId),
        gt(bulkImportJobs.expiresAt, new Date()),
      ),
    )
  if (!job) throw new ApiError('NOT_FOUND', 'Không tìm thấy tác vụ nhập')
  return visibleJob(job)
}

async function readOriginalWorkbook(job: BulkImportJob, storageRoot: string): Promise<Buffer> {
  try {
    const path = await storedFile(storageRoot, job.storeId, job.id)
    const bytes = await readFile(path)
    if (bytes.byteLength !== job.fileSizeBytes) throw new Error('Import file size mismatch')
    return bytes
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ApiError('NOT_FOUND', 'Không tìm thấy tệp gốc')
    }
    throw error
  }
}

export async function downloadBulkImportFile(args: {
  db: BulkImportJobDb
  storageRoot: string
  actor: AuthContext
  id: string
}): Promise<{ job: BulkImportJob; bytes: Buffer }> {
  const job = await getBulkImportJob(args)
  return { job, bytes: await readOriginalWorkbook(job, args.storageRoot) }
}

// Executor entry point: the tenant-scoped job ID is never interpreted as a filesystem path.
export async function loadBulkImportJobFile(args: {
  db: BulkImportJobDb
  storageRoot: string
  storeId: string
  id: string
}): Promise<{ job: BulkImportJob; bytes: Buffer }> {
  assertUuid(args.storeId)
  assertUuid(args.id)
  const [job] = await args.db
    .select()
    .from(bulkImportJobs)
    .where(
      and(
        eq(bulkImportJobs.id, args.id),
        eq(bulkImportJobs.storeId, args.storeId),
        gt(bulkImportJobs.expiresAt, new Date()),
      ),
    )
  if (!job) throw new ApiError('NOT_FOUND', 'Không tìm thấy tác vụ nhập')
  return { job, bytes: await readOriginalWorkbook(job, args.storageRoot) }
}

// Workers must pass the tenant ID from the claimed job; no unscoped transitions exist.
export async function claimBulkImportJob(args: {
  db: BulkImportJobDb
  storeId: string
  id: string
}) {
  assertUuid(args.storeId)
  assertUuid(args.id)
  const now = new Date()
  const [job] = await args.db
    .update(bulkImportJobs)
    .set({ status: 'running', startedAt: now, updatedAt: now })
    .where(
      and(
        eq(bulkImportJobs.storeId, args.storeId),
        eq(bulkImportJobs.id, args.id),
        eq(bulkImportJobs.status, 'queued'),
        gt(bulkImportJobs.expiresAt, now),
      ),
    )
    .returning()
  if (!job) throw new ApiError('CONFLICT', 'Tác vụ không còn ở hàng đợi')
  return job
}

export async function updateBulkImportProgress(args: {
  db: BulkImportJobDb
  storeId: string
  id: string
  processedRows: number
  succeededRows: number
  failedRows: number
}) {
  assertUuid(args.storeId)
  assertUuid(args.id)
  const { processedRows, succeededRows, failedRows } = args
  if (
    ![processedRows, succeededRows, failedRows].every((v) => Number.isSafeInteger(v) && v >= 0) ||
    processedRows > MAX_IMPORT_ROWS ||
    succeededRows + failedRows > processedRows
  ) {
    throw new ApiError('VALIDATION_ERROR', 'Tiến độ nhập không hợp lệ')
  }
  const [job] = await args.db
    .update(bulkImportJobs)
    .set({ processedRows, succeededRows, failedRows, updatedAt: new Date() })
    .where(
      and(
        eq(bulkImportJobs.storeId, args.storeId),
        eq(bulkImportJobs.id, args.id),
        eq(bulkImportJobs.status, 'running'),
        lte(bulkImportJobs.processedRows, processedRows),
        lte(bulkImportJobs.succeededRows, succeededRows),
        lte(bulkImportJobs.failedRows, failedRows),
        gte(bulkImportJobs.totalRows, processedRows),
      ),
    )
    .returning()
  if (!job) throw new ApiError('CONFLICT', 'Tiến độ không thể cập nhật')
  return job
}

export async function finishBulkImportJob(args: {
  db: BulkImportJobDb
  storeId: string
  id: string
  status: 'completed' | 'failed'
  errorMessage?: string
}) {
  assertUuid(args.storeId)
  assertUuid(args.id)
  if (args.errorMessage && (args.status !== 'failed' || args.errorMessage.length > 2000)) {
    throw new ApiError('VALIDATION_ERROR', 'Thông báo lỗi không hợp lệ')
  }
  const now = new Date()
  const [job] = await args.db
    .update(bulkImportJobs)
    .set({
      status: args.status,
      errorMessage: args.errorMessage ?? null,
      finishedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(bulkImportJobs.storeId, args.storeId),
        eq(bulkImportJobs.id, args.id),
        eq(bulkImportJobs.status, 'running'),
        args.status === 'completed'
          ? eq(bulkImportJobs.processedRows, bulkImportJobs.totalRows)
          : undefined,
      ),
    )
    .returning()
  if (!job) throw new ApiError('CONFLICT', 'Tác vụ không còn chạy')
  return job
}

export async function cancelBulkImportJob(args: {
  db: BulkImportJobDb
  actor: AuthContext
  id: string
}) {
  assertOwner(args.actor)
  assertUuid(args.id)
  const now = new Date()
  const [job] = await args.db
    .update(bulkImportJobs)
    .set({ status: 'cancelled', finishedAt: now, updatedAt: now })
    .where(
      and(
        eq(bulkImportJobs.storeId, args.actor.storeId),
        eq(bulkImportJobs.id, args.id),
        inArray(bulkImportJobs.status, ['queued', 'running']),
        gt(bulkImportJobs.expiresAt, now),
      ),
    )
    .returning()
  if (!job) throw new ApiError('CONFLICT', 'Không thể hủy tác vụ')
  return job
}

// Only running jobs were interrupted; queued jobs remain available for the next runner.
export async function recoverInterruptedBulkImportJobs(
  db: BulkImportJobDb,
): Promise<BulkImportJob[]> {
  const now = new Date()
  return db
    .update(bulkImportJobs)
    .set({
      status: 'failed',
      errorMessage: 'Tác vụ bị gián đoạn khi máy chủ khởi động lại',
      finishedAt: now,
      updatedAt: now,
    })
    .where(eq(bulkImportJobs.status, 'running'))
    .returning()
}

// Call at startup and periodically (e.g. daily). Failed unlink retains the row for a retry.
export async function deleteExpiredBulkImportJobs(args: {
  db: BulkImportJobDb
  storageRoot: string
  now?: Date
}): Promise<number> {
  await verifyImportStorageRoot(args.storageRoot)
  const expired = await args.db
    .select()
    .from(bulkImportJobs)
    .where(lt(bulkImportJobs.expiresAt, args.now ?? new Date()))
  let deleted = 0
  for (const job of expired) {
    const path = paths(args.storageRoot, job.storeId, job.id).file
    try {
      // Refuse to follow an unexpected symlink or an escaped store directory.
      await storedFile(args.storageRoot, job.storeId, job.id)
      await unlink(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const rows = await args.db
      .delete(bulkImportJobs)
      .where(
        and(
          eq(bulkImportJobs.id, job.id),
          eq(bulkImportJobs.storeId, job.storeId),
          lt(bulkImportJobs.expiresAt, args.now ?? new Date()),
        ),
      )
      .returning({ id: bulkImportJobs.id })
    deleted += rows.length
  }
  return deleted
}

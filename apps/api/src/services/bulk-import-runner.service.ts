import { and, eq, gt, isNull } from 'drizzle-orm'

import { brands, type BulkImportJob, bulkImportJobs, categories } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { isShuttingDown } from '../lib/lifecycle.js'
import { logger, withLogContext } from '../lib/logger.js'
import type { AuthContext } from '../middleware/auth.middleware.js'
import { createBrand } from './brands.service.js'
import { BULK_EXPORT_CATEGORY_SEPARATOR } from './bulk-export.service.js'
import {
  claimBulkImportJob,
  clearBulkImportProgress,
  finishBulkImportJob,
  loadBulkImportJobFile,
  publishBulkImportProgress,
  requeueInterruptedBulkImportJob,
  updateBulkImportProgress,
} from './bulk-import-jobs.service.js'
import { type BulkImportKind, previewBulkImport } from './bulk-import-preview.service.js'
import { createCategory } from './categories.service.js'
import { createCustomer, updateCustomer } from './customers.service.js'
import { createProduct, updateProduct } from './products.service.js'
import { createSupplier, updateSupplier } from './suppliers.service.js'

const BATCH_SIZE = 100
const QUEUE_POLL_MS = 10_000
const normalize = (value: string) => value.trim().toLowerCase()
type RunArgs = { db: Db; storageRoot: string; storeId: string; id: string }

// GL-11: runner biết tiến trình đang tắt. Job đang chạy được theo dõi để tắt êm chờ có hạn;
// quá hạn thì cờ abort làm vòng lặp dòng ném lỗi, transaction rollback, job về hàng đợi.
const activeRuns = new Set<Promise<void>>()
let abortRequested = false
let pollTimer: NodeJS.Timeout | undefined

class ShutdownInterruption extends Error {
  constructor() {
    super('Máy chủ đang tắt; tác vụ sẽ chạy lại khi khởi động')
  }
}

function assertNotAborted(): void {
  if (abortRequested) throw new ShutdownInterruption()
}

/** Claims once. Domain writes, audits, and the completed state commit together or all roll back. */
export function runBulkImportJob(args: RunArgs): Promise<void> {
  // Đang tắt: không nhận job mới, job vẫn ở hàng đợi cho lần khởi động sau.
  if (isShuttingDown()) return Promise.resolve()
  // GL-22: mọi log phát ra trong job (kể cả "supplier.created" của bản ghi bị rollback)
  // mang jobId để đối chiếu với kết quả cuối của job.
  const run = withLogContext({ jobId: args.id }, () => executeBulkImportJob(args))
  activeRuns.add(run)
  void run.finally(() => activeRuns.delete(run)).catch(() => {})
  return run
}

async function executeBulkImportJob({ db, storageRoot, storeId, id }: RunArgs) {
  let claimed: BulkImportJob
  try {
    claimed = await claimBulkImportJob({ db, storeId, id })
  } catch (error) {
    if (error instanceof ApiError && error.code === 'CONFLICT') return
    throw error
  }
  logger.info(
    { jobId: id, storeId, status: 'running', jobType: claimed.type },
    'Import job started',
  )
  try {
    const { job, bytes } = await loadBulkImportJobFile({ db, storageRoot, storeId, id })
    const actor: AuthContext = { storeId, userId: job.createdBy, role: 'owner' }
    const kind = `${job.type}s` as BulkImportKind
    // Reject stale confirmations before taking the long write transaction; check again
    // inside it in case tenant data changed between preflight and the first write.
    const preflight = await previewBulkImport({
      db,
      actor,
      kind,
      mode: job.mode,
      bytes,
      filename: job.originalFilename,
    })
    if (preflight.digest !== job.confirmedDigest || preflight.totalRows !== job.totalRows) {
      throw new ApiError(
        'CONFLICT',
        'Dữ liệu cửa hàng đã thay đổi kể từ khi xác nhận; vui lòng xem trước lại',
      )
    }
    assertNotAborted()
    if (preflight.errors.length)
      throw new ApiError('VALIDATION_ERROR', `Tệp có lỗi tại dòng ${preflight.errors[0]!.row}`)
    if (!job.approveNewNames && (preflight.newCategories.length || preflight.newBrands.length)) {
      throw new ApiError('VALIDATION_ERROR', 'Danh mục hoặc thương hiệu mới chưa được chấp thuận')
    }
    await db.transaction(async (tx) => {
      const transactionalDb = tx as unknown as Db
      const plan = await previewBulkImport({
        db: transactionalDb,
        actor,
        kind,
        mode: job.mode,
        bytes,
        filename: job.originalFilename,
      })
      if (plan.digest !== job.confirmedDigest || plan.totalRows !== job.totalRows) {
        throw new ApiError(
          'CONFLICT',
          'Dữ liệu cửa hàng đã thay đổi kể từ khi xác nhận; vui lòng xem trước lại',
        )
      }
      if (plan.errors.length)
        throw new ApiError('VALIDATION_ERROR', `Tệp có lỗi tại dòng ${plan.errors[0]!.row}`)
      if (!job.approveNewNames && (plan.newCategories.length || plan.newBrands.length)) {
        throw new ApiError('VALIDATION_ERROR', 'Danh mục hoặc thương hiệu mới chưa được chấp thuận')
      }
      const categoryIds = new Map<string, string>()
      const brandIds = new Map<string, string>()
      if (kind === 'products') {
        const existingCategories = await tx
          .select()
          .from(categories)
          .where(eq(categories.storeId, storeId))
        const byId = new Map(existingCategories.map((category) => [category.id, category]))
        for (const category of existingCategories) {
          const parent = category.parentId ? byId.get(category.parentId) : undefined
          const path = parent
            ? `${parent.name}${BULK_EXPORT_CATEGORY_SEPARATOR}${category.name}`
            : category.name
          categoryIds.set(normalize(path), category.id)
        }
        for (const path of plan.newCategories) {
          const parts = path.split(BULK_EXPORT_CATEGORY_SEPARATOR)
          const parentId = parts.length === 2 ? categoryIds.get(normalize(parts[0]!)) : null
          if (parts.length === 2 && !parentId)
            throw new ApiError('CONFLICT', `Không tìm thấy danh mục cha: ${parts[0]}`)
          const category = await createCategory({
            db,
            transaction: tx,
            actor,
            input: { name: parts.at(-1)!, parentId },
          })
          categoryIds.set(normalize(path), category.id)
        }
        const existingBrands = await tx
          .select()
          .from(brands)
          .where(and(eq(brands.storeId, storeId), isNull(brands.deletedAt)))
        for (const brand of existingBrands) brandIds.set(normalize(brand.name), brand.id)
        for (const name of plan.newBrands) {
          const brand = await createBrand({ db, transaction: tx, actor, input: { name } })
          brandIds.set(normalize(name), brand.id)
        }
      }
      for (let index = 0; index < plan.rows.length; index++) {
        const row = plan.rows[index]!
        assertNotAborted()
        if (row.action === 'error')
          throw new ApiError('VALIDATION_ERROR', `Tệp có lỗi tại dòng ${row.row}`)
        try {
          if (row.action !== 'no-op') {
            const input = { ...row.input }
            if (kind === 'products') {
              if (row.categoryPath) input.categoryId = categoryIds.get(normalize(row.categoryPath))
              if (row.brandName) input.brandId = brandIds.get(normalize(row.brandName))
              if (row.action === 'create')
                await createProduct({
                  db,
                  transaction: tx,
                  actor,
                  input: input as Parameters<typeof createProduct>[0]['input'],
                })
              else
                await updateProduct({
                  db,
                  transaction: tx,
                  actor,
                  productId: row.targetId!,
                  input: input as Parameters<typeof updateProduct>[0]['input'],
                })
            } else if (kind === 'customers') {
              if (row.action === 'create')
                await createCustomer({
                  db,
                  transaction: tx,
                  actor,
                  input: input as Parameters<typeof createCustomer>[0]['input'],
                })
              else
                await updateCustomer({
                  db,
                  transaction: tx,
                  actor,
                  targetId: row.targetId!,
                  input: input as Parameters<typeof updateCustomer>[0]['input'],
                })
            } else {
              if (row.action === 'create')
                await createSupplier({
                  db,
                  transaction: tx,
                  actor,
                  input: input as Parameters<typeof createSupplier>[0]['input'],
                })
              else
                await updateSupplier({
                  db,
                  transaction: tx,
                  actor,
                  targetId: row.targetId!,
                  input: input as Parameters<typeof updateSupplier>[0]['input'],
                })
            }
          }
        } catch (error) {
          throw new Error(
            `Dòng ${row.row}: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          )
        }
        if ((index + 1) % BATCH_SIZE === 0 || index + 1 === plan.totalRows) {
          await updateBulkImportProgress({
            db: tx,
            storeId,
            id,
            processedRows: index + 1,
            succeededRows: index + 1,
            failedRows: 0,
          })
          publishBulkImportProgress(storeId, id, index + 1)
        }
      }
      await finishBulkImportJob({ db: tx, storeId, id, status: 'completed' })
    })
    logger.info(
      { jobId: id, storeId, status: 'completed', jobType: claimed.type },
      'Import job completed',
    )
  } catch (error) {
    if (error instanceof ShutdownInterruption) {
      try {
        await requeueInterruptedBulkImportJob({ db, storeId, id })
        logger.warn(
          { jobId: id, storeId, status: 'queued', jobType: claimed.type, errorCode: 'SHUTDOWN' },
          'Import job requeued after shutdown',
        )
      } catch {
        // Không trả được về hàng đợi (pool đã đóng): lần khởi động sau đánh dấu failed rõ ràng.
        logger.error(
          { jobId: id, storeId, status: 'running', errorCode: 'SHUTDOWN_REQUEUE_FAILED' },
          'Import job requeue failed',
        )
      }
      return
    }
    const message = error instanceof Error ? error.message : String(error)
    const errorCode = error instanceof ApiError ? error.code : 'UNEXPECTED_ERROR'
    try {
      await finishBulkImportJob({
        db,
        storeId,
        id,
        status: 'failed',
        errorMessage: message.slice(0, 2000),
      })
      logger.error(
        { jobId: id, storeId, status: 'failed', jobType: claimed.type, errorCode },
        'Import job failed',
      )
    } catch (finishError) {
      // A concurrent owner cancellation wins; no domain writes survive the failed final CAS.
      if (finishError instanceof ApiError && finishError.code === 'CONFLICT') return
      logger.error(
        {
          jobId: id,
          storeId,
          status: 'running',
          errorCode: finishError instanceof ApiError ? finishError.code : 'UNEXPECTED_ERROR',
        },
        'Import job status update failed',
      )
      throw finishError
    }
  } finally {
    clearBulkImportProgress(id)
  }
}

export function startBulkImportRunner(args: RunArgs): void {
  setImmediate(() => {
    void runBulkImportJob(args).catch((error: unknown) =>
      logger.error(
        {
          jobId: args.id,
          storeId: args.storeId,
          errorCode: error instanceof ApiError ? error.code : 'UNEXPECTED_ERROR',
        },
        'Import runner failed',
      ),
    )
  })
}

export async function runQueuedBulkImportJobs({
  db,
  storageRoot,
}: {
  db: Db
  storageRoot: string
}): Promise<void> {
  if (isShuttingDown()) return
  const queued = await db
    .select({ id: bulkImportJobs.id, storeId: bulkImportJobs.storeId })
    .from(bulkImportJobs)
    .where(and(eq(bulkImportJobs.status, 'queued'), gt(bulkImportJobs.expiresAt, new Date())))
  await Promise.all(queued.map((job) => runBulkImportJob({ db, storageRoot, ...job })))
}

export function pollBulkImportQueue(args: { db: Db; storageRoot: string }): void {
  void runQueuedBulkImportJobs(args).catch((error: unknown) =>
    logger.error(
      { errorCode: error instanceof ApiError ? error.code : 'UNEXPECTED_ERROR' },
      'Import queue poll failed',
    ),
  )
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = setInterval(() => {
    void runQueuedBulkImportJobs(args).catch((error: unknown) =>
      logger.error(
        { errorCode: error instanceof ApiError ? error.code : 'UNEXPECTED_ERROR' },
        'Import queue poll failed',
      ),
    )
  }, QUEUE_POLL_MS).unref()
}

function waitFor(runs: Promise<void>[], ms: number): Promise<boolean> {
  if (!runs.length) return Promise.resolve(true)
  let timer: NodeJS.Timeout | undefined
  return Promise.race([
    Promise.allSettled(runs).then(() => true),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

/**
 * Gọi khi tắt êm (sau khi lifecycle đã chuyển sang shutting down): dừng poller, cho job
 * đang chạy tối đa `graceMs` để xong; quá hạn thì yêu cầu dừng tại ranh giới dòng và chờ
 * thêm `abortMs` cho rollback và trả job về hàng đợi. Không bao giờ chờ vô hạn.
 */
export async function drainBulkImportRunner({
  graceMs,
  abortMs,
}: {
  graceMs: number
  abortMs: number
}): Promise<{ finished: boolean; interrupted: number }> {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = undefined
  const running = [...activeRuns]
  if (await waitFor(running, graceMs)) return { finished: true, interrupted: 0 }
  const interrupted = activeRuns.size
  abortRequested = true
  logger.warn({ activeJobs: interrupted }, 'Import jobs interrupted by shutdown')
  const finished = await waitFor([...activeRuns], abortMs)
  return { finished, interrupted }
}

/** Chỉ dùng trong test. */
export function resetBulkImportRunnerForTest(): void {
  abortRequested = false
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = undefined
}

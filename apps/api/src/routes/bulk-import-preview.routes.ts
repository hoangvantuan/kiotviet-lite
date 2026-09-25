import { Hono } from 'hono'
import { rateLimiter } from 'hono-rate-limiter'
import * as XLSX from 'xlsx'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import {
  createBulkImportJob,
  importStorageRoot,
  verifyImportStorageRoot,
} from '../services/bulk-import-jobs.service.js'
import {
  BULK_IMPORT_MAX_BYTES,
  type BulkImportKind,
  type BulkImportMode,
  type BulkImportRowError,
  previewBulkImport,
  requiresConversionApproval,
} from '../services/bulk-import-preview.service.js'
import { startBulkImportRunner } from '../services/bulk-import-runner.service.js'

const uploadRateLimit = rateLimiter({
  windowMs: 60_000,
  limit: 6,
  keyGenerator: (c) => `${c.get('auth').storeId}:${c.get('auth').userId}`,
  skip: () =>
    process.env.NODE_ENV === 'test' ||
    (process.env.NODE_ENV !== 'production' && process.env.RATE_LIMIT_DISABLED === 'true'),
  message: {
    error: { code: 'RATE_LIMITED', message: 'Quá nhiều lần tải tệp, vui lòng thử lại sau' },
  },
})
const MAX_MULTIPART_BYTES = BULK_IMPORT_MAX_BYTES + 16 * 1024

export async function readBulkImportUpload(
  request: Request,
  confirm = false,
): Promise<{
  bytes: Uint8Array
  filename: string
  mode: BulkImportMode
  digest?: string
  approveNewNames?: boolean
  approveConversions?: boolean
}> {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('multipart/form-data;')) {
    throw new ApiError('VALIDATION_ERROR', 'Cần gửi một tệp XLSX bằng multipart/form-data')
  }
  const length = Number(request.headers.get('Content-Length'))
  if (Number.isFinite(length) && length > MAX_MULTIPART_BYTES) {
    throw new ApiError('VALIDATION_ERROR', 'Tệp tải lên vượt giới hạn 8 MB')
  }
  const reader = request.body?.getReader()
  if (!reader) throw new ApiError('VALIDATION_ERROR', 'Thiếu nội dung tệp tải lên')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
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
  } finally {
    reader.releaseLock()
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  let form: FormData
  try {
    form = await new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      body,
    }).formData()
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'Nội dung multipart không hợp lệ')
  }
  const allowed = confirm
    ? ['file', 'mode', 'digest', 'approveNewNames', 'approveConversions']
    : ['file', 'mode']
  if ([...form.keys()].some((key) => !allowed.includes(key))) {
    throw new ApiError('VALIDATION_ERROR', 'Trường tải lên không hợp lệ')
  }
  const files = form.getAll('file')
  const modes = form.getAll('mode')
  if (files.length !== 1 || !(files[0] instanceof File)) {
    throw new ApiError('VALIDATION_ERROR', 'Chỉ được gửi đúng một tệp XLSX ở trường file')
  }
  if (modes.length !== 1 || (modes[0] !== 'create-only' && modes[0] !== 'upsert')) {
    throw new ApiError('VALIDATION_ERROR', 'Chế độ nhập phải là create-only hoặc upsert')
  }
  const file = files[0]
  if (file.size > BULK_IMPORT_MAX_BYTES)
    throw new ApiError('VALIDATION_ERROR', 'Tệp XLSX vượt giới hạn 8 MB')
  if (!confirm)
    return {
      bytes: new Uint8Array(await file.arrayBuffer()),
      filename: file.name,
      mode: modes[0] as BulkImportMode,
    }
  const digests = form.getAll('digest')
  const approvals = form.getAll('approveNewNames')
  // Optional for older clients: absent means not approved.
  const conversionApprovals = form.getAll('approveConversions')
  if (
    digests.length !== 1 ||
    typeof digests[0] !== 'string' ||
    !/^[a-f0-9]{64}$/.test(digests[0])
  ) {
    throw new ApiError('VALIDATION_ERROR', 'Mã xác nhận không hợp lệ')
  }
  if (approvals.length !== 1 || (approvals[0] !== 'true' && approvals[0] !== 'false')) {
    throw new ApiError('VALIDATION_ERROR', 'Phải xác nhận việc tạo tên mới')
  }
  if (
    conversionApprovals.length > 1 ||
    (conversionApprovals.length === 1 &&
      conversionApprovals[0] !== 'true' &&
      conversionApprovals[0] !== 'false')
  ) {
    throw new ApiError('VALIDATION_ERROR', 'Giá trị chấp thuận thay đổi tự động không hợp lệ')
  }
  return {
    bytes: new Uint8Array(await file.arrayBuffer()),
    filename: file.name,
    mode: modes[0] as BulkImportMode,
    digest: digests[0],
    approveNewNames: approvals[0] === 'true',
    approveConversions: conversionApprovals[0] === 'true',
  }
}

function importKind(kind: string): BulkImportKind {
  if (kind !== 'products' && kind !== 'customers' && kind !== 'suppliers') {
    throw new ApiError('VALIDATION_ERROR', 'Loại dữ liệu nhập không hợp lệ')
  }
  return kind
}

export function createBulkImportPreviewRoutes({
  db,
  storageRoot,
  schedule,
}: {
  db: Db
  storageRoot?: string
  schedule?: (storeId: string, id: string) => void
}) {
  const app = new Hono()
  app.onError(errorHandler)
  app.use('*', requireAuth(db))
  app.use('*', async (c, next) => {
    if (c.get('auth').role !== 'owner')
      throw new ApiError('FORBIDDEN', 'Chỉ chủ cửa hàng được nhập dữ liệu')
    await next()
  })
  app.post('/:kind/preview', uploadRateLimit, async (c) => {
    const kind = importKind(c.req.param('kind'))
    const { bytes, mode, filename } = await readBulkImportUpload(c.req.raw)
    const preview = await previewBulkImport({
      db,
      actor: c.get('auth'),
      kind,
      mode,
      bytes,
      filename,
    })
    return c.json({
      data: {
        kind: preview.kind,
        mode: preview.mode,
        filename: preview.filename,
        totalRows: preview.totalRows,
        creates: preview.creates,
        updates: preview.updates,
        noOps: preview.noOps,
        errors: preview.errors,
        newCategories: preview.newCategories,
        newBrands: preview.newBrands,
        warnings: preview.warnings,
        sourceFormat: preview.sourceFormat,
        conversions: preview.conversions,
        sample: preview.sample,
        digest: preview.digest,
      },
    })
  })
  app.post('/:kind/confirm', uploadRateLimit, async (c) => {
    const kind = importKind(c.req.param('kind'))
    const { bytes, mode, filename, digest, approveNewNames, approveConversions } =
      await readBulkImportUpload(c.req.raw, true)
    const actor = c.get('auth')
    const plan = await previewBulkImport({ db, actor, kind, mode, bytes, filename })
    if (plan.digest !== digest)
      throw new ApiError('CONFLICT', 'Bản xem trước đã thay đổi; vui lòng xem lại tệp')
    if (plan.errors.length)
      throw new ApiError('VALIDATION_ERROR', 'Tệp chứa dòng dữ liệu không hợp lệ', plan.errors)
    if (!approveNewNames && (plan.newCategories.length || plan.newBrands.length)) {
      throw new ApiError('VALIDATION_ERROR', 'Cần chấp thuận tạo danh mục hoặc thương hiệu mới')
    }
    if (!approveConversions && requiresConversionApproval(plan))
      throw new ApiError('VALIDATION_ERROR', 'Cần chấp thuận các thay đổi tự động trong báo cáo')
    const root = storageRoot ?? importStorageRoot()
    await verifyImportStorageRoot(root)
    const job = await createBulkImportJob({
      db,
      storageRoot: root,
      actor,
      type: kind.slice(0, -1) as 'product' | 'customer' | 'supplier',
      mode,
      originalFilename: filename,
      totalRows: plan.totalRows,
      file: bytes,
      digest: plan.digest,
      approveNewNames: !!approveNewNames,
      approveConversions: !!approveConversions,
    })
    if (schedule) schedule(actor.storeId, job.id)
    else startBulkImportRunner({ db, storageRoot: root, storeId: actor.storeId, id: job.id })
    return c.json({ data: job }, 201)
  })
  app.post('/errors.xlsx', uploadRateLimit, async (c) => {
    if (c.req.header('Content-Type')?.split(';')[0]?.toLowerCase() !== 'application/json') {
      throw new ApiError('VALIDATION_ERROR', 'Cần gửi danh sách lỗi dạng JSON')
    }
    const maxBytes = 16 * 1024 * 1024
    const length = Number(c.req.header('Content-Length'))
    if (Number.isFinite(length) && length > maxBytes)
      throw new ApiError('VALIDATION_ERROR', 'Danh sách lỗi quá lớn')
    const reader = c.req.raw.body?.getReader()
    if (!reader) throw new ApiError('VALIDATION_ERROR', 'Thiếu danh sách lỗi')
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > maxBytes) {
          await reader.cancel()
          throw new ApiError('VALIDATION_ERROR', 'Danh sách lỗi quá lớn')
        }
        chunks.push(value)
      }
    } finally {
      reader.releaseLock()
    }
    const body = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      body.set(chunk, offset)
      offset += chunk.byteLength
    }
    let value: unknown
    try {
      value = JSON.parse(new TextDecoder().decode(body))
    } catch {
      throw new ApiError('VALIDATION_ERROR', 'Dữ liệu JSON không hợp lệ')
    }
    const errors = (value as { errors?: unknown } | null)?.errors
    if (
      !Array.isArray(errors) ||
      errors.length > 120_000 ||
      errors.some(
        (item) =>
          !item ||
          !Number.isSafeInteger(item.row) ||
          item.row < 1 ||
          item.row > 12_001 ||
          typeof item.column !== 'string' ||
          item.column.length > 100 ||
          typeof item.message !== 'string' ||
          item.message.length > 1000,
      )
    ) {
      throw new ApiError('VALIDATION_ERROR', 'Danh sách lỗi không hợp lệ')
    }
    const book = XLSX.utils.book_new()
    // SheetJS serializes strings as text cells, including text beginning with spreadsheet formula markers.
    const rows = [
      ['Dòng', 'Cột', 'Thông báo'],
      ...(errors as BulkImportRowError[]).map((item) => [item.row, item.column, item.message]),
    ]
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Lỗi nhập liệu')
    const bytes = XLSX.write(book, { bookType: 'xlsx', type: 'buffer' }) as Buffer
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="import-errors.xlsx"',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  })
  return app
}

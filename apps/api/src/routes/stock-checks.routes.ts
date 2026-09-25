import { Hono } from 'hono'
import { z } from 'zod'

import {
  createStockCheckBodySchema,
  listStockChecksQuerySchema,
  updateStockCheckBodySchema,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { parseJson } from '../lib/http.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import { getRequestMeta } from '../services/audit.service.js'
import { BULK_IMPORT_MAX_BYTES } from '../services/bulk-import-preview.service.js'
import {
  confirmStockCheckImport,
  previewStockCheckImport,
  stockImportRequiresApproval,
} from '../services/stock-check-import.service.js'
import {
  confirmStockCheck,
  createStockCheck,
  deleteStockCheck,
  getStockCheckById,
  listStockChecks,
  updateStockCheck,
} from '../services/stock-checks.service.js'
import { readMultipartForm } from './bulk-import-preview.routes.js'

const uuidParam = z.string().uuid('ID không hợp lệ')

async function readStockImportUpload(request: Request, confirm: boolean) {
  const form = await readMultipartForm(request)
  const allowed = confirm ? ['file', 'digest', 'approveConversions'] : ['file']
  if ([...form.keys()].some((key) => !allowed.includes(key))) {
    throw new ApiError('VALIDATION_ERROR', 'Trường tải lên không hợp lệ')
  }
  const files = form.getAll('file')
  if (files.length !== 1 || !(files[0] instanceof File)) {
    throw new ApiError('VALIDATION_ERROR', 'Chỉ được gửi đúng một tệp XLSX ở trường file')
  }
  const file = files[0]
  if (file.size > BULK_IMPORT_MAX_BYTES) {
    throw new ApiError('VALIDATION_ERROR', 'Tệp XLSX vượt giới hạn 8 MB')
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!confirm) return { bytes, filename: file.name, digest: '', approveConversions: false }
  const digests = form.getAll('digest')
  const approvals = form.getAll('approveConversions')
  if (
    digests.length !== 1 ||
    typeof digests[0] !== 'string' ||
    !/^[a-f0-9]{64}$/.test(digests[0])
  ) {
    throw new ApiError('VALIDATION_ERROR', 'Mã xác nhận không hợp lệ')
  }
  if (
    approvals.length > 1 ||
    (approvals.length === 1 && approvals[0] !== 'true' && approvals[0] !== 'false')
  ) {
    throw new ApiError('VALIDATION_ERROR', 'Giá trị chấp thuận thay đổi tự động không hợp lệ')
  }
  return {
    bytes,
    filename: file.name,
    digest: digests[0],
    approveConversions: approvals[0] === 'true',
  }
}

export interface StockChecksRoutesDeps {
  db: Db
}

export function createStockChecksRoutes({ db }: StockChecksRoutesDeps) {
  const app = new Hono()
  app.onError(errorHandler)
  app.use('*', requireAuth(db))
  app.use('*', requirePermission('inventory.manage'))

  app.get('/', async (c) => {
    const auth = c.get('auth')
    const query = listStockChecksQuerySchema.parse(c.req.query())
    const result = await listStockChecks({ db, storeId: auth.storeId, query })
    return c.json({
      data: result.items,
      meta: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
        counts: result.counts,
      },
    })
  })

  app.post('/', async (c) => {
    const auth = c.get('auth')
    const input = await parseJson(c, createStockCheckBodySchema)
    const data = await createStockCheck({
      db,
      actor: auth,
      input,
      meta: getRequestMeta(c),
    })
    return c.json({ data }, 201)
  })

  // GL-02: nhập tồn đầu kỳ từ tệp thành các phiếu kiểm nháp. Đặt trước /:id/confirm.
  app.post('/import/preview', async (c) => {
    const { bytes, filename } = await readStockImportUpload(c.req.raw, false)
    const preview = await previewStockCheckImport({ db, actor: c.get('auth'), bytes, filename })
    return c.json({
      data: {
        filename: preview.filename,
        totalRows: preview.totalRows,
        items: preview.items.length,
        checks: preview.checks,
        totalDiffPositive: preview.items.reduce((sum, item) => sum + Math.max(item.diff, 0), 0),
        totalDiffNegative: preview.items.reduce((sum, item) => sum + Math.min(item.diff, 0), 0),
        errors: preview.errors,
        conversions: preview.conversions,
        requiresApproval: stockImportRequiresApproval(preview),
        sample: preview.items.slice(0, 20).map((item) => ({
          row: item.row,
          sku: item.productSkuSnapshot,
          name: item.productNameSnapshot,
          variantLabel: item.variantLabelSnapshot,
          systemQty: item.systemQty,
          actualQty: item.actualQty,
        })),
        digest: preview.digest,
      },
    })
  })

  app.post('/import/confirm', async (c) => {
    const upload = await readStockImportUpload(c.req.raw, true)
    const data = await confirmStockCheckImport({
      db,
      actor: c.get('auth'),
      ...upload,
      meta: getRequestMeta(c),
    })
    return c.json({ data }, 201)
  })

  // Mount /:id/confirm BEFORE /:id (although Hono usually handles, defensive)
  app.post('/:id/confirm', async (c) => {
    const auth = c.get('auth')
    const id = uuidParam.parse(c.req.param('id'))
    const data = await confirmStockCheck({
      db,
      actor: auth,
      stockCheckId: id,
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  app.get('/:id', async (c) => {
    const auth = c.get('auth')
    const id = uuidParam.parse(c.req.param('id'))
    const data = await getStockCheckById({ db, storeId: auth.storeId, stockCheckId: id })
    return c.json({ data })
  })

  app.patch('/:id', async (c) => {
    const auth = c.get('auth')
    const id = uuidParam.parse(c.req.param('id'))
    const input = await parseJson(c, updateStockCheckBodySchema)
    const data = await updateStockCheck({
      db,
      actor: auth,
      stockCheckId: id,
      input,
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  app.delete('/:id', async (c) => {
    const auth = c.get('auth')
    const id = uuidParam.parse(c.req.param('id'))
    const data = await deleteStockCheck({
      db,
      actor: auth,
      stockCheckId: id,
      meta: getRequestMeta(c),
    })
    return c.json({ data })
  })

  return app
}

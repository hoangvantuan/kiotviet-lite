import { type Context, Hono } from 'hono'
import { z } from 'zod'

import {
  listCustomersQuerySchema,
  listProductsQuerySchema,
  listSuppliersQuerySchema,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { errorHandler } from '../middleware/error-handler.js'
import { type BulkExportKind, createBulkWorkbook } from '../services/bulk-export.service.js'

const kindSchema = z.enum(['products', 'customers', 'suppliers'])
const xlsxMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export function createBulkExportRoutes({ db }: { db: Db }) {
  const app = new Hono()
  app.onError(errorHandler)
  app.use('*', requireAuth(db))
  app.use('*', async (c, next) => {
    if (c.get('auth').role !== 'owner' && c.get('auth').role !== 'manager') {
      throw new ApiError('FORBIDDEN', 'Bạn không có quyền xuất dữ liệu')
    }
    await next()
  })

  function download(c: Context, kind: BulkExportKind, template: boolean) {
    const storeId = c.get('auth').storeId
    const query = c.req.query()
    const body = template
      ? createBulkWorkbook(db, storeId, { kind, template: true })
      : kind === 'products'
        ? createBulkWorkbook(db, storeId, {
            kind,
            filters: listProductsQuerySchema.omit({ page: true, pageSize: true }).parse(query),
          })
        : kind === 'customers'
          ? createBulkWorkbook(db, storeId, {
              kind,
              filters: listCustomersQuerySchema.omit({ page: true, pageSize: true }).parse(query),
            })
          : createBulkWorkbook(db, storeId, {
              kind,
              filters: listSuppliersQuerySchema.omit({ page: true, pageSize: true }).parse(query),
            })
    c.header('Content-Type', xlsxMime)
    c.header(
      'Content-Disposition',
      `attachment; filename="${kind}-${template ? 'template' : 'export'}.xlsx"`,
    )
    return c.body(body)
  }

  app.get('/:kind/template', (c) => download(c, kindSchema.parse(c.req.param('kind')), true))
  app.get('/:kind/export', (c) => download(c, kindSchema.parse(c.req.param('kind')), false))
  return app
}

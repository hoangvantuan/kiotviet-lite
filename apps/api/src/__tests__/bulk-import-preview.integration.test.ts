import { count, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import { brands, categories, customerGroups, customers, products, stores, suppliers } from '@kiotviet-lite/shared'

import { errorHandler } from '../middleware/error-handler.js'
import { createBulkExportRoutes } from '../routes/bulk-export.routes.js'
import { createBulkImportPreviewRoutes } from '../routes/bulk-import-preview.routes.js'
import { BULK_EXPORT_HEADERS } from '../services/bulk-export.service.js'
import type { BulkImportPreview } from '../services/bulk-import-preview.service.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.ACCESS_TOKEN_TTL_SECONDS = '900'
  process.env.REFRESH_TOKEN_TTL_SECONDS = '604800'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

function workbook(kind: keyof typeof BULK_EXPORT_HEADERS, rows: unknown[][], headers: readonly string[] = BULK_EXPORT_HEADERS[kind]) {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([[...headers], ...rows]), 'Dữ liệu')
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Bỏ qua sheet hướng dẫn']]), 'Hướng dẫn')
  return new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }))
}

function upload(app: Hono, kind: string, bytes: Uint8Array, mode: string, authorization: string | undefined, filename = 'import.xlsx') {
  const form = new FormData()
  form.append('file', new File([Buffer.from(bytes)], filename, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  form.append('mode', mode)
  return app.request(`/api/v1/bulk-import/${kind}/preview`, { method: 'POST', body: form,
    headers: authorization ? { Authorization: authorization } : {} })
}

async function payload(response: Response): Promise<{ data: BulkImportPreview; error: { message: string } }> {
  return await response.json() as { data: BulkImportPreview; error: { message: string } }
}

describe('bulk import preview over HTTP (PGlite)', () => {
  let env: TestEnv
  let app: Hono
  beforeAll(async () => {
    env = await createTestEnv()
    app = new Hono()
    app.onError(errorHandler)
    app.route('/api/v1/bulk-import', createBulkImportPreviewRoutes({ db: env.db }))
    app.route('/api/v1/bulk-export', createBulkExportRoutes({ db: env.db }))
  }, 30000)
  afterAll(async () => { await env?.close() })

  it('rejects malformed ZIP, wrong sheet and missing headers without mutating data', async () => {
    const auth = env.owner.authHeader.Authorization
    const malformed = await upload(app, 'products', new TextEncoder().encode('PK not zip'), 'upsert', auth)
    expect(malformed.status).toBe(400)
    expect((await payload(malformed)).error.message).toMatch(/XLSX/)
    const expanded = workbook('suppliers', [])
    const zip = new DataView(expanded.buffer)
    for (let offset = 0; offset < expanded.length - 46; offset++) {
      if (zip.getUint32(offset, true) === 0x02014b50) {
        zip.setUint32(offset + 24, 70 * 1024 * 1024, true)
        break
      }
    }
    const zipBomb = await upload(app, 'suppliers', expanded, 'upsert', auth)
    expect(zipBomb.status).toBe(400)
    expect((await payload(zipBomb)).error.message).toContain('64 MB')
    const missing = await upload(app, 'customers', workbook('customers', [], ['Mã khách hàng']), 'upsert', auth)
    expect(missing.status).toBe(400)
    expect((await payload(missing)).error.message).toContain('Tên khách hàng')
    const renamed = await upload(app, 'customers',
      workbook('customers', [], ['Mã khách hàng ', ...BULK_EXPORT_HEADERS.customers.slice(1)]),
      'upsert', auth)
    expect(renamed.status).toBe(400)
    expect((await payload(renamed)).error.message).toContain('Mã khách hàng')
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([[...BULK_EXPORT_HEADERS.products]]), 'Khác')
    const wrongSheet = await upload(app, 'products', new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' })), 'upsert', auth)
    expect(wrongSheet.status).toBe(400)
    expect((await payload(wrongSheet)).error.message).toContain('Dữ liệu')
  })

  it('collects multiple field errors and duplicate keys at both sheet rows', async () => {
    const bytes = workbook('customers', [
      ['KH-A', '', 'bad', 'not-email'],
      ['kh-a', 'Khách hai', '123', 'also-invalid'],
      ['KH-B', 'Khách ba', '', '', '', '', '', '10.000'],
    ])
    const response = await upload(app, 'customers', bytes, 'create-only', env.owner.authHeader.Authorization)
    expect(response.status).toBe(200)
    const { data } = await payload(response)
    expect(data.creates).toBe(0)
    expect(data.errors.filter((error: { row: number; column: string }) => error.column === 'Mã khách hàng').map((error: { row: number }) => error.row)).toEqual([2, 3])
    expect(new Set(data.errors.map((error: { row: number }) => error.row))).toEqual(new Set([2, 3, 4]))
    expect(data.errors.some((error: { column: string }) => error.column === 'Hạn mức nợ')).toBe(true)
    const missingPrice = await payload(await upload(app, 'products',
      workbook('products', [['SP-NOPRICE', 'Ống nhựa']]), 'create-only', env.owner.authHeader.Authorization))
    expect(missingPrice.data.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 2, column: 'Giá bán', message: 'Thiếu giá trị cột Giá bán' }),
    ]))
    expect((await env.db.select({ count: count() }).from(customers))[0]?.count).toBe(0)
  })

  it('distinguishes create-only conflicts, upsert no-ops, blank retention and explicit nullable clears', async () => {
    await env.db.insert(suppliers).values({ storeId: env.storeId, code: 'NCC-EXIST', name: 'Nhà cung cấp A', phone: '0901234567' })
    const rows = [['ncc-exist', '', '__XOA__'], ['NCC-NEW', 'Nhà cung cấp B', '']]
    const bytes = workbook('suppliers', rows)
    const forbiddenUpdate = await upload(app, 'suppliers', bytes, 'create-only', env.owner.authHeader.Authorization)
    const conflictData = (await payload(forbiddenUpdate)).data
    expect(conflictData.creates).toBe(1)
    expect(conflictData.errors).toEqual(expect.arrayContaining([expect.objectContaining({ row: 2, column: 'Mã nhà cung cấp' })]))
    const update = await upload(app, 'suppliers', bytes, 'upsert', env.owner.authHeader.Authorization)
    const { data } = await payload(update)
    expect(data.updates).toBe(1)
    expect(data.creates).toBe(1)
    expect(data.rows[0]?.input).toEqual({ phone: null })
    expect(data.rows[0]?.targetId).toBeTruthy()
    const unchanged = await upload(app, 'suppliers', workbook('suppliers', [['ncc-exist', '', '']]), 'upsert', env.owner.authHeader.Authorization)
    expect((await payload(unchanged)).data.noOps).toBe(1)
    expect((await env.db.select().from(suppliers).where(eq(suppliers.code, 'NCC-EXIST')))[0]?.phone).toBe('0901234567')
  })

  it('preserves exported records as no-ops and ignores product stock changes', async () => {
    await env.db.insert(products).values({ storeId: env.storeId, sku: 'SP-EXIST', name: 'Ống nhựa', sellingPrice: 12, trackInventory: true, currentStock: 17 })
    await env.db.insert(customers).values({ storeId: env.storeId, code: 'KH-EXIST', name: 'Khách mẫu' })
    for (const kind of ['products', 'customers', 'suppliers'] as const) {
      const exported = await app.request(`/api/v1/bulk-export/${kind}/export`, { headers: env.owner.authHeader })
      expect(exported.status).toBe(200)
      const result = await upload(app, kind, new Uint8Array(await exported.arrayBuffer()), 'upsert', env.owner.authHeader.Authorization)
      expect(result.status).toBe(200)
      const { data } = await payload(result)
      expect(data.errors).toEqual([])
      expect(data.creates).toBe(0)
      expect(data.updates).toBe(0)
      expect(data.noOps).toBe(1)
      if (kind === 'products') expect(data.warnings.join(' ')).toContain('Tồn kho (chỉ xem)')
    }
    const changedStock = workbook('products', [['SP-EXIST', '', '', '', '', '', '', '', '', '', '', '', '', '', 999]])
    const stock = await upload(app, 'products', changedStock, 'upsert', env.owner.authHeader.Authorization)
    expect((await payload(stock)).data.noOps).toBe(1)
    expect((await env.db.select().from(products).where(eq(products.sku, 'SP-EXIST')))[0]?.currentStock).toBe(17)
  })

  it('resolves only tenant-local records and paths; lists missing product category and brand', async () => {
    const [other] = await env.db.insert(stores).values({ name: 'Cửa hàng khác' }).returning()
    await env.db.insert(products).values({ storeId: other!.id, sku: 'SP-OTHER', name: 'Khác', sellingPrice: 5 })
    await env.db.insert(categories).values({ storeId: other!.id, name: 'Ống nhựa' })
    await env.db.insert(brands).values({ storeId: other!.id, name: 'Bình Minh' })
    const bytes = workbook('products', [['SP-OTHER', 'Ống nhựa PVC', '', 'Ống nhựa > PVC', 'Bình Minh', 100]])
    const response = await upload(app, 'products', bytes, 'upsert', env.owner.authHeader.Authorization)
    const { data } = await payload(response)
    expect(data.creates).toBe(1)
    expect(data.updates).toBe(0)
    expect(data.newCategories).toEqual(['Ống nhựa', 'Ống nhựa > PVC'])
    expect(data.newBrands).toEqual(['Bình Minh'])
    expect(data.rows[0]?.targetId).toBeUndefined()
    expect((await env.db.select({ count: count() }).from(products).where(eq(products.storeId, env.storeId)))[0]?.count).toBe(1)
  })

  it('matches existing category, brand and customer group names in exported workbooks', async () => {
    const [parent] = await env.db.insert(categories).values({ storeId: env.storeId, name: 'Thiết bị' }).returning()
    const [child] = await env.db.insert(categories).values({ storeId: env.storeId, name: 'Ống', parentId: parent!.id }).returning()
    const [brand] = await env.db.insert(brands).values({ storeId: env.storeId, name: 'Nhựa Việt' }).returning()
    const [group] = await env.db.insert(customerGroups).values({ storeId: env.storeId, name: 'Khách sỉ' }).returning()
    await env.db.update(products).set({ categoryId: child!.id, brandId: brand!.id }).where(eq(products.sku, 'SP-EXIST'))
    await env.db.update(customers).set({ groupId: group!.id }).where(eq(customers.code, 'KH-EXIST'))
    for (const kind of ['products', 'customers'] as const) {
      const exported = await app.request(`/api/v1/bulk-export/${kind}/export`, { headers: env.owner.authHeader })
      const result = await upload(app, kind, new Uint8Array(await exported.arrayBuffer()), 'upsert', env.owner.authHeader.Authorization)
      const { data } = await payload(result)
      expect(data.errors).toEqual([])
      expect(data.updates).toBe(0)
      expect(data.noOps).toBe(1)
      expect(data.newCategories).toEqual([])
      expect(data.newBrands).toEqual([])
    }
  })

  it('ignores extra columns but rejects formulas, forbidden clear tokens, and oversized row count', async () => {
    const headers = [...BULK_EXPORT_HEADERS.suppliers, 'Bỏ qua']
    const extra = workbook('suppliers', [['NCC-EXTRA', 'Nhà cung cấp mới', '', '', '', '', '', 'không nhập']], headers)
    const accepted = await payload(await upload(app, 'suppliers', extra, 'create-only', env.owner.authHeader.Authorization))
    expect(accepted.data.creates).toBe(1)
    const book = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet([headers, ['NCC-FORMULA', 'Nhà cung cấp mới', '', '', '', '', '', '']])
    sheet['D2'] = { t: 'n', f: '1+1', v: 2 }
    sheet['B2'] = { t: 's', v: '__XOA__' }
    XLSX.utils.book_append_sheet(book, sheet, 'Dữ liệu')
    const formula = new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }))
    const invalid = await payload(await upload(app, 'suppliers', formula, 'upsert', env.owner.authHeader.Authorization))
    expect(invalid.data.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 2, column: 'Tên nhà cung cấp' }),
      expect.objectContaining({ row: 2, column: 'Email' }),
    ]))
    const tooMany = workbook('suppliers', Array.from({ length: 12001 }, (_, index) => [`LIMIT-${index}`, `Nhà cung cấp ${index}`]))
    const response = await upload(app, 'suppliers', tooMany, 'create-only', env.owner.authHeader.Authorization)
    expect(response.status).toBe(400)
    expect((await payload(response)).error.message).toContain('12000')
  }, 90000)

  it('permits only the owner, rejects invalid mode and oversize content before parsing', async () => {
    const bytes = workbook('suppliers', [])
    for (const auth of [undefined, env.staff.authHeader.Authorization, env.manager.authHeader.Authorization]) {
      const response = await upload(app, 'suppliers', bytes, 'upsert', auth)
      expect(response.status).toBe(auth ? 403 : 401)
    }
    expect((await upload(app, 'suppliers', bytes, 'merge', env.owner.authHeader.Authorization)).status).toBe(400)
    const oversized = await app.request('/api/v1/bulk-import/suppliers/preview', { method: 'POST',
      headers: { ...env.owner.authHeader, 'Content-Type': 'multipart/form-data; boundary=whatever', 'Content-Length': '99999999' }, body: 'invalid' })
    expect(oversized.status).toBe(400)
    expect((await payload(oversized)).error.message).toContain('8 MB')
  })

  it('previews 11,055 rows within the request budget and reports measured elapsed time', async () => {
    const rows = Array.from({ length: 11055 }, (_, i) => [`IMP-${String(i).padStart(5, '0')}`, `Nhà cung cấp ${i}`])
    const bytes = workbook('suppliers', rows)
    const start = performance.now()
    const result = await upload(app, 'suppliers', bytes, 'create-only', env.owner.authHeader.Authorization)
    const elapsed = Math.round(performance.now() - start)
    expect(result.status).toBe(200)
    const { data } = await payload(result)
    expect(data.errors).toEqual([])
    expect(data.creates).toBe(11055)
    expect(data.totalRows).toBe(11055)
    expect(elapsed).toBeLessThan(60_000)
    console.info(`bulk import preview benchmark: 11,055 rows, ${bytes.byteLength} XLSX bytes, ${elapsed} ms`)
  }, 90000)
})

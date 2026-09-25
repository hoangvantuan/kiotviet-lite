import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import { customers, products, suppliers } from '@kiotviet-lite/shared'

import { BULK_EXPORT_HEADERS } from '../services/bulk-export.service.js'
import { previewBulkImport } from '../services/bulk-import-preview.service.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

function workbook(headers: readonly string[], rows: unknown[][], sheetName = 'Dữ liệu') {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([[...headers], ...rows]), sheetName)
  return new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }))
}

describe('bulk import d3 go-live (PGlite)', () => {
  let env: TestEnv
  const actor = () => ({ storeId: env.storeId, userId: env.owner.id, role: 'owner' as const })
  const preview = (
    kind: keyof typeof BULK_EXPORT_HEADERS,
    bytes: Uint8Array,
    mode: 'create-only' | 'upsert' = 'upsert',
  ) => previewBulkImport({ db: env.db, actor: actor(), kind, mode, bytes, filename: 'x.xlsx' })

  beforeAll(async () => {
    env = await createTestEnv()
    await env.db.insert(products).values({
      storeId: env.storeId,
      sku: 'CO-SAN',
      name: 'Hàng có sẵn',
      barcode: '8930000000001',
      sellingPrice: 1000,
    })
    await env.db.insert(customers).values({
      storeId: env.storeId,
      code: 'KH-CO-SAN',
      name: 'Khách có sẵn',
      phone: '0911000001',
    })
    await env.db.insert(suppliers).values({
      storeId: env.storeId,
      code: 'NCC-CO-SAN',
      name: 'Công ty Có Sẵn',
      phone: '0911000002',
    })
  }, 30000)
  afterAll(async () => {
    await env?.close()
  })

  describe('GL-08: preview checks every unique index the write checks', () => {
    it('rejects supplier names and phones duplicated in the file or already in the store', async () => {
      const result = await preview(
        'suppliers',
        workbook(BULK_EXPORT_HEADERS.suppliers, [
          ['NCC1', 'Công ty An Phát', '0922000001'],
          ['NCC2', 'CÔNG TY AN PHÁT', '0922000002'],
          ['NCC3', 'công ty có sẵn', '0922000003'],
          ['NCC4', 'Công ty Bốn', '0922000001'],
          ['NCC5', 'Công ty Năm', '0911000002'],
          ['NCC6', 'Công ty Sáu', '0922000006'],
        ]),
      )
      expect(result.errors).toEqual([
        { row: 3, column: 'Tên nhà cung cấp', message: expect.stringContaining('dòng 2 và 3') },
        { row: 4, column: 'Tên nhà cung cấp', message: 'Tên nhà cung cấp đã được sử dụng' },
        { row: 5, column: 'Điện thoại', message: expect.stringContaining('dòng 2 và 5') },
        { row: 6, column: 'Điện thoại', message: 'Số điện thoại đã được sử dụng' },
      ])
      expect(result.creates).toBe(2)
    })

    it('rejects product barcodes and customer phones that the write would reject', async () => {
      const productResult = await preview(
        'products',
        workbook(BULK_EXPORT_HEADERS.products, [
          ['SP1', 'Hàng một', '8930000000009', null, null, 1000],
          ['SP2', 'Hàng hai', '8930000000009', null, null, 1000],
          ['SP3', 'Hàng ba', '8930000000001', null, null, 1000],
        ]),
      )
      expect(productResult.errors.map((error) => [error.row, error.column])).toEqual([
        [3, 'Mã vạch'],
        [4, 'Mã vạch'],
      ])
      expect(productResult.errors[1]!.message).toBe('Barcode đã tồn tại trong cửa hàng')

      const customerResult = await preview(
        'customers',
        workbook(BULK_EXPORT_HEADERS.customers, [
          ['KH1', 'Khách một', '0911000001'],
          ['KH2', 'Khách hai', '0933000002'],
        ]),
      )
      expect(customerResult.errors).toEqual([
        { row: 2, column: 'Điện thoại', message: 'Số điện thoại đã được sử dụng' },
      ])
    })

    it('allows a record to keep or hand over its own value in sequential order', async () => {
      const result = await preview(
        'suppliers',
        workbook(BULK_EXPORT_HEADERS.suppliers, [
          ['NCC-CO-SAN', 'Công ty Có Sẵn Mới', '0911000009'],
          ['NCC7', 'Công ty Có Sẵn', '0911000002'],
        ]),
      )
      expect(result.errors).toEqual([])
      expect(result.updates).toBe(1)
      expect(result.creates).toBe(1)
    })
  })
})

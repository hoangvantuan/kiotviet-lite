import { Hono } from 'hono'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import {
  brands,
  categories,
  customerGroups,
  customers,
  products,
  stores,
  suppliers,
} from '@kiotviet-lite/shared'

import { signAccessToken } from '../lib/jwt.js'
import { errorHandler } from '../middleware/error-handler.js'
import { createBulkExportRoutes } from '../routes/bulk-export.routes.js'
import { BULK_EXPORT_HEADERS } from '../services/bulk-export.service.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.ACCESS_TOKEN_TTL_SECONDS = '900'
  process.env.REFRESH_TOKEN_TTL_SECONDS = '604800'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

async function sheet(response: Response) {
  expect(response.status).toBe(200)
  expect(response.headers.get('Content-Type')).toContain('spreadsheetml.sheet')
  expect(response.headers.get('Content-Disposition')).toContain('.xlsx')
  const workbook = XLSX.read(new Uint8Array(await response.arrayBuffer()), { type: 'array' })
  return {
    workbook,
    rows: XLSX.utils.sheet_to_json<(string | number)[]>(workbook.Sheets['Dữ liệu']!, {
      header: 1,
      defval: '',
    }),
  }
}

describe('bulk XLSX downloads over authenticated HTTP', () => {
  let env: TestEnv
  let app: Hono
  beforeAll(async () => {
    env = await createTestEnv()
    app = new Hono()
    app.onError(errorHandler)
    app.route('/api/v1/bulk-export', createBulkExportRoutes({ db: env.db }))
  }, 30000)
  afterAll(async () => {
    await env?.close()
  })

  it('provides distinct, import-ready empty first sheets and Vietnamese examples on a separate sheet', async () => {
    for (const kind of ['products', 'customers', 'suppliers'] as const) {
      const { workbook, rows } = await sheet(
        await app.request(`/api/v1/bulk-export/${kind}/template`, {
          headers: env.owner.authHeader,
        }),
      )
      expect(rows).toEqual([[...BULK_EXPORT_HEADERS[kind]]])
      expect(rows[0]?.[0]).toBe(
        kind === 'products'
          ? 'Mã hàng'
          : kind === 'customers'
            ? 'Mã khách hàng'
            : 'Mã nhà cung cấp',
      )
      expect(workbook.SheetNames).toEqual(['Dữ liệu', 'Hướng dẫn'])
      const guide = XLSX.utils.sheet_to_json<(string | number)[]>(workbook.Sheets['Hướng dẫn']!, {
        header: 1,
        defval: '',
      })
      expect(guide[2]).toContain(
        kind === 'products'
          ? 'Ống nhựa Bình Minh'
          : kind === 'customers'
            ? 'Nguyễn Văn An'
            : 'Công ty Bình Minh',
      )
      expect(guide.flat().join(' ')).toContain('__XOA__')
    }
  })

  it('exports tenant-scoped list filters and names as plain cells; manager allowed, staff forbidden', async () => {
    const [parent] = await env.db
      .insert(categories)
      .values({ storeId: env.storeId, name: 'Ống nhựa' })
      .returning()
    const [child] = await env.db
      .insert(categories)
      .values({ storeId: env.storeId, name: 'PVC', parentId: parent!.id })
      .returning()
    const [brand] = await env.db
      .insert(brands)
      .values({ storeId: env.storeId, name: 'Bình Minh' })
      .returning()
    const [group] = await env.db
      .insert(customerGroups)
      .values({ storeId: env.storeId, name: 'Khách sỉ' })
      .returning()
    await env.db.insert(products).values([
      {
        storeId: env.storeId,
        sku: 'SP-PVC',
        name: 'Ống nhựa PVC',
        categoryId: child!.id,
        brandId: brand!.id,
        sellingPrice: 120000,
        currentStock: 17,
        trackInventory: true,
      },
      {
        storeId: env.storeId,
        sku: 'SP-KEO',
        name: 'Keo dán',
        sellingPrice: 5000,
        status: 'inactive',
        trackInventory: true,
        minStock: 3,
      },
    ])
    await env.db.insert(customers).values([
      {
        storeId: env.storeId,
        code: 'KH-1',
        name: 'Nguyễn Văn An',
        groupId: group!.id,
        currentDebt: 50000,
      },
      { storeId: env.storeId, code: 'KH-2', name: 'Bình', currentDebt: 0 },
    ])
    await env.db.insert(suppliers).values([
      {
        storeId: env.storeId,
        code: 'NCC-1',
        name: 'Công ty Một',
        notes: '=1+1',
        currentDebt: 20000,
      },
      { storeId: env.storeId, code: 'NCC-2', name: 'Công ty Hai', currentDebt: 0 },
    ])
    const [otherStore] = await env.db.insert(stores).values({ name: 'Other store' }).returning()
    await env.db
      .insert(products)
      .values({ storeId: otherStore!.id, sku: 'SP-SECRET', name: 'Secret', sellingPrice: 1 })
    await env.db
      .insert(customers)
      .values({ storeId: otherStore!.id, code: 'KH-SECRET', name: 'Secret' })
    await env.db
      .insert(suppliers)
      .values({ storeId: otherStore!.id, code: 'NCC-SECRET', name: 'Secret' })
    const otherAuth = {
      Authorization: `Bearer ${signAccessToken({ userId: env.owner.id, storeId: otherStore!.id, role: 'owner' })}`,
    }

    const product = await sheet(
      await app.request(
        `/api/v1/bulk-export/products/export?categoryId=${child!.id}&brandId=${brand!.id}&stockFilter=in_stock&page=99`,
        { headers: env.manager.authHeader },
      ),
    )
    expect(product.rows).toEqual([
      [...BULK_EXPORT_HEADERS.products],
      [
        'SP-PVC',
        'Ống nhựa PVC',
        '',
        'Ống nhựa > PVC',
        'Bình Minh',
        120000,
        '',
        'Cái',
        '',
        '',
        '',
        'active',
        'Có',
        0,
        17,
      ],
    ])
    const noCategory = await sheet(
      await app.request(
        '/api/v1/bulk-export/products/export?categoryId=none&brandId=none&status=inactive&stockFilter=below_min',
        { headers: env.owner.authHeader },
      ),
    )
    expect(noCategory.rows.map((row) => row[0])).toEqual(['Mã hàng', 'SP-KEO'])
    const outOfStock = await sheet(
      await app.request('/api/v1/bulk-export/products/export?stockFilter=out_of_stock', {
        headers: env.owner.authHeader,
      }),
    )
    expect(outOfStock.rows.map((row) => row[0])).toEqual(['Mã hàng', 'SP-KEO'])
    const customer = await sheet(
      await app.request(`/api/v1/bulk-export/customers/export?groupId=${group!.id}&hasDebt=yes`, {
        headers: env.owner.authHeader,
      }),
    )
    expect(customer.rows).toEqual([
      [...BULK_EXPORT_HEADERS.customers],
      ['KH-1', 'Nguyễn Văn An', '', '', '', '', '', '', 'Khách sỉ'],
    ])
    const noGroup = await sheet(
      await app.request('/api/v1/bulk-export/customers/export?groupId=none&hasDebt=no', {
        headers: env.owner.authHeader,
      }),
    )
    expect(noGroup.rows.map((row) => row[0])).toEqual(['Mã khách hàng', 'KH-2'])
    const supplier = await sheet(
      await app.request('/api/v1/bulk-export/suppliers/export?hasDebt=yes', {
        headers: env.manager.authHeader,
      }),
    )
    expect(supplier.rows).toEqual([
      [...BULK_EXPORT_HEADERS.suppliers],
      ['NCC-1', 'Công ty Một', '', '', '', '', '=1+1'],
    ])
    expect(supplier.workbook.Sheets['Dữ liệu']!['G2'].f).toBeUndefined()
    expect(supplier.workbook.Sheets['Dữ liệu']!['G2'].t).toBe('s')
    const noDebt = await sheet(
      await app.request('/api/v1/bulk-export/suppliers/export?hasDebt=no&search=Công', {
        headers: env.owner.authHeader,
      }),
    )
    expect(noDebt.rows.map((row) => row[0])).toEqual(['Mã nhà cung cấp', 'NCC-2'])
    for (const kind of ['products', 'customers', 'suppliers']) {
      const response = await app.request(`/api/v1/bulk-export/${kind}/export`, {
        headers: env.staff.authHeader,
      })
      expect(response.status).toBe(403)
    }
    expect(
      (
        await sheet(
          await app.request('/api/v1/bulk-export/products/export', { headers: otherAuth }),
        )
      ).rows,
    ).toHaveLength(2)
    const unfiltered = await sheet(
      await app.request('/api/v1/bulk-export/products/export', {
        headers: env.owner.authHeader,
      }),
    )
    expect(unfiltered.rows[0]).toEqual(product.rows[0])
    expect(new Set(unfiltered.rows.slice(1).map((row) => row[0]))).toEqual(
      new Set(['SP-PVC', 'SP-KEO']),
    )
  }, 30000)

  it('writes 11,055 rows across keyset batches into a parseable streamed XLSX', async () => {
    const rows = Array.from({ length: 11053 }, (_, i) => ({
      storeId: env.storeId,
      sku: `SP-${String(i).padStart(5, '0')}`,
      name: `Ống nhựa ${i}`,
      sellingPrice: i,
    }))
    for (let i = 0; i < rows.length; i += 500)
      await env.db.insert(products).values(rows.slice(i, i + 500))
    const response = await app.request('/api/v1/bulk-export/products/export', {
      headers: env.owner.authHeader,
    })
    const { rows: exported } = await sheet(response)
    expect(exported).toHaveLength(11056)
    expect(new Set(exported.slice(1).map((row) => row[0])).size).toBe(11055)
    expect(exported.slice(1).some((row) => row[1] === 'Ống nhựa 11052')).toBe(true)
  }, 120000)
})

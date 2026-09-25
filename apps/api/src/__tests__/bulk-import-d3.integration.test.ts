import { eq } from 'drizzle-orm'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import {
  bulkImportJobs,
  customers,
  products,
  productUnitConversions,
  suppliers,
} from '@kiotviet-lite/shared'

import { BULK_EXPORT_HEADERS } from '../services/bulk-export.service.js'
import { createBulkImportJob } from '../services/bulk-import-jobs.service.js'
import {
  type BulkImportPreview,
  previewBulkImport,
  requiresConversionApproval,
} from '../services/bulk-import-preview.service.js'
import { runBulkImportJob } from '../services/bulk-import-runner.service.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

// Header rows exactly as KiotViet exports them (September 2026); fixtures are synthetic.
const KV_PRODUCT_HEADERS = [
  'Loại hàng',
  'Nhóm hàng(3 Cấp)',
  'Mã hàng',
  'Mã vạch',
  'Tên hàng',
  'Tên hàng trên hóa đơn điện tử',
  'Thương hiệu',
  'Giá bán',
  'Tỷ lệ tính thuế(%)',
  'Áp dụng giảm thuế',
  'Giá vốn',
  'Tồn kho',
  'KH đặt',
  'Dự kiến hết hàng',
  'Tồn nhỏ nhất',
  'Tồn lớn nhất',
  'ĐVT',
  'Mã ĐVT Cơ bản',
  'Quy đổi',
  'Thuộc tính',
  'Mã HH Liên quan',
  'Hình ảnh (url1,url2...)',
  'Trọng lượng',
  'Đang kinh doanh',
  'Được bán trực tiếp',
  'Mô tả',
  'Mẫu ghi chú',
  'Vị trí',
  'Hàng thành phần',
  'Thời gian tạo',
]
const KV_CUSTOMER_HEADERS = [
  'Loại khách',
  'Chi nhánh tạo',
  'Mã khách hàng',
  'Tên khách hàng',
  'Điện thoại',
  'Địa chỉ',
  'Khu vực giao hàng',
  'Phường/Xã',
  'Ngày sinh',
  'Giới tính',
  'Email',
  'Facebook',
  'Nhóm khách hàng',
  'Ghi chú',
  'MST (xuất HĐ)',
  'Người tạo',
  'Ngày tạo',
  'Nợ cần thu hiện tại',
  'Tổng bán',
  'Trạng thái',
]
const KV_SUPPLIER_HEADERS = [
  'Mã nhà cung cấp',
  'Tên nhà cung cấp',
  'Email',
  'Điện thoại',
  'Địa chỉ',
  'Khu vực',
  'Phường/Xã',
  'Tổng mua',
  'Nợ cần trả hiện tại',
  'Mã số thuế',
  'Ghi chú',
  'Nhóm nhà cung cấp',
  'Trạng thái',
]

function kvRows(headers: string[], rows: Record<string, unknown>[]) {
  return rows.map((row) => headers.map((name) => row[name] ?? null))
}

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

  async function importAll(
    kind: keyof typeof BULK_EXPORT_HEADERS,
    bytes: Uint8Array,
    approve: { names?: boolean; conversions?: boolean } = { names: true, conversions: true },
  ) {
    const plan = await preview(kind, bytes)
    expect(plan.errors).toEqual([])
    const root = await mkdtemp(join(tmpdir(), 'import-d3-'))
    try {
      const job = await createBulkImportJob({
        db: env.db,
        storageRoot: root,
        actor: actor(),
        type: kind.slice(0, -1) as 'product' | 'customer' | 'supplier',
        mode: 'upsert',
        originalFilename: 'kv.xlsx',
        totalRows: plan.totalRows,
        file: bytes,
        digest: plan.digest,
        approveNewNames: approve.names ?? false,
        approveConversions: approve.conversions ?? false,
      })
      await runBulkImportJob({ db: env.db, storageRoot: root, storeId: env.storeId, id: job.id })
      const [done] = await env.db.select().from(bulkImportJobs).where(eq(bulkImportJobs.id, job.id))
      return { plan, job: done! }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  const codes = (plan: BulkImportPreview) =>
    Object.fromEntries(plan.conversions.map((item) => [`${item.code}:${item.message}`, item.count]))

  describe('GL-01, GL-17, GL-19: KiotViet export imported directly with a conversion report', () => {
    const productFile = () =>
      workbook(
        KV_PRODUCT_HEADERS,
        kvRows(KV_PRODUCT_HEADERS, [
          {
            'Loại hàng': 'Hàng hóa',
            'Nhóm hàng(3 Cấp)': 'Gia dụng>>Nồi>>Nồi nhôm',
            'Mã hàng': 'KV001',
            'Mã vạch': '893 0000 000 111',
            'Tên hàng': 'Nồi nhôm 20cm',
            'Thương hiệu': 'Sunhouse',
            'Giá bán': 125_000.4,
            'Giá vốn': 90_000.6,
            'Tồn kho': 12,
            'Tồn nhỏ nhất': 2,
            ĐVT: 'cái',
            'Mã ĐVT Cơ bản': 'KV001',
            'Quy đổi': 1,
            'Hình ảnh (url1,url2...)': 'https://cdn-images.kiotviet.vn/a/b.jpg',
            'Đang kinh doanh': 1,
            'Vị trí': 'Kệ A',
          },
          {
            'Loại hàng': 'Hàng hóa',
            'Nhóm hàng(3 Cấp)': 'Gia dụng>>Nồi>>Nồi nhôm',
            'Mã hàng': 'KV001-T',
            'Tên hàng': 'Nồi nhôm 20cm (thùng)',
            'Giá bán': 1_400_000,
            ĐVT: 'Thùng',
            'Mã ĐVT Cơ bản': 'KV001',
            'Quy đổi': 12,
            'Đang kinh doanh': 1,
          },
          {
            'Loại hàng': 'Hàng hóa',
            'Nhóm hàng(3 Cấp)': 'Gia dụng',
            'Mã hàng': 'KV`002',
            'Mã vạch': 'Nồi',
            'Tên hàng': 'Chảo chống dính',
            'Giá bán': 80_000,
            'Tồn kho': -3,
            ĐVT: 'Cái',
            'Đang kinh doanh': 0,
          },
          {
            'Loại hàng': 'Hàng hóa',
            'Nhóm hàng(3 Cấp)': 'Gia dụng',
            'Mã hàng': 'KV003',
            'Tên hàng': 'Muôi',
            'Giá bán': 15_000,
            'Đang kinh doanh': 1,
          },
          {
            'Loại hàng': 'Dịch vụ',
            'Mã hàng': 'DV001',
            'Tên hàng': 'Giao hàng tận nơi',
            'Giá bán': 20_000,
            'Đang kinh doanh': 1,
          },
        ]),
        'DanhSachSanPham',
      )

    it('detects the KiotViet layout on any sheet name and reports every automatic change', async () => {
      const plan = await preview('products', productFile())
      expect(plan.sourceFormat).toBe('kiotviet')
      expect(plan.errors).toEqual([])
      expect(plan.totalRows).toBe(4)
      expect(codes(plan)).toMatchObject({
        'number_rounded:Giá bán có phần lẻ, được làm tròn tới số nguyên gần nhất': 1,
        'number_rounded:Giá vốn có phần lẻ, được làm tròn tới số nguyên gần nhất': 1,
        'category_truncated:Nhóm hàng quá 2 cấp, chỉ giữ 2 cấp đầu': 1,
        'barcode_cleaned:Mã vạch bỏ khoảng trắng, dấu chấm, gạch để hợp lệ': 1,
        'value_dropped:Mã vạch không hợp lệ, được để trống': 1,
        'sku_cleaned:Mã hàng có ký tự không hợp lệ, đã bỏ các ký tự đó': 1,
        'unit_case:ĐVT "cái" được gộp thành "Cái"': 1,
        'unit_blank:ĐVT trống được điền "Cái"': 2,
        'unit_conversion_merged:Dòng ĐVT quy đổi được gộp vào hàng ĐVT cơ bản; mã hàng và mã vạch riêng của ĐVT quy đổi không được giữ': 1,
      })
      const image = plan.conversions.find((item) => item.code === 'image_dropped')
      expect(image).toMatchObject({ count: 1, rows: [2], requiresConfirmation: true })
      const stock = plan.conversions.find((item) => item.code === 'stock_ignored')
      expect(stock).toMatchObject({ count: 2, requiresConfirmation: false })
      expect(plan.conversions.find((item) => item.code === 'columns_ignored')?.message).toContain(
        'Vị trí',
      )
      expect(plan.newCategories).toEqual(['Gia dụng', 'Gia dụng > Nồi'])
      expect(requiresConversionApproval(plan)).toBe(true)
    })

    it('refuses to run without conversion approval, then imports exactly what preview showed', async () => {
      const refused = await importAll('products', productFile(), { names: true })
      expect(refused.job.status).toBe('failed')
      expect(refused.job.errorMessage).toContain('thay đổi tự động')

      const { job } = await importAll('products', productFile())
      expect(job.status).toBe('completed')
      const rows = await env.db.select().from(products).where(eq(products.storeId, env.storeId))
      const bySku = new Map(rows.map((row) => [row.sku, row]))
      expect(bySku.get('KV001')).toMatchObject({
        sellingPrice: 125_000,
        costPrice: 90_001,
        unit: 'Cái',
        barcode: '8930000000111',
        imageUrl: null,
        trackInventory: true,
        minStock: 2,
        currentStock: 0,
        status: 'active',
      })
      expect(bySku.get('KV002')).toMatchObject({ barcode: null, status: 'inactive', unit: 'Cái' })
      expect(bySku.get('KV003')?.unit).toBe('Cái')
      expect(bySku.get('DV001')).toMatchObject({ trackInventory: false, unit: 'Cái' })
      expect(bySku.has('KV001-T')).toBe(false)
      const conversions = await env.db
        .select()
        .from(productUnitConversions)
        .where(eq(productUnitConversions.productId, bySku.get('KV001')!.id))
      expect(conversions).toMatchObject([
        { unit: 'Thùng', conversionFactor: 12, sellingPrice: 1_400_000 },
      ])

      // Re-importing the same export is a no-op apart from the unit rows it cannot update.
      const again = await preview('products', productFile())
      expect(again.errors).toEqual([])
      expect(again.creates).toBe(0)
      expect(again.updates).toBe(0)
    })

    it('maps KiotViet customers and suppliers; debt and prepaid balances are reported, not written', async () => {
      const customerPlan = await preview(
        'customers',
        workbook(
          KV_CUSTOMER_HEADERS,
          kvRows(KV_CUSTOMER_HEADERS, [
            {
              'Mã khách hàng': 'KH000101',
              'Tên khách hàng': 'Chị Lan',
              'Điện thoại': '0987.654.321',
              'Địa chỉ': '12 Lê Lợi',
              'Phường/Xã': 'Phường 1',
              'MST (xuất HĐ)': '0101234567',
              'Nợ cần thu hiện tại': 150_000,
              'Trạng thái': 1,
            },
            {
              'Mã khách hàng': 'KH000102',
              'Tên khách hàng': 'Anh Minh',
              'Điện thoại': '113',
              Email: 'khong-phai-email',
              'Nhóm khách hàng': 'Khách sỉ',
              'Nợ cần thu hiện tại': -50_000,
            },
          ]),
          'DanhSachKhachHang',
        ),
      )
      expect(customerPlan.sourceFormat).toBe('kiotviet')
      expect(customerPlan.errors).toEqual([])
      expect(customerPlan.sample[0]).toMatchObject({
        'Điện thoại': '0987654321',
        'Địa chỉ': '12 Lê Lợi, Phường 1',
        'Mã số thuế': '0101234567',
      })
      expect(customerPlan.sample[1]).not.toHaveProperty('Điện thoại')
      expect(customerPlan.sample[1]).not.toHaveProperty('Email')
      expect(customerPlan.conversions.map((item) => item.code).sort()).toEqual([
        'address_merged',
        'columns_ignored',
        'debt_not_imported',
        'group_dropped',
        'phone_cleaned',
        'prepaid_not_imported',
        'value_dropped',
        'value_dropped',
      ])
      expect(
        customerPlan.conversions
          .filter((item) => item.code.endsWith('_not_imported'))
          .every((item) => !item.requiresConfirmation),
      ).toBe(true)

      const supplierPlan = await preview(
        'suppliers',
        workbook(
          KV_SUPPLIER_HEADERS,
          kvRows(KV_SUPPLIER_HEADERS, [
            {
              'Mã nhà cung cấp': 'NCC000101',
              'Tên nhà cung cấp': 'Công ty Bình An',
              'Điện thoại': '028 3822 1234',
              'Nợ cần trả hiện tại': 2_000_000,
            },
          ]),
          'DanhSachNhaCungCap',
        ),
      )
      expect(supplierPlan.errors).toEqual([])
      expect(supplierPlan.sample[0]).toMatchObject({ 'Điện thoại': '02838221234' })
      expect(supplierPlan.conversions.map((item) => item.code)).toContain('debt_not_imported')
    })

    it('GL-19 in the template too: blank unit on create and unit case variants need approval', async () => {
      const plan = await preview(
        'products',
        workbook(BULK_EXPORT_HEADERS.products, [
          ['TPL-1', 'Hàng mẫu một', null, null, null, 1000],
          ['TPL-2', 'Hàng mẫu hai', null, null, null, 1000, null, 'CÁI'],
          [
            'TPL-3',
            'Hàng mẫu ba',
            null,
            null,
            null,
            1000,
            null,
            'Cái',
            null,
            null,
            'https://cdn2-retail-images.kiotviet.vn/x.png',
          ],
        ]),
      )
      expect(plan.sourceFormat).toBe('template')
      expect(plan.errors).toEqual([])
      expect(codes(plan)).toMatchObject({
        'unit_blank:ĐVT trống được điền "Cái"': 1,
        'unit_case:ĐVT "CÁI" được gộp thành "Cái"': 1,
      })
      expect(plan.conversions.find((item) => item.code === 'image_dropped')?.rows).toEqual([4])
      expect(requiresConversionApproval(plan)).toBe(true)
    })
  })
})

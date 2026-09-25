import type { ZodTypeAny } from 'zod'

import {
  customerEmailSchema,
  customerPhoneSchema,
  customerTaxIdSchema,
  productBarcodeSchema,
  productSkuSchema,
  supplierEmailSchema,
  supplierPhoneSchema,
  supplierTaxIdSchema,
} from '@kiotviet-lite/shared'

import {
  BULK_EXPORT_CATEGORY_SEPARATOR,
  BULK_EXPORT_HEADERS,
  type BulkExportKind,
} from './bulk-export.service.js'

/** One automatic change the importer will apply; shown in preview before confirmation. */
export interface BulkImportConversion {
  code: string
  message: string
  count: number
  // First sheet rows affected, for the owner to spot-check; `count` is the full total.
  rows: number[]
  // Value-changing or lossy changes need an explicit owner approval before confirm.
  requiresConfirmation: boolean
}

const MAX_LISTED_ROWS = 20

export class ConversionReport {
  private readonly items = new Map<string, BulkImportConversion>()

  add(code: string, message: string, row: number | null, requiresConfirmation = true): void {
    const key = `${code}\u0000${message}`
    let item = this.items.get(key)
    if (!item) {
      item = { code, message, count: 0, rows: [], requiresConfirmation }
      this.items.set(key, item)
    }
    if (row === null) return
    item.count++
    if (item.rows.length < MAX_LISTED_ROWS) item.rows.push(row)
  }

  list(): BulkImportConversion[] {
    return [...this.items.values()]
  }
}

/** A data row aligned to BULK_EXPORT_HEADERS[kind], whatever the source file layout. */
export interface BulkImportSourceRow {
  row: number
  values: unknown[]
  // Product unit conversions merged from KiotViet conversion-unit rows.
  unitConversions?: { unit: string; conversionFactor: number; sellingPrice: number }[]
  errors?: { column: string; message: string }[]
}

// Columns that identify each KiotViet export; none of them exists in our own template.
const signatures: Record<BulkExportKind, string[]> = {
  products: ['Mã hàng', 'Tên hàng', 'ĐVT', 'Nhóm hàng(3 Cấp)'],
  customers: ['Mã khách hàng', 'Tên khách hàng', 'Nợ cần thu hiện tại'],
  suppliers: ['Mã nhà cung cấp', 'Tên nhà cung cấp', 'Nợ cần trả hiện tại'],
}

// Template column -> KiotViet column(s); several sources are joined (addresses).
const columnMap: Record<BulkExportKind, Record<string, string[]>> = {
  products: {
    'Mã hàng': ['Mã hàng'],
    'Tên hàng': ['Tên hàng'],
    'Mã vạch': ['Mã vạch'],
    'Danh mục': ['Nhóm hàng(3 Cấp)'],
    'Thương hiệu': ['Thương hiệu'],
    'Giá bán': ['Giá bán'],
    'Giá vốn': ['Giá vốn'],
    'Đơn vị': ['ĐVT'],
    'Trọng lượng': ['Trọng lượng'],
    'Mô tả': ['Mô tả'],
    'Trạng thái': ['Đang kinh doanh'],
    'Theo dõi tồn kho': ['Loại hàng'],
    'Định mức tối thiểu': ['Tồn nhỏ nhất'],
  },
  customers: {
    'Mã khách hàng': ['Mã khách hàng'],
    'Tên khách hàng': ['Tên khách hàng'],
    'Điện thoại': ['Điện thoại'],
    Email: ['Email'],
    'Địa chỉ': ['Địa chỉ', 'Phường/Xã', 'Khu vực giao hàng'],
    'Mã số thuế': ['MST (xuất HĐ)'],
    'Ghi chú': ['Ghi chú'],
    'Nhóm khách hàng': ['Nhóm khách hàng'],
  },
  suppliers: {
    'Mã nhà cung cấp': ['Mã nhà cung cấp'],
    'Tên nhà cung cấp': ['Tên nhà cung cấp'],
    'Điện thoại': ['Điện thoại'],
    Email: ['Email'],
    'Địa chỉ': ['Địa chỉ', 'Phường/Xã', 'Khu vực'],
    'Mã số thuế': ['Mã số thuế'],
    'Ghi chú': ['Ghi chú'],
  },
}

// Read but reported separately, so they are not listed again as ignored columns.
const handledColumns: Record<BulkExportKind, string[]> = {
  products: [
    'Tồn kho',
    'Hình ảnh (url1,url2...)',
    'Mã ĐVT Cơ bản',
    'Quy đổi',
    'Thuộc tính',
    'Hàng thành phần',
  ],
  customers: ['Nợ cần thu hiện tại'],
  suppliers: ['Nợ cần trả hiện tại'],
}

const KV_CATEGORY_SEPARATOR = '>>'
const roundedColumns = new Set(['Giá bán', 'Giá vốn', 'Trọng lượng', 'Định mức tối thiểu'])
const droppable: Record<BulkExportKind, Record<string, ZodTypeAny>> = {
  products: { 'Mã vạch': productBarcodeSchema },
  customers: {
    'Điện thoại': customerPhoneSchema,
    Email: customerEmailSchema,
    'Mã số thuế': customerTaxIdSchema,
  },
  suppliers: {
    'Điện thoại': supplierPhoneSchema,
    Email: supplierEmailSchema,
    'Mã số thuế': supplierTaxIdSchema,
  },
}

/**
 * Mã hàng KiotViet có ký tự mà mã của mình không nhận: bỏ các ký tự đó nếu phần còn lại hợp lệ,
 * không thì giữ nguyên để lỗi hiện ra. Nhập tồn đầu kỳ dùng lại để khớp đúng mã đã nhập.
 */
export function cleanKiotVietSku(value: string): string {
  const cleaned = value.replace(/[^\p{L}\p{M}0-9\p{Zs}_\-./+*,@=]/gu, '').trim()
  return cleaned !== value && productSkuSchema.safeParse(cleaned).success ? cleaned : value
}

export function isKiotVietExport(kind: BulkExportKind, header: string[]): boolean {
  return signatures[kind].every((name) => header.includes(name))
}

function blank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && !value.trim())
}

// KiotViet writes codes, phones and barcodes as text or as numbers depending on the cell.
function text(value: unknown): unknown {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value)
  return typeof value === 'string' ? value.trim() : value
}

/**
 * Map a KiotViet export (any sheet name, KiotViet column names) onto the template columns.
 * Every automatic change is recorded in `report`; nothing is changed silently.
 */
export function readKiotVietRows({
  kind,
  header,
  lastRow,
  readCell,
  report,
}: {
  kind: BulkExportKind
  header: string[]
  lastRow: number
  readCell: (row: number, column: number) => unknown
  report: ConversionReport
}): BulkImportSourceRow[] {
  const expected = BULK_EXPORT_HEADERS[kind]
  const sources = columnMap[kind]
  const at = (name: string) => header.indexOf(name)
  const mapped = new Set([...Object.values(sources).flat(), ...handledColumns[kind]])
  const ignored = new Set<string>()
  const rows: BulkImportSourceRow[] = []
  const conversionRows: {
    source: BulkImportSourceRow
    baseSku: string
    unit: unknown
    factor: unknown
    price: unknown
  }[] = []

  for (let index = 1; index <= lastRow; index++) {
    const row = index + 1
    const cell = (name: string) => (at(name) < 0 ? undefined : readCell(index, at(name)))
    let empty = true
    for (let column = 0; column < header.length; column++) {
      if (blank(readCell(index, column))) continue
      empty = false
      const name = header[column]!
      if (name && !mapped.has(name)) ignored.add(name)
    }
    if (empty) continue
    const values: unknown[] = expected.map(() => undefined)
    const source: BulkImportSourceRow = { row, values }
    // KiotViet exports each extra unit as its own row pointing at the base unit's code.
    // So và tra theo mã đã làm sạch, như mã hàng ĐVT cơ bản được lưu ở dưới
    const rawBaseSku = kind === 'products' ? text(cell('Mã ĐVT Cơ bản')) : undefined
    const baseSku = typeof rawBaseSku === 'string' ? cleanKiotVietSku(rawBaseSku) : rawBaseSku
    const ownSku = text(cell('Mã hàng'))
    if (
      typeof baseSku === 'string' &&
      baseSku &&
      baseSku !== (typeof ownSku === 'string' ? cleanKiotVietSku(ownSku) : ownSku)
    ) {
      values[0] = text(cell('Mã hàng'))
      values[1] = text(cell('Tên hàng'))
      let price = cell('Giá bán')
      if (typeof price === 'number' && !Number.isInteger(price)) {
        report.add(
          'number_rounded',
          'Giá bán có phần lẻ, được làm tròn tới số nguyên gần nhất',
          row,
        )
        price = Math.round(price)
      }
      conversionRows.push({
        source,
        baseSku,
        unit: text(cell('ĐVT')),
        factor: cell('Quy đổi'),
        price,
      })
      continue
    }
    for (const [target, names] of Object.entries(sources)) {
      const position = expected.indexOf(target as never)
      if (names.length > 1) {
        const parts = names.map((name) => text(cell(name))).filter((part) => !blank(part))
        if (parts.some((part) => typeof part !== 'string')) values[position] = parts[0]
        else if (parts.length) values[position] = parts.join(', ')
        if (parts.length > 1)
          report.add(
            'address_merged',
            `${target} được ghép từ các cột ${names.join(', ')}`,
            row,
            false,
          )
        continue
      }
      let value = cell(names[0]!)
      if (blank(value)) continue
      if (roundedColumns.has(target)) {
        if (typeof value === 'number' && !Number.isInteger(value)) {
          report.add(
            'number_rounded',
            `${names[0]} có phần lẻ, được làm tròn tới số nguyên gần nhất`,
            row,
          )
          value = Math.round(value)
        }
      } else if (target === 'Danh mục' && typeof value === 'string') {
        const parts = value
          .split(KV_CATEGORY_SEPARATOR)
          .map((part) => part.trim())
          .filter(Boolean)
        if (parts.length > 2)
          report.add('category_truncated', 'Nhóm hàng quá 2 cấp, chỉ giữ 2 cấp đầu', row)
        value = parts.slice(0, 2).join(BULK_EXPORT_CATEGORY_SEPARATOR)
      } else if (target === 'Trạng thái') {
        value =
          value === 1 || value === '1'
            ? 'active'
            : value === 0 || value === '0'
              ? 'inactive'
              : value
      } else if (target === 'Theo dõi tồn kho') {
        if (value === 'Dịch vụ') value = 'Không'
        else if (typeof value === 'string' && /combo/i.test(value)) {
          report.add(
            'combo_as_product',
            'Hàng combo được nhập thành hàng thường, không theo dõi tồn và không có thành phần',
            row,
          )
          value = 'Không'
        } else value = 'Có'
      } else value = text(value)
      if (target === 'Mã hàng' && typeof value === 'string') {
        const cleaned = cleanKiotVietSku(value)
        if (cleaned !== value) {
          report.add('sku_cleaned', 'Mã hàng có ký tự không hợp lệ, đã bỏ các ký tự đó', row)
          value = cleaned
        }
      }
      const schema = droppable[kind][target]
      if (schema && typeof value === 'string' && !schema.safeParse(value).success) {
        const parts = value.split(/[,;/]/)
        const cleaned = (parts[0] ?? '').replace(/[\s.\-()]/g, '')
        if (schema.safeParse(cleaned).success && target !== 'Email') {
          report.add(
            `${target === 'Mã vạch' ? 'barcode' : 'phone'}_cleaned`,
            parts.length > 1
              ? `${target} có nhiều giá trị, chỉ giữ giá trị đầu và bỏ khoảng trắng, dấu chấm, gạch`
              : `${target} bỏ khoảng trắng, dấu chấm, gạch để hợp lệ`,
            row,
          )
          value = cleaned
        } else {
          report.add('value_dropped', `${target} không hợp lệ, được để trống`, row)
          continue
        }
      }
      values[position] = value
    }

    if (kind === 'products') {
      if (!blank(cell('Hình ảnh (url1,url2...)')))
        report.add(
          'image_dropped',
          'Ảnh sản phẩm trỏ vào máy chủ ảnh KiotViet nên không được nhập; thêm lại ảnh sau khi nhập',
          row,
        )
      const stock = cell('Tồn kho')
      if (typeof stock === 'number' && stock !== 0)
        report.add(
          'stock_ignored',
          'Tồn kho không được nhập cùng danh mục hàng; dùng Kiểm kê > Nhập tồn đầu kỳ với cùng tệp này',
          row,
          false,
        )
      if (!blank(cell('Thuộc tính')))
        report.add(
          'attributes_flattened',
          'Hàng có thuộc tính được nhập thành sản phẩm riêng, không gộp thành biến thể',
          row,
        )
    } else {
      const debt = cell(kind === 'customers' ? 'Nợ cần thu hiện tại' : 'Nợ cần trả hiện tại')
      if (typeof debt === 'number' && debt !== 0)
        report.add(
          debt > 0 ? 'debt_not_imported' : 'prepaid_not_imported',
          debt > 0
            ? 'Công nợ hiện tại không được nhập cùng danh sách; nạp ở mục Nợ đầu kỳ của từng đối tác'
            : 'Số dư trả trước (nợ âm) không được nhập cùng danh sách; nạp ở mục Nợ đầu kỳ, chọn Khách trả trước',
          row,
          false,
        )
    }
    rows.push(source)
  }

  const bySku = new Map(rows.map((item) => [String(item.values[0] ?? '').toLowerCase(), item]))
  for (const { source, baseSku, unit, factor, price } of conversionRows) {
    const base = bySku.get(baseSku.toLowerCase())
    if (
      !base ||
      typeof unit !== 'string' ||
      typeof factor !== 'number' ||
      !Number.isInteger(factor) ||
      typeof price !== 'number'
    ) {
      rows.push({
        ...source,
        errors: [
          {
            column: 'Mã ĐVT Cơ bản',
            message: base
              ? 'ĐVT quy đổi cần có ĐVT, Quy đổi là số nguyên và Giá bán'
              : `Không tìm thấy hàng ĐVT cơ bản ${baseSku} trong tệp`,
          },
        ],
      })
      continue
    }
    base.unitConversions = [
      ...(base.unitConversions ?? []),
      { unit, conversionFactor: factor, sellingPrice: price },
    ]
    report.add(
      'unit_conversion_merged',
      'Dòng ĐVT quy đổi được gộp vào hàng ĐVT cơ bản; mã hàng và mã vạch riêng của ĐVT quy đổi không được giữ',
      source.row,
    )
  }
  rows.sort((a, b) => a.row - b.row)
  if (ignored.size)
    report.add(
      'columns_ignored',
      `Các cột không có trong hệ thống nên không được nhập: ${[...ignored].join(', ')}`,
      null,
      false,
    )
  return rows
}

import { and, eq, isNull } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import * as XLSX from 'xlsx'

import {
  brandNameSchema,
  brands,
  categories,
  categoryNameSchema,
  createCustomerSchema,
  createProductSchema,
  createSupplierSchema,
  customerGroups,
  customers,
  products,
  suppliers,
  updateCustomerSchema,
  updateProductSchema,
  updateSupplierSchema,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import type { AuthContext } from '../middleware/auth.middleware.js'
import {
  BULK_EXPORT_CATEGORY_SEPARATOR,
  BULK_EXPORT_CLEAR_TOKEN,
  BULK_EXPORT_FORMAT,
  BULK_EXPORT_HEADERS,
  type BulkExportKind,
} from './bulk-export.service.js'
import {
  type BulkImportConversion,
  type BulkImportSourceRow,
  ConversionReport,
  isKiotVietExport,
  readKiotVietRows,
} from './bulk-import-kiotviet.js'

export type { BulkImportConversion } from './bulk-import-kiotviet.js'

export type BulkImportKind = BulkExportKind
export type BulkImportMode = 'create-only' | 'upsert'
export type BulkImportSourceFormat = 'template' | 'kiotviet'
export const BULK_IMPORT_MAX_BYTES = 8 * 1024 * 1024
export const BULK_IMPORT_MAX_ROWS = 12_000

export interface BulkImportRowError {
  row: number
  column: string
  message: string
}

export interface BulkImportPreviewRow {
  row: number
  key: string
  action: 'create' | 'update' | 'no-op' | 'error'
  targetId?: string
  // Domain-service input, with blank update cells omitted and clear tokens converted to null.
  input: Record<string, unknown>
  categoryPath?: string | null
  brandName?: string | null
  groupId?: string | null
}

export interface BulkImportPreview {
  kind: BulkImportKind
  mode: BulkImportMode
  filename: string
  totalRows: number
  creates: number
  updates: number
  noOps: number
  errors: BulkImportRowError[]
  newCategories: string[]
  newBrands: string[]
  warnings: string[]
  sourceFormat: BulkImportSourceFormat
  // Automatic changes applied to file values; see requiresConversionApproval.
  conversions: BulkImportConversion[]
  sample: Record<string, unknown>[]
  digest: string
  // Internal validated plan: routes must omit rows from preview responses.
  rows: BulkImportPreviewRow[]
}

const fields = {
  products: [
    'sku',
    'name',
    'barcode',
    'categoryId',
    'brandId',
    'sellingPrice',
    'costPrice',
    'unit',
    'weight',
    'description',
    'imageUrl',
    'status',
    'trackInventory',
    'minStock',
  ],
  customers: [
    'code',
    'name',
    'phone',
    'email',
    'address',
    'taxId',
    'notes',
    'debtLimit',
    'groupId',
  ],
  suppliers: ['code', 'name', 'phone', 'email', 'address', 'taxId', 'notes'],
} as const
const keyField = { products: 'sku', customers: 'code', suppliers: 'code' } as const
const numericFields = new Set(['sellingPrice', 'costPrice', 'weight', 'minStock', 'debtLimit'])
const boolField = 'trackInventory'
const categoryColumn = 'Danh mục'
const brandColumn = 'Thương hiệu'
const groupColumn = 'Nhóm khách hàng'
const stockColumn = BULK_EXPORT_FORMAT.stockColumn
// Alive-row unique indexes besides the key column, with the comparison the write path uses.
const uniqueFields = {
  products: [{ field: 'barcode', lower: false, message: 'Barcode đã tồn tại trong cửa hàng' }],
  customers: [{ field: 'phone', lower: false, message: 'Số điện thoại đã được sử dụng' }],
  suppliers: [
    { field: 'name', lower: true, message: 'Tên nhà cung cấp đã được sử dụng' },
    { field: 'phone', lower: false, message: 'Số điện thoại đã được sử dụng' },
  ],
} as const

function normalized(value: string): string {
  return value.trim().toLowerCase()
}

// Check central-directory sizes before SheetJS inflates any entries. A small
// compressed upload can otherwise contain an arbitrarily large shared-strings XML.
function checkZipSize(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = -1
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      end = offset
      break
    }
  }
  if (end < 0) throw new ApiError('VALIDATION_ERROR', 'Tệp XLSX bị hỏng hoặc không đúng định dạng')
  const entries = view.getUint16(end + 10, true)
  const centralSize = view.getUint32(end + 12, true)
  let cursor = view.getUint32(end + 16, true)
  if (entries === 0xffff || cursor + centralSize > end) {
    throw new ApiError('VALIDATION_ERROR', 'Tệp XLSX không hợp lệ hoặc quá lớn')
  }
  let expanded = 0
  for (let index = 0; index < entries; index++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50) {
      throw new ApiError('VALIDATION_ERROR', 'Tệp XLSX bị hỏng hoặc không đúng định dạng')
    }
    expanded += view.getUint32(cursor + 24, true)
    if (expanded > 64 * 1024 * 1024) {
      throw new ApiError('VALIDATION_ERROR', 'Nội dung XLSX sau giải nén vượt giới hạn 64 MB')
    }
    cursor +=
      46 +
      view.getUint16(cursor + 28, true) +
      view.getUint16(cursor + 30, true) +
      view.getUint16(cursor + 32, true)
  }
  if (cursor !== view.getUint32(end + 16, true) + centralSize) {
    throw new ApiError('VALIDATION_ERROR', 'Tệp XLSX bị hỏng hoặc không đúng định dạng')
  }
}

function workbookData(bytes: Uint8Array, kind: BulkImportKind) {
  if (!bytes.length || bytes.length > BULK_IMPORT_MAX_BYTES) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `Tệp XLSX phải có dung lượng từ 1 byte đến ${BULK_IMPORT_MAX_BYTES / 1024 / 1024} MB`,
    )
  }
  // SheetJS otherwise accepts plain text/CSV as a workbook, even with an .xlsx name.
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    throw new ApiError('VALIDATION_ERROR', 'Tệp XLSX bị hỏng hoặc không đúng định dạng')
  }
  checkZipSize(bytes)
  let workbook: XLSX.WorkBook
  try {
    // Read only the first worksheet. Limit decoded rows as well as compressed upload bytes.
    workbook = XLSX.read(bytes, { type: 'array', sheets: 0, sheetRows: BULK_IMPORT_MAX_ROWS + 2 })
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'Tệp XLSX bị hỏng hoặc không đúng định dạng')
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]!]
  const header: string[] = []
  const range = sheet?.['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : undefined
  for (let col = 0; range && col <= range.e.c; col++) {
    const cell = sheet![XLSX.utils.encode_cell({ r: 0, c: col })] as XLSX.CellObject | undefined
    header.push(cell?.v === undefined ? '' : String(cell.v))
  }
  const expected = BULK_EXPORT_HEADERS[kind]
  // KiotViet exports keep their own sheet name and column names; map them instead of rejecting.
  const kiotViet = isKiotVietExport(kind, header)
  if (!kiotViet && workbook.SheetNames[0] !== BULK_EXPORT_FORMAT.dataSheet) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'Sheet đầu tiên phải là Dữ liệu (tệp mẫu) hoặc tệp xuất nguyên bản từ KiotViet',
    )
  }
  if (!sheet || !range)
    throw new ApiError('VALIDATION_ERROR', 'Sheet dữ liệu không có hàng tiêu đề')
  if (range.e.r > BULK_IMPORT_MAX_ROWS) {
    throw new ApiError('VALIDATION_ERROR', `Tệp vượt quá ${BULK_IMPORT_MAX_ROWS} dòng dữ liệu`)
  }
  const report = new ConversionReport()
  if (kiotViet) {
    const rows = readKiotVietRows({
      kind,
      header,
      lastRow: range.e.r,
      readCell: (row, column) => readCell(sheet, row, column),
      report,
    })
    return { rows, expected, report, sourceFormat: 'kiotviet' as const }
  }
  const missing = expected.filter((name) => !header.includes(name))
  if (missing.length)
    throw new ApiError('VALIDATION_ERROR', `Thiếu cột bắt buộc: ${missing.join(', ')}`)
  const duplicates = expected.filter((name) => header.filter((item) => item === name).length > 1)
  if (duplicates.length)
    throw new ApiError('VALIDATION_ERROR', `Cột bị trùng: ${duplicates.join(', ')}`)
  const columns = expected.map((name) => header.indexOf(name))
  const rows: BulkImportSourceRow[] = []
  for (let index = 1; index <= range.e.r; index++) {
    const values = columns.map((column) => readCell(sheet, index, column))
    if (values.every((value) => value === undefined || value === null || value === '')) continue
    rows.push({ row: index + 1, values })
  }
  return { rows, expected, report, sourceFormat: 'template' as const }
}

function readCell(sheet: XLSX.WorkSheet, row: number, column: number): unknown {
  const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })] as XLSX.CellObject | undefined
  if (!cell) return undefined
  // Never evaluate imported formulas or trust cached results as input.
  if (cell.f || cell.t === 'e' || cell.t === 'd') return { invalid: true }
  return cell.v
}

function fieldValue(
  value: unknown,
  field: string,
  column: string,
  row: number,
  errors: BulkImportRowError[],
): unknown {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'object') {
    errors.push({ row, column, message: 'Ô không được chứa công thức, lỗi hoặc ngày tháng' })
    return undefined
  }
  if (value === BULK_EXPORT_CLEAR_TOKEN) {
    if (
      !(BULK_EXPORT_FORMAT.nullableColumns.products as readonly string[]).includes(column) &&
      !(BULK_EXPORT_FORMAT.nullableColumns.customers as readonly string[]).includes(column) &&
      !(BULK_EXPORT_FORMAT.nullableColumns.suppliers as readonly string[]).includes(column)
    ) {
      errors.push({
        row,
        column,
        message: `${BULK_EXPORT_CLEAR_TOKEN} chỉ dùng cho cột có thể xóa`,
      })
      return undefined
    }
    return null
  }
  if (numericFields.has(field)) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
      errors.push({
        row,
        column,
        message: 'Phải là số nguyên XLSX, không có dấu phân cách hoặc công thức',
      })
      return undefined
    }
    return value
  }
  if (field === boolField) {
    if (value !== 'Có' && value !== 'Không') {
      errors.push({ row, column, message: 'Chỉ chấp nhận Có hoặc Không' })
      return undefined
    }
    return value === 'Có'
  }
  if (typeof value !== 'string') {
    errors.push({ row, column, message: 'Phải là chuỗi văn bản XLSX' })
    return undefined
  }
  return value.trim() || undefined
}

const KIOTVIET_IMAGE_HOST = /(^|\.)kiotviet\.(vn|com)$/i

function isKiotVietImage(value: string): boolean {
  try {
    return KIOTVIET_IMAGE_HOST.test(new URL(value).hostname)
  } catch {
    return false
  }
}

/**
 * Merge unit spellings that differ only by case (Cái/cái, Kg/kg) into the spelling the store
 * already uses most, else the most frequent one in the file. Returns the blank-unit default.
 */
function canonicalizeUnits(
  rows: BulkImportSourceRow[],
  existing: Record<string, unknown>[],
  report: ConversionReport,
): string {
  const column = fields.products.indexOf('unit')
  const tally = (counts: Map<string, Map<string, number>>, value: unknown) => {
    if (typeof value !== 'string' || !value.trim()) return
    const spelling = value.trim()
    const byKey = counts.get(spelling.toLowerCase()) ?? new Map<string, number>()
    byKey.set(spelling, (byKey.get(spelling) ?? 0) + 1)
    counts.set(spelling.toLowerCase(), byKey)
  }
  const stored = new Map<string, Map<string, number>>()
  const inFile = new Map<string, Map<string, number>>()
  for (const item of existing) tally(stored, item.unit)
  for (const item of rows) tally(inFile, item.values[column])
  const pick = (key: string) => {
    const counts = stored.get(key) ?? inFile.get(key)
    if (!counts) return undefined
    return [...counts.entries()].reduce((best, next) => (next[1] > best[1] ? next : best))[0]
  }
  for (const item of rows) {
    const value = item.values[column]
    if (typeof value !== 'string' || !value.trim()) continue
    const canonical = pick(value.trim().toLowerCase())!
    if (canonical !== value.trim()) {
      report.add('unit_case', `ĐVT "${value.trim()}" được gộp thành "${canonical}"`, item.row)
      item.values[column] = canonical
    }
  }
  return pick('cái') ?? 'Cái'
}

/** Owner must approve before confirm when any automatic change alters or drops file values. */
export function requiresConversionApproval(preview: Pick<BulkImportPreview, 'conversions'>) {
  return preview.conversions.some((item) => item.requiresConfirmation)
}

/** Read-only, deterministic plan used unchanged by a later confirmation executor. */
export async function previewBulkImport({
  db,
  actor,
  kind,
  mode,
  bytes,
  filename,
}: {
  db: Db
  actor: AuthContext
  kind: BulkImportKind
  mode: BulkImportMode
  bytes: Uint8Array
  filename: string
}): Promise<BulkImportPreview> {
  if (actor.role !== 'owner') throw new ApiError('FORBIDDEN', 'Chỉ chủ cửa hàng được nhập dữ liệu')
  if (!BULK_EXPORT_HEADERS[kind] || !['create-only', 'upsert'].includes(mode)) {
    throw new ApiError('VALIDATION_ERROR', 'Loại dữ liệu hoặc chế độ nhập không hợp lệ')
  }
  if (!filename.toLowerCase().endsWith('.xlsx'))
    throw new ApiError('VALIDATION_ERROR', 'Chỉ nhận tệp .xlsx')
  const { rows: sourceRows, expected, report, sourceFormat } = workbookData(bytes, kind)
  const table = kind === 'products' ? products : kind === 'customers' ? customers : suppliers
  const existing = await db
    .select()
    .from(table)
    .where(and(eq(table.storeId, actor.storeId), isNull(table.deletedAt)))
  const existingByKey = new Map(
    existing.map((item) => [
      normalized(
        kind === 'products'
          ? (item as typeof products.$inferSelect).sku
          : (item as typeof customers.$inferSelect).code,
      ),
      item,
    ]),
  )

  const categoryRows =
    kind === 'products'
      ? await db.select().from(categories).where(eq(categories.storeId, actor.storeId))
      : []
  const categoryById = new Map(categoryRows.map((item) => [item.id, item]))
  const categoryByPath = new Map<string, string>()
  for (const item of categoryRows) {
    const parent = item.parentId ? categoryById.get(item.parentId) : undefined
    const path = parent ? `${parent.name}${BULK_EXPORT_CATEGORY_SEPARATOR}${item.name}` : item.name
    categoryByPath.set(normalized(path), item.id)
  }
  const brandRows =
    kind === 'products'
      ? await db
          .select()
          .from(brands)
          .where(and(eq(brands.storeId, actor.storeId), isNull(brands.deletedAt)))
      : []
  const brandByName = new Map(brandRows.map((item) => [normalized(item.name), item.id]))
  const groupRows =
    kind === 'customers'
      ? await db.select().from(customerGroups).where(eq(customerGroups.storeId, actor.storeId))
      : []
  const groupByName = new Map(groupRows.map((item) => [normalized(item.name), item.id]))

  const errors: BulkImportRowError[] = []
  const rows: BulkImportPreviewRow[] = []
  const seenKeys = new Map<string, BulkImportPreviewRow>()
  const newCategories = new Map<string, string>()
  const newBrands = new Map<string, string>()
  const warnings =
    kind === 'products' && sourceFormat === 'template'
      ? [`Cột ${stockColumn} chỉ để tham khảo; tồn kho luôn bị bỏ qua khi nhập.`]
      : []
  const defaultUnit =
    kind === 'products'
      ? canonicalizeUnits(sourceRows, existing as Record<string, unknown>[], report)
      : ''
  for (const source of sourceRows) {
    const { row, values } = source
    const rowErrors: BulkImportRowError[] = (source.errors ?? []).map((error) => ({
      row,
      ...error,
    }))
    const input: Record<string, unknown> = {}
    let categoryPath: string | null | undefined
    let brandName: string | null | undefined
    let groupId: string | null | undefined
    for (let i = 0; i < expected.length; i++) {
      const column = expected[i]!
      if (column === stockColumn) continue
      const field = fields[kind][i]
      const value = fieldValue(values[i], field ?? '', column, row, rowErrors)
      if (value === undefined) continue
      if (column === categoryColumn) {
        if (value === null) {
          input.categoryId = null
          categoryPath = null
        } else {
          const parts = String(value)
            .split(BULK_EXPORT_CATEGORY_SEPARATOR)
            .map((part) => part.trim())
          if (
            parts.length > 2 ||
            parts.some((part) => !categoryNameSchema.safeParse(part).success)
          ) {
            rowErrors.push({
              row,
              column,
              message: 'Danh mục phải là Tên hoặc Cha > Con, tối đa hai cấp, tên hợp lệ',
            })
          } else {
            categoryPath = parts.join(BULK_EXPORT_CATEGORY_SEPARATOR)
            const id = categoryByPath.get(normalized(categoryPath))
            if (id) input.categoryId = id
          }
        }
      } else if (column === brandColumn) {
        if (value === null) {
          input.brandId = null
          brandName = null
        } else if (!brandNameSchema.safeParse(value).success)
          rowErrors.push({ row, column, message: 'Tên thương hiệu không hợp lệ' })
        else {
          brandName = String(value)
          const id = brandByName.get(normalized(brandName))
          if (id) input.brandId = id
        }
      } else if (column === groupColumn) {
        if (value === null) {
          input.groupId = null
          groupId = null
        } else {
          const id = groupByName.get(normalized(String(value)))
          if (id) {
            input.groupId = id
            groupId = id
          } else if (sourceFormat === 'kiotviet')
            report.add(
              'group_dropped',
              'Nhóm khách hàng chưa có trong cửa hàng nên được để trống; tạo nhóm rồi nhập lại nếu cần',
              row,
            )
          else
            rowErrors.push({ row, column, message: 'Nhóm khách hàng không tồn tại trong cửa hàng' })
        }
      } else if (field === 'imageUrl' && typeof value === 'string' && isKiotVietImage(value)) {
        report.add(
          'image_dropped',
          'Ảnh sản phẩm trỏ vào máy chủ ảnh KiotViet nên không được nhập; thêm lại ảnh sau khi nhập',
          row,
        )
      } else if (field) input[field] = value
    }
    const keyName = expected[0]!
    const key = String(input[keyField[kind]] ?? '')
    if (!key) rowErrors.push({ row, column: keyName, message: 'Mã định danh không được trống' })
    else {
      const previous = seenKeys.get(normalized(key))
      if (previous) {
        const message = `Mã ${key} bị trùng ở dòng ${previous.row} và ${row}`
        rowErrors.push({ row, column: keyName, message })
        errors.push({ row: previous.row, column: keyName, message })
        previous.action = 'error'
      }
    }
    const matched = existingByKey.get(normalized(key)) as Record<string, unknown> | undefined
    if (matched && mode === 'create-only')
      rowErrors.push({
        row,
        column: keyName,
        message: `Mã ${key} đã tồn tại; chế độ chỉ tạo mới không cập nhật`,
      })
    if (kind === 'products' && !(matched && mode === 'upsert')) {
      if (input.unit === undefined) {
        report.add('unit_blank', `ĐVT trống được điền "${defaultUnit}"`, row)
        input.unit = defaultUnit
      }
      if (source.unitConversions) input.unitConversions = source.unitConversions
    } else if (source.unitConversions)
      report.add(
        'unit_conversion_skipped',
        'Hàng đã có trong cửa hàng: ĐVT quy đổi trong tệp không được cập nhật, sửa ở trang sản phẩm',
        row,
      )
    const schema =
      matched && mode === 'upsert'
        ? kind === 'products'
          ? updateProductSchema
          : kind === 'customers'
            ? updateCustomerSchema
            : updateSupplierSchema
        : kind === 'products'
          ? createProductSchema
          : kind === 'customers'
            ? createCustomerSchema
            : createSupplierSchema
    // Update schemas forbid an empty patch; a completely unchanged row is a valid no-op.
    const candidate: Record<string, unknown> = {}
    for (const [field, value] of Object.entries(input)) {
      if (
        matched &&
        mode === 'upsert' &&
        field === keyField[kind] &&
        normalized(String(value)) === normalized(String(matched[field]))
      )
        continue
      if (!matched || mode !== 'upsert' || (matched[field] ?? null) !== (value ?? null))
        candidate[field] = value
    }
    if (!matched || mode !== 'upsert' || Object.keys(candidate).length) {
      const validated = schema.safeParse(candidate)
      if (validated.success) Object.assign(candidate, validated.data)
      else
        for (const issue of validated.error.issues) {
          const field = String(issue.path[0] ?? '')
          const column = expected[fields[kind].indexOf(field as never)] ?? keyName
          const message =
            issue.code === 'invalid_type'
              ? issue.received === 'undefined'
                ? `Thiếu giá trị cột ${column}`
                : `Giá trị cột ${column} không đúng định dạng`
              : issue.code === 'invalid_enum_value'
                ? `Giá trị cột ${column} không hợp lệ; trạng thái chỉ nhận active hoặc inactive`
                : /^[\x20-\x7e]*$/.test(issue.message)
                  ? `Giá trị cột ${column} không hợp lệ`
                  : issue.message
          rowErrors.push({ row, column, message })
        }
    }
    if (rowErrors.length) errors.push(...rowErrors)
    const action = rowErrors.length
      ? 'error'
      : !matched
        ? 'create'
        : Object.keys(candidate).length ||
            (categoryPath !== undefined &&
              categoryPath !== null &&
              !categoryByPath.has(normalized(categoryPath))) ||
            (brandName !== undefined &&
              brandName !== null &&
              !brandByName.has(normalized(brandName)))
          ? 'update'
          : 'no-op'
    rows.push({
      row,
      key,
      action,
      ...(matched ? { targetId: matched.id as string } : {}),
      input: action === 'update' || action === 'create' ? candidate : {},
      ...(categoryPath !== undefined ? { categoryPath } : {}),
      ...(brandName !== undefined ? { brandName } : {}),
      ...(groupId !== undefined ? { groupId } : {}),
    })
    if (key && !seenKeys.has(normalized(key))) seenKeys.set(normalized(key), rows[rows.length - 1]!)
  }
  // Replay the runner's sequential writes so preview rejects every unique conflict the write would.
  for (const unique of uniqueFields[kind]) {
    const column = expected[fields[kind].indexOf(unique.field as never)]!
    const keyOf = (value: unknown) =>
      typeof value === 'string' && value ? (unique.lower ? normalized(value) : value) : null
    const owners = new Map<string, { id: string; row?: number }>()
    const current = new Map<string, string | null>()
    for (const item of existing as Record<string, unknown>[]) {
      const value = keyOf(item[unique.field])
      current.set(item.id as string, value)
      if (value) owners.set(value, { id: item.id as string })
    }
    for (const item of rows) {
      if (item.action !== 'create' && item.action !== 'update') continue
      if (!(unique.field in item.input)) continue
      const self = item.targetId ?? `row:${item.row}`
      const value = keyOf(item.input[unique.field])
      const before = current.get(self) ?? null
      if (value === before) continue
      const owner = value ? owners.get(value) : undefined
      if (owner && owner.id !== self) {
        const shown = String(item.input[unique.field])
        errors.push({
          row: item.row,
          column,
          message: owner.row
            ? `${column} ${shown} bị trùng ở dòng ${owner.row} và ${item.row}`
            : unique.message,
        })
        item.action = 'error'
        item.input = {}
        continue
      }
      if (before && owners.get(before)?.id === self) owners.delete(before)
      if (value) owners.set(value, { id: self, row: item.row })
      current.set(self, value)
    }
  }
  let creates = 0
  let updates = 0
  let noOps = 0
  for (const item of rows) {
    if (item.action === 'error') continue
    if (item.action === 'create') creates++
    else if (item.action === 'update') updates++
    else noOps++
    if (item.categoryPath && !categoryByPath.has(normalized(item.categoryPath))) {
      const parts = item.categoryPath.split(BULK_EXPORT_CATEGORY_SEPARATOR)
      if (parts.length === 2 && !categoryByPath.has(normalized(parts[0]!))) {
        newCategories.set(normalized(parts[0]!), parts[0]!)
      }
      newCategories.set(normalized(item.categoryPath), item.categoryPath)
    }
    if (item.brandName && !brandByName.has(normalized(item.brandName))) {
      newBrands.set(normalized(item.brandName), item.brandName)
    }
  }
  const conversions = report.list()
  const plan = {
    kind,
    mode,
    sourceFormat,
    conversions,
    totalRows: rows.length,
    creates,
    updates,
    noOps,
    errors,
    newCategories: [...newCategories.values()],
    newBrands: [...newBrands.values()],
    rows,
  }
  const digest = createHash('sha256')
    .update(bytes)
    .update(JSON.stringify({ storeId: actor.storeId, ...plan }))
    .digest('hex')
  const sample = rows.slice(0, 10).map((item) => {
    const display: Record<string, unknown> = {
      Dòng: item.row,
      [expected[0]!]: item.key,
      'Thao tác': {
        create: 'Thêm mới',
        update: 'Cập nhật',
        'no-op': 'Không đổi',
        error: 'Lỗi',
      }[item.action],
    }
    for (const [field, value] of Object.entries(item.input)) {
      const index = fields[kind].indexOf(field as never)
      if (index < 0 || field === 'categoryId' || field === 'brandId') continue
      display[expected[index]!] =
        value === null
          ? '__XOA__ (xóa)'
          : field === 'groupId' && typeof value === 'string'
            ? (groupRows.find((group) => group.id === value)?.name ?? value)
            : value
    }
    if (kind === 'products') {
      if (item.categoryPath !== undefined)
        display[categoryColumn] = item.categoryPath === null ? '__XOA__ (xóa)' : item.categoryPath
      if (item.brandName !== undefined)
        display[brandColumn] = item.brandName === null ? '__XOA__ (xóa)' : item.brandName
    }
    return display
  })
  return { ...plan, filename, warnings, sample, digest }
}

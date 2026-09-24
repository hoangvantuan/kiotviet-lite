import { and, asc, eq, gt, ilike, isNull, or, type SQL, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import ExcelJS from 'exceljs'
import { PassThrough, Readable } from 'node:stream'

import {
  brands,
  categories,
  customerGroups,
  customers,
  type ListCustomersQuery,
  type ListProductsQuery,
  type ListSuppliersQuery,
  products,
  productVariants,
  suppliers,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { escapeLikePattern } from '../lib/strings.js'

export type BulkExportKind = 'products' | 'customers' | 'suppliers'
export type BulkExportFilters = {
  products: Omit<ListProductsQuery, 'page' | 'pageSize'>
  customers: Omit<ListCustomersQuery, 'page' | 'pageSize'>
  suppliers: Omit<ListSuppliersQuery, 'page' | 'pageSize'>
}

// Importers must read the first worksheet by these exact headers. Blank cells on
// updates preserve existing values; __XOA__ explicitly clears nullable fields.
// Product stock is informational only: imports must never change inventory.
export const BULK_EXPORT_HEADERS = {
  products: [
    'Mã hàng',
    'Tên hàng',
    'Mã vạch',
    'Danh mục',
    'Thương hiệu',
    'Giá bán',
    'Giá vốn',
    'Đơn vị',
    'Trọng lượng',
    'Mô tả',
    'URL ảnh',
    'Trạng thái',
    'Theo dõi tồn kho',
    'Định mức tối thiểu',
    'Tồn kho (chỉ xem)',
  ],
  customers: [
    'Mã khách hàng',
    'Tên khách hàng',
    'Điện thoại',
    'Email',
    'Địa chỉ',
    'Mã số thuế',
    'Ghi chú',
    'Hạn mức nợ',
    'Nhóm khách hàng',
  ],
  suppliers: [
    'Mã nhà cung cấp',
    'Tên nhà cung cấp',
    'Điện thoại',
    'Email',
    'Địa chỉ',
    'Mã số thuế',
    'Ghi chú',
  ],
} as const

export const BULK_EXPORT_CLEAR_TOKEN = '__XOA__'
export const BULK_EXPORT_CATEGORY_SEPARATOR = ' > '
export const BULK_EXPORT_FORMAT = {
  dataSheet: 'Dữ liệu',
  examplesSheet: 'Hướng dẫn',
  // All numeric cells are integer XLSX numbers (no grouping characters); no date columns.
  integerColumns: {
    products: ['Giá bán', 'Giá vốn', 'Trọng lượng', 'Định mức tối thiểu', 'Tồn kho (chỉ xem)'],
    customers: ['Hạn mức nợ'],
    suppliers: [],
  },
  dateColumns: [],
  nullableColumns: {
    products: ['Mã vạch', 'Danh mục', 'Thương hiệu', 'Giá vốn', 'Trọng lượng', 'Mô tả', 'URL ảnh'],
    customers: [
      'Điện thoại',
      'Email',
      'Địa chỉ',
      'Mã số thuế',
      'Ghi chú',
      'Hạn mức nợ',
      'Nhóm khách hàng',
    ],
    suppliers: ['Điện thoại', 'Email', 'Địa chỉ', 'Mã số thuế', 'Ghi chú'],
  },
  statusValues: ['active', 'inactive'],
  inventoryTrackingValues: ['Có', 'Không'],
  stockColumn: 'Tồn kho (chỉ xem)',
} as const
const BATCH_SIZE = 250
const parentCategories = alias(categories, 'parent_categories')

type Cell = string | number | null

type ExportRequest =
  | { kind: 'products'; filters: BulkExportFilters['products'] }
  | { kind: 'customers'; filters: BulkExportFilters['customers'] }
  | { kind: 'suppliers'; filters: BulkExportFilters['suppliers'] }

function searchPattern(search?: string): string | undefined {
  const value = search?.trim()
  return value ? `%${escapeLikePattern(value)}%` : undefined
}

function productConditions(storeId: string, filters: BulkExportFilters['products']): SQL[] {
  const conditions: SQL[] = [eq(products.storeId, storeId), isNull(products.deletedAt)]
  if (filters.search) {
    // Keep product search identical to the list endpoint, including exact barcode match.
    const like = `%${filters.search.toLowerCase().replace(/[%_\\]/g, '\\$&')}%`
    conditions.push(
      or(
        sql`LOWER(${products.name}) LIKE ${like}`,
        sql`LOWER(${products.sku}) LIKE ${like}`,
        eq(products.barcode, filters.search),
      )!,
    )
  }
  if (filters.categoryId)
    conditions.push(
      filters.categoryId === 'none'
        ? isNull(products.categoryId)
        : eq(products.categoryId, filters.categoryId),
    )
  if (filters.brandId)
    conditions.push(
      filters.brandId === 'none' ? isNull(products.brandId) : eq(products.brandId, filters.brandId),
    )
  if (filters.status !== 'all') conditions.push(eq(products.status, filters.status))
  if (filters.stockFilter) {
    conditions.push(eq(products.trackInventory, true))
    if (filters.stockFilter === 'in_stock') conditions.push(sql`${effectiveStock} > 0`)
    if (filters.stockFilter === 'out_of_stock') conditions.push(sql`${effectiveStock} = 0`)
    if (filters.stockFilter === 'below_min') {
      conditions.push(sql`${effectiveStock} <= ${products.minStock}`)
      conditions.push(sql`${products.minStock} > 0`)
    }
  }
  return conditions
}

const effectiveStock = sql<number>`(CASE WHEN ${products.hasVariants} THEN COALESCE(
  (SELECT SUM(${productVariants.stockQuantity}) FROM ${productVariants}
   WHERE ${productVariants.productId} = ${products.id} AND ${productVariants.deletedAt} IS NULL), 0)
  ELSE ${products.currentStock} END)::int`

async function* productRows(
  db: Db,
  storeId: string,
  filters: BulkExportFilters['products'],
): AsyncGenerator<Cell[]> {
  const conditions = productConditions(storeId, filters)
  let lastId: string | undefined
  for (;;) {
    const rows = await db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        barcode: products.barcode,
        categoryName: categories.name,
        parentName: parentCategories.name,
        brandName: brands.name,
        sellingPrice: products.sellingPrice,
        costPrice: products.costPrice,
        unit: products.unit,
        weight: products.weight,
        description: products.description,
        imageUrl: products.imageUrl,
        status: products.status,
        trackInventory: products.trackInventory,
        minStock: products.minStock,
        stock: effectiveStock,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(parentCategories, eq(categories.parentId, parentCategories.id))
      .leftJoin(brands, eq(products.brandId, brands.id))
      .where(and(...conditions, lastId ? gt(products.id, lastId) : undefined))
      .orderBy(asc(products.id))
      .limit(BATCH_SIZE)
    for (const row of rows) {
      yield [
        row.sku,
        row.name,
        row.barcode,
        row.parentName
          ? `${row.parentName}${BULK_EXPORT_CATEGORY_SEPARATOR}${row.categoryName}`
          : row.categoryName,
        row.brandName,
        Number(row.sellingPrice),
        row.costPrice === null ? null : Number(row.costPrice),
        row.unit,
        row.weight,
        row.description,
        row.imageUrl,
        row.status,
        row.trackInventory
          ? BULK_EXPORT_FORMAT.inventoryTrackingValues[0]
          : BULK_EXPORT_FORMAT.inventoryTrackingValues[1],
        row.minStock,
        Number(row.stock),
      ]
    }
    if (rows.length < BATCH_SIZE) break
    lastId = rows[rows.length - 1]!.id
  }
}

async function* customerRows(
  db: Db,
  storeId: string,
  filters: BulkExportFilters['customers'],
): AsyncGenerator<Cell[]> {
  const conditions: SQL[] = [eq(customers.storeId, storeId), isNull(customers.deletedAt)]
  const pattern = searchPattern(filters.search)
  if (pattern)
    conditions.push(
      or(
        sql`LOWER(${customers.name}) LIKE LOWER(${pattern})`,
        ilike(customers.code, pattern),
        ilike(customers.phone, pattern),
      )!,
    )
  if (filters.groupId)
    conditions.push(
      filters.groupId === 'none'
        ? isNull(customers.groupId)
        : eq(customers.groupId, filters.groupId),
    )
  if (filters.hasDebt === 'yes') conditions.push(sql`${customers.currentDebt} > 0`)
  if (filters.hasDebt === 'no') conditions.push(sql`${customers.currentDebt} = 0`)
  let lastId: string | undefined
  for (;;) {
    const rows = await db
      .select({
        id: customers.id,
        code: customers.code,
        name: customers.name,
        phone: customers.phone,
        email: customers.email,
        address: customers.address,
        taxId: customers.taxId,
        notes: customers.notes,
        debtLimit: customers.debtLimit,
        groupName: customerGroups.name,
      })
      .from(customers)
      .leftJoin(customerGroups, eq(customers.groupId, customerGroups.id))
      .where(and(...conditions, lastId ? gt(customers.id, lastId) : undefined))
      .orderBy(asc(customers.id))
      .limit(BATCH_SIZE)
    for (const row of rows)
      yield [
        row.code,
        row.name,
        row.phone,
        row.email,
        row.address,
        row.taxId,
        row.notes,
        row.debtLimit === null ? null : Number(row.debtLimit),
        row.groupName,
      ]
    if (rows.length < BATCH_SIZE) break
    lastId = rows[rows.length - 1]!.id
  }
}

async function* supplierRows(
  db: Db,
  storeId: string,
  filters: BulkExportFilters['suppliers'],
): AsyncGenerator<Cell[]> {
  const conditions: SQL[] = [eq(suppliers.storeId, storeId), isNull(suppliers.deletedAt)]
  const pattern = searchPattern(filters.search)
  if (pattern)
    conditions.push(
      or(
        sql`LOWER(${suppliers.name}) LIKE LOWER(${pattern})`,
        ilike(suppliers.code, pattern),
        ilike(suppliers.phone, pattern),
      )!,
    )
  if (filters.hasDebt === 'yes') conditions.push(sql`${suppliers.currentDebt} > 0`)
  if (filters.hasDebt === 'no') conditions.push(sql`${suppliers.currentDebt} = 0`)
  let lastId: string | undefined
  for (;;) {
    const rows = await db
      .select({
        id: suppliers.id,
        code: suppliers.code,
        name: suppliers.name,
        phone: suppliers.phone,
        email: suppliers.email,
        address: suppliers.address,
        taxId: suppliers.taxId,
        notes: suppliers.notes,
      })
      .from(suppliers)
      .where(and(...conditions, lastId ? gt(suppliers.id, lastId) : undefined))
      .orderBy(asc(suppliers.id))
      .limit(BATCH_SIZE)
    for (const row of rows)
      yield [row.code, row.name, row.phone, row.email, row.address, row.taxId, row.notes]
    if (rows.length < BATCH_SIZE) break
    lastId = rows[rows.length - 1]!.id
  }
}

const examples: Record<BulkExportKind, Cell[][]> = {
  products: [
    [
      'SP-001',
      'Ống nhựa Bình Minh',
      '8931234567890',
      `Ống nhựa${BULK_EXPORT_CATEGORY_SEPARATOR}PVC`,
      'Bình Minh',
      120000,
      90000,
      'Cái',
      1000,
      'Ống dài 4m',
      null,
      BULK_EXPORT_FORMAT.statusValues[0],
      BULK_EXPORT_FORMAT.inventoryTrackingValues[0],
      5,
      0,
    ],
    [
      'SP-002',
      'Keo dán ống',
      null,
      'Phụ kiện',
      null,
      25000,
      null,
      'Hộp',
      null,
      null,
      null,
      BULK_EXPORT_FORMAT.statusValues[0],
      BULK_EXPORT_FORMAT.inventoryTrackingValues[1],
      0,
      0,
    ],
  ],
  customers: [
    [
      'KH-001',
      'Nguyễn Văn An',
      '0901234567',
      'an@example.com',
      'Hà Nội',
      null,
      null,
      500000,
      'Khách sỉ',
    ],
    ['KH-002', 'Trần Thị Bình', null, null, null, null, null, null, null],
  ],
  suppliers: [
    [
      'NCC-001',
      'Công ty Bình Minh',
      '02812345678',
      'contact@example.com',
      'TP Hồ Chí Minh',
      null,
      null,
    ],
    ['NCC-002', 'Cửa hàng Minh Anh', null, null, null, null, null],
  ],
}

/** Stream compressed XLSX bytes as they are produced; at most BATCH_SIZE DB rows are held. */
export function createBulkWorkbook(
  db: Db,
  storeId: string,
  request: { kind: BulkExportKind; template: true } | (ExportRequest & { template?: false }),
): ReadableStream<Uint8Array> {
  const output = new PassThrough({ highWaterMark: 64 * 1024 })
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: output,
    useSharedStrings: false,
    useStyles: false,
  })
  const sheet = workbook.addWorksheet(BULK_EXPORT_FORMAT.dataSheet)
  sheet.addRow([...BULK_EXPORT_HEADERS[request.kind]]).commit()
  void (async () => {
    try {
      if (request.template) {
        // Data worksheet stays empty: importing the downloaded template cannot create examples.
        sheet.commit()
        const guide = workbook.addWorksheet(BULK_EXPORT_FORMAT.examplesSheet)
        guide.addRow(['Ví dụ — chỉ tham khảo, không nhập sheet này']).commit()
        guide.addRow([...BULK_EXPORT_HEADERS[request.kind]]).commit()
        for (const example of examples[request.kind]) guide.addRow(example).commit()
        guide.addRow([]).commit()
        guide.addRow(['Dòng 1 của sheet Dữ liệu là tiêu đề; nhập dữ liệu từ dòng 2.']).commit()
        guide
          .addRow([
            `Ô trống khi cập nhật: giữ nguyên. ${BULK_EXPORT_CLEAR_TOKEN}: xóa giá trị tùy chọn.`,
          ])
          .commit()
        guide
          .addRow([`Danh mục sản phẩm hai cấp: Cha${BULK_EXPORT_CATEGORY_SEPARATOR}Con.`])
          .commit()
        guide
          .addRow(['Số tiền, trọng lượng và tồn kho: số nguyên, không dấu phân cách hàng nghìn.'])
          .commit()
        guide
          .addRow([
            `Trạng thái: ${BULK_EXPORT_FORMAT.statusValues.join('/')}. Theo dõi tồn kho: ${BULK_EXPORT_FORMAT.inventoryTrackingValues.join('/')}.`,
          ])
          .commit()
        guide
          .addRow([
            `Cột ${BULK_EXPORT_FORMAT.stockColumn} chỉ để tham khảo và luôn bị bỏ qua khi nhập.`,
          ])
          .commit()
        guide.addRow(['Không có cột ngày trong khuôn tệp này.']).commit()
        guide.commit()
      } else {
        const rows =
          request.kind === 'products'
            ? productRows(db, storeId, request.filters)
            : request.kind === 'customers'
              ? customerRows(db, storeId, request.filters)
              : supplierRows(db, storeId, request.filters)
        for await (const row of rows) sheet.addRow(row).commit()
        sheet.commit()
      }
      await workbook.commit()
    } catch (error) {
      output.destroy(error instanceof Error ? error : new Error(String(error)))
    }
  })()
  return Readable.toWeb(output) as ReadableStream<Uint8Array>
}

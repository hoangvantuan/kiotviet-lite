import { and, eq, isNull } from 'drizzle-orm'
import { createHash } from 'node:crypto'

import {
  hasValidQuantityScale,
  isWholeQuantity,
  products,
  productVariants,
  roundQty,
  subQty,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import type { RequestMeta } from './audit.service.js'
import {
  type BulkImportConversion,
  cleanKiotVietSku,
  ConversionReport,
} from './bulk-import-kiotviet.js'
import {
  type BulkImportRowError,
  openImportWorkbook,
  readCell,
} from './bulk-import-preview.service.js'
import {
  insertStockCheckDraft,
  type ResolvedItem,
  type StockCheckActor,
} from './stock-checks.service.js'

/**
 * Nhập tồn đầu kỳ từ tệp (GL-02, ADR-0006): tồn chỉ đổi qua phiếu kiểm kho, nên tệp được đổi thành
 * các phiếu kiểm nháp (mỗi phiếu tối đa 1000 dòng, cùng một transaction). Người dùng xem lại rồi
 * xác nhận từng phiếu như phiếu kiểm tay, nên mỗi con số tồn vẫn truy ra được một chứng từ.
 */

export const STOCK_IMPORT_ITEMS_PER_CHECK = 1000
const MAX_QTY = 1_000_000_000

const SKU_COLUMNS = ['Mã hàng', 'SKU', 'Mã SKU']
// Tệp mẫu, tệp xuất KiotViet và tệp xuất danh mục của mình
const QTY_COLUMNS = ['Số lượng thực tế', 'Tồn kho', 'Tồn kho (chỉ xem)', 'Số lượng']
const KIOTVIET_BASE_UNIT_COLUMN = 'Mã ĐVT Cơ bản'

export interface StockImportLine extends ResolvedItem {
  row: number
}

export interface StockImportPreview {
  filename: string
  totalRows: number
  items: StockImportLine[]
  checks: number
  errors: BulkImportRowError[]
  conversions: BulkImportConversion[]
  digest: string
}

interface Target {
  productId: string
  variantId: string | null
  name: string
  sku: string
  variantLabel: string | null
  hasVariants: boolean
  trackInventory: boolean
  allowDecimalQuantity: boolean
  systemQty: number
  costPrice: number | null
}

async function loadTargets(db: Db, storeId: string): Promise<Map<string, Target>> {
  const productRows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      hasVariants: products.hasVariants,
      trackInventory: products.trackInventory,
      allowDecimalQuantity: products.allowDecimalQuantity,
      currentStock: products.currentStock,
      costPrice: products.costPrice,
    })
    .from(products)
    .where(and(eq(products.storeId, storeId), isNull(products.deletedAt)))
  const variantRows = await db
    .select({
      id: productVariants.id,
      productId: productVariants.productId,
      sku: productVariants.sku,
      attribute1Value: productVariants.attribute1Value,
      attribute2Value: productVariants.attribute2Value,
      stockQuantity: productVariants.stockQuantity,
      costPrice: productVariants.costPrice,
    })
    .from(productVariants)
    .where(and(eq(productVariants.storeId, storeId), isNull(productVariants.deletedAt)))

  const byId = new Map(productRows.map((row) => [row.id, row]))
  const targets = new Map<string, Target>()
  for (const row of productRows) {
    targets.set(row.sku.toLowerCase(), {
      productId: row.id,
      variantId: null,
      name: row.name,
      sku: row.sku,
      variantLabel: null,
      hasVariants: row.hasVariants,
      trackInventory: row.trackInventory,
      allowDecimalQuantity: row.allowDecimalQuantity,
      systemQty: row.currentStock,
      costPrice: row.costPrice,
    })
  }
  for (const row of variantRows) {
    const parent = byId.get(row.productId)
    if (!parent) continue
    targets.set(row.sku.toLowerCase(), {
      productId: parent.id,
      variantId: row.id,
      name: parent.name,
      sku: parent.sku,
      variantLabel: row.attribute2Value
        ? `${row.attribute1Value} - ${row.attribute2Value}`
        : row.attribute1Value,
      hasVariants: false,
      trackInventory: parent.trackInventory,
      allowDecimalQuantity: parent.allowDecimalQuantity,
      systemQty: row.stockQuantity,
      costPrice: row.costPrice ?? parent.costPrice,
    })
  }
  return targets
}

function cellText(value: unknown): string {
  if (value === undefined || value === null) return ''
  return String(value).trim()
}

export async function previewStockCheckImport({
  db,
  actor,
  bytes,
  filename,
}: {
  db: Db
  actor: StockCheckActor
  bytes: Uint8Array
  filename: string
}): Promise<StockImportPreview> {
  const { sheet, range, header } = openImportWorkbook(bytes)
  if (!sheet || !range)
    throw new ApiError('VALIDATION_ERROR', 'Sheet dữ liệu không có hàng tiêu đề')
  const skuColumn = header.findIndex((name) => SKU_COLUMNS.includes(name))
  const qtyName = QTY_COLUMNS.find((name) => header.includes(name))
  if (skuColumn < 0 || !qtyName) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'Tệp cần cột "Mã hàng" và cột "Số lượng thực tế" (hoặc cột "Tồn kho" của tệp xuất KiotViet)',
    )
  }
  const qtyColumn = header.indexOf(qtyName)
  const baseUnitColumn = header.indexOf(KIOTVIET_BASE_UNIT_COLUMN)

  const targets = await loadTargets(db, actor.storeId)
  const report = new ConversionReport()
  const errors: BulkImportRowError[] = []
  const items: StockImportLine[] = []
  const owners = new Map<string, number>()
  let totalRows = 0

  for (let index = 1; index <= range.e.r; index++) {
    const row = index + 1
    const rawSku = readCell(sheet, index, skuColumn)
    const rawQty = readCell(sheet, index, qtyColumn)
    if (cellText(rawSku) === '' && cellText(rawQty) === '') continue
    totalRows++
    if (typeof rawSku === 'object' || typeof rawQty === 'object') {
      errors.push({
        row,
        column: qtyName,
        message: 'Ô không được chứa công thức, lỗi hoặc ngày tháng',
      })
      continue
    }
    const sku = cellText(rawSku)
    if (!sku) {
      errors.push({ row, column: header[skuColumn]!, message: 'Thiếu mã hàng' })
      continue
    }
    // Dòng đơn vị quy đổi của KiotViet ghi tồn theo đơn vị lớn; tồn lấy ở dòng đơn vị cơ bản.
    if (baseUnitColumn >= 0) {
      const base = cellText(readCell(sheet, index, baseUnitColumn))
      if (base && base !== sku) {
        report.add(
          'unit_row_skipped',
          'Dòng đơn vị quy đổi được bỏ qua, tồn lấy theo dòng đơn vị cơ bản',
          row,
          false,
        )
        continue
      }
    }
    if (cellText(rawQty) === '') {
      report.add('qty_blank', 'Số lượng trống, dòng không được đưa vào phiếu kiểm', row, false)
      continue
    }
    let qty = typeof rawQty === 'number' ? rawQty : Number(cellText(rawQty).replace(/\s/g, ''))
    if (!Number.isFinite(qty)) {
      errors.push({ row, column: qtyName, message: 'Số lượng phải là số' })
      continue
    }
    const target =
      targets.get(sku.toLowerCase()) ?? targets.get(cleanKiotVietSku(sku).toLowerCase())
    if (!target) {
      errors.push({
        row,
        column: header[skuColumn]!,
        message: `Không tìm thấy mã hàng ${sku} trong cửa hàng`,
      })
      continue
    }
    if (target.hasVariants) {
      errors.push({
        row,
        column: header[skuColumn]!,
        message: `Mã hàng ${sku} có biến thể, vui lòng nhập tồn theo mã từng biến thể`,
      })
      continue
    }
    if (!target.trackInventory) {
      report.add(
        'not_tracked',
        'Hàng không theo dõi tồn kho (dịch vụ, combo), dòng không được đưa vào phiếu kiểm',
        row,
        false,
      )
      continue
    }
    const key = `${target.productId}::${target.variantId ?? ''}`
    const first = owners.get(key)
    if (first !== undefined) {
      errors.push({
        row,
        column: header[skuColumn]!,
        message: `Mã hàng ${sku} bị trùng ở dòng ${first} và ${row}`,
      })
      continue
    }
    owners.set(key, row)
    if (qty < 0) {
      report.add('qty_negative', 'Tồn âm được đưa về 0 (phiếu kiểm chỉ nhận số không âm)', row)
      qty = 0
    }
    // GL-07: tồn lẻ nhận ở mặt hàng bật số lẻ (tối đa 3 chữ số lẻ), mặt hàng khác báo lỗi dòng
    if (!hasValidQuantityScale(qty)) {
      report.add('qty_rounded', 'Tồn có hơn 3 chữ số lẻ được làm tròn về 3 chữ số lẻ', row)
    }
    qty = roundQty(qty)
    if (!isWholeQuantity(qty) && !target.allowDecimalQuantity) {
      errors.push({
        row,
        column: qtyName,
        message: `Mã hàng ${sku} chỉ nhận số lượng nguyên (mặt hàng chưa bật bán số lẻ)`,
      })
      continue
    }
    if (qty > MAX_QTY) {
      errors.push({ row, column: qtyName, message: 'Số lượng vượt giới hạn' })
      continue
    }
    if (qty === target.systemQty) {
      report.add(
        'qty_unchanged',
        'Số lượng khớp tồn hiện tại, không cần đưa vào phiếu kiểm',
        row,
        false,
      )
      continue
    }
    if (qty > 0 && !target.costPrice) {
      report.add(
        'cost_missing',
        'Hàng có tồn nhưng chưa có giá vốn, giá trị tồn đầu kỳ sẽ bằng 0; nhập giá vốn qua Nhập Excel sản phẩm trước khi xác nhận',
        row,
        false,
      )
    }
    items.push({
      row,
      productId: target.productId,
      variantId: target.variantId,
      productNameSnapshot: target.name,
      productSkuSnapshot: target.sku,
      variantLabelSnapshot: target.variantLabel,
      systemQty: target.systemQty,
      actualQty: qty,
      diff: subQty(qty, target.systemQty),
      note: null,
    })
  }

  const conversions = report.list()
  const checks = Math.ceil(items.length / STOCK_IMPORT_ITEMS_PER_CHECK)
  const digest = createHash('sha256')
    .update(bytes)
    .update(
      JSON.stringify({
        storeId: actor.storeId,
        items: items.map((item) => [
          item.row,
          item.productId,
          item.variantId,
          item.systemQty,
          item.actualQty,
        ]),
        errors,
        conversions,
      }),
    )
    .digest('hex')
  return { filename, totalRows, items, checks, errors, conversions, digest }
}

export function stockImportRequiresApproval(preview: Pick<StockImportPreview, 'conversions'>) {
  return preview.conversions.some((conversion) => conversion.requiresConfirmation)
}

export async function confirmStockCheckImport({
  db,
  actor,
  bytes,
  filename,
  digest,
  approveConversions,
  meta,
}: {
  db: Db
  actor: StockCheckActor
  bytes: Uint8Array
  filename: string
  digest: string
  approveConversions: boolean
  meta?: RequestMeta
}): Promise<{ ids: string[]; items: number }> {
  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Db
    const preview = await previewStockCheckImport({ db: txDb, actor, bytes, filename })
    if (preview.digest !== digest) {
      throw new ApiError(
        'CONFLICT',
        'Tệp hoặc tồn kho đã thay đổi từ lúc xem trước, vui lòng xem trước lại',
      )
    }
    if (preview.errors.length > 0) {
      throw new ApiError('BUSINESS_RULE_VIOLATION', 'Tệp còn dòng lỗi, vui lòng sửa rồi tải lại')
    }
    if (preview.items.length === 0) {
      throw new ApiError('BUSINESS_RULE_VIOLATION', 'Không có dòng nào cần đưa vào phiếu kiểm')
    }
    if (stockImportRequiresApproval(preview) && !approveConversions) {
      throw new ApiError(
        'BUSINESS_RULE_VIOLATION',
        'Cần chấp thuận các thay đổi tự động trong báo cáo',
      )
    }
    const ids: string[] = []
    for (let part = 0; part < preview.checks; part++) {
      const chunk = preview.items.slice(
        part * STOCK_IMPORT_ITEMS_PER_CHECK,
        (part + 1) * STOCK_IMPORT_ITEMS_PER_CHECK,
      )
      const note =
        preview.checks > 1
          ? `Nhập tồn đầu kỳ từ tệp ${filename} (phần ${part + 1}/${preview.checks})`
          : `Nhập tồn đầu kỳ từ tệp ${filename}`
      ids.push(
        await insertStockCheckDraft({
          tx: txDb,
          actor,
          items: chunk,
          note: note.slice(0, 500),
          meta,
        }),
      )
    }
    return { ids, items: preview.items.length }
  })
}

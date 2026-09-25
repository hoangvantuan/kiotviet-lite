import { eq } from 'drizzle-orm'
import type { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import {
  inventoryTransactions,
  products,
  productVariants,
  stockCheckItems,
  stockChecks,
} from '@kiotviet-lite/shared'

import { createStockChecksRoutes } from '../routes/stock-checks.routes.js'
import { confirmStockCheck } from '../services/stock-checks.service.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

// Cột tối thiểu của tệp xuất KiotViet mà luồng nhập tồn đọc (GL-02)
const KV_HEADERS = ['Mã hàng', 'Tên hàng', 'ĐVT', 'Tồn kho', 'Mã ĐVT Cơ bản']

function workbook(headers: readonly string[], rows: unknown[][], sheetName = 'DanhSachSanPham') {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([[...headers], ...rows]), sheetName)
  return new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }))
}

interface PreviewBody {
  data?: {
    totalRows: number
    items: number
    checks: number
    errors: { row: number; column: string; message: string }[]
    conversions: { code: string; count: number; rows: number[]; requiresConfirmation: boolean }[]
    requiresApproval: boolean
    sample: { sku: string; systemQty: number; actualQty: number }[]
    digest: string
  }
  error?: { code: string; message: string }
}

describe('GL-02: nhập tồn đầu kỳ từ tệp thành phiếu kiểm nháp', () => {
  let env: TestEnv
  let app: Hono

  beforeEach(async () => {
    env = await createTestEnv()
    app = createStockChecksRoutes({ db: env.db })
  })
  afterEach(async () => env.close())

  async function upload(path: string, bytes: Uint8Array, fields: Record<string, string> = {}) {
    const form = new FormData()
    form.append('file', new File([bytes], 'DanhSachSanPham_KV.xlsx'))
    for (const [key, value] of Object.entries(fields)) form.append(key, value)
    const response = await app.request(path, {
      method: 'POST',
      headers: env.owner.authHeader,
      body: form,
    })
    return { status: response.status, body: (await response.json()) as PreviewBody }
  }

  async function seedProduct(values: {
    sku: string
    trackInventory?: boolean
    costPrice?: number | null
    currentStock?: number
    hasVariants?: boolean
  }) {
    const [row] = await env.db
      .insert(products)
      .values({
        storeId: env.storeId,
        name: `Hàng ${values.sku}`,
        sku: values.sku,
        sellingPrice: 10_000,
        costPrice: values.costPrice === undefined ? 6_000 : values.costPrice,
        trackInventory: values.trackInventory ?? true,
        currentStock: values.currentStock ?? 0,
        hasVariants: values.hasVariants ?? false,
      })
      .returning({ id: products.id })
    return row!.id
  }

  const codes = (body: PreviewBody) =>
    Object.fromEntries(body.data!.conversions.map((c) => [c.code, c.count]))

  it('tệp xuất KiotViet: kẹp âm, làm tròn lẻ, bỏ dòng quy đổi, cần chấp thuận rồi tạo phiếu nháp có vết', async () => {
    const positive = await seedProduct({ sku: 'SP01' })
    await seedProduct({ sku: 'SP02', currentStock: 3 })
    await seedProduct({ sku: 'SP03' })
    await seedProduct({ sku: 'SP04' })
    await seedProduct({ sku: 'DV01', trackInventory: false })
    await seedProduct({ sku: 'SP05', costPrice: null })
    const parent = await seedProduct({ sku: 'AO', hasVariants: true })
    const [variant] = await env.db
      .insert(productVariants)
      .values({
        storeId: env.storeId,
        productId: parent,
        attribute1Name: 'Cỡ',
        attribute1Value: 'L',
        sku: 'AO-L',
        sellingPrice: 90_000,
        stockQuantity: 0,
      })
      .returning({ id: productVariants.id })

    const bytes = workbook(KV_HEADERS, [
      ['SP01', 'Hàng 1', 'Cái', 12, 'SP01'],
      ['SP02', 'Hàng 2', 'Cái', -7, 'SP02'],
      ['SP03', 'Hàng 3', 'Kg', 2.6, 'SP03'],
      ['SP04', 'Hàng 4', 'Cái', 0, 'SP04'],
      ['SP04-THUNG', 'Hàng 4 thùng', 'Thùng', 5, 'SP04'],
      ['DV01', 'Dịch vụ', 'Lần', 4, 'DV01'],
      ['SP05', 'Hàng 5', 'Cái', 9, 'SP05'],
      ['AO-L', 'Áo L', 'Cái', 6, 'AO-L'],
      ['SP06', 'Hàng 6 chưa nhập', 'Cái', '', 'SP06'],
    ])
    const preview = await upload('/import/preview', bytes)
    expect(preview.status).toBe(200)
    expect(preview.body.data).toMatchObject({ totalRows: 9, items: 5, checks: 1, errors: [] })
    expect(codes(preview.body)).toEqual({
      qty_negative: 1,
      qty_rounded: 1,
      qty_unchanged: 1,
      unit_row_skipped: 1,
      not_tracked: 1,
      cost_missing: 1,
      qty_blank: 1,
    })
    expect(preview.body.data!.requiresApproval).toBe(true)

    const refused = await upload('/import/confirm', bytes, { digest: preview.body.data!.digest })
    expect(refused.status).toBe(422)
    expect(refused.body.error?.message).toBe('Cần chấp thuận các thay đổi tự động trong báo cáo')
    expect(await env.db.select().from(stockChecks)).toHaveLength(0)

    const confirmed = await upload('/import/confirm', bytes, {
      digest: preview.body.data!.digest,
      approveConversions: 'true',
    })
    expect(confirmed.status).toBe(201)
    const created = confirmed.body.data as unknown as { ids: string[]; items: number }
    expect(created.items).toBe(5)
    expect(created.ids).toHaveLength(1)

    // Tồn chưa đổi cho tới khi người dùng xác nhận phiếu (ADR-0006)
    const [before] = await env.db
      .select({ stock: products.currentStock })
      .from(products)
      .where(eq(products.id, positive))
    expect(before!.stock).toBe(0)

    const lines = await env.db
      .select({
        sku: stockCheckItems.productSkuSnapshot,
        variantId: stockCheckItems.variantId,
        systemQty: stockCheckItems.systemQty,
        actualQty: stockCheckItems.actualQty,
      })
      .from(stockCheckItems)
      .where(eq(stockCheckItems.stockCheckId, created.ids[0]!))
    expect(lines.sort((a, b) => a.sku.localeCompare(b.sku) || a.actualQty - b.actualQty)).toEqual([
      { sku: 'AO', variantId: variant!.id, systemQty: 0, actualQty: 6 },
      { sku: 'SP01', variantId: null, systemQty: 0, actualQty: 12 },
      { sku: 'SP02', variantId: null, systemQty: 3, actualQty: 0 },
      { sku: 'SP03', variantId: null, systemQty: 0, actualQty: 3 },
      { sku: 'SP05', variantId: null, systemQty: 0, actualQty: 9 },
    ])

    await confirmStockCheck({
      db: env.db,
      actor: { userId: env.owner.id, storeId: env.storeId, role: env.owner.role },
      stockCheckId: created.ids[0]!,
    })
    const [after] = await env.db
      .select({ stock: products.currentStock })
      .from(products)
      .where(eq(products.id, positive))
    expect(after!.stock).toBe(12)
    const trail = await env.db
      .select({ quantity: inventoryTransactions.quantity })
      .from(inventoryTransactions)
      .where(eq(inventoryTransactions.productId, positive))
    expect(trail).toEqual([{ quantity: 12 }])
  })

  it('tệp mẫu hai cột, tự chia phiếu tối đa 1000 dòng trong một lần xác nhận', async () => {
    const rows: unknown[][] = []
    const values = Array.from({ length: 1001 }, (_, index) => {
      const sku = `M${String(index).padStart(4, '0')}`
      rows.push([sku, index + 1])
      return {
        storeId: env.storeId,
        name: `Hàng ${sku}`,
        sku,
        sellingPrice: 1_000,
        costPrice: 500,
        trackInventory: true,
      }
    })
    await env.db.insert(products).values(values)
    const bytes = workbook(['Mã hàng', 'Số lượng thực tế'], rows, 'Sheet1')
    const preview = await upload('/import/preview', bytes)
    expect(preview.body.data).toMatchObject({ items: 1001, checks: 2, requiresApproval: false })
    const confirmed = await upload('/import/confirm', bytes, { digest: preview.body.data!.digest })
    expect(confirmed.status).toBe(201)
    const checks = await env.db
      .select({
        totalItems: stockChecks.totalItems,
        note: stockChecks.note,
        code: stockChecks.code,
      })
      .from(stockChecks)
    expect(checks.map((c) => c.totalItems).sort((a, b) => a - b)).toEqual([1, 1000])
    expect(new Set(checks.map((c) => c.code)).size).toBe(2)
    expect(checks.map((c) => c.note).sort()).toEqual([
      'Nhập tồn đầu kỳ từ tệp DanhSachSanPham_KV.xlsx (phần 1/2)',
      'Nhập tồn đầu kỳ từ tệp DanhSachSanPham_KV.xlsx (phần 2/2)',
    ])
  })

  it('báo lỗi mã lạ, mã trùng, mã cha có biến thể và từ chối xác nhận', async () => {
    await seedProduct({ sku: 'SP01' })
    await seedProduct({ sku: 'AO', hasVariants: true })
    const bytes = workbook(
      ['Mã hàng', 'Số lượng thực tế'],
      [
        ['SP01', 1],
        ['sp01', 2],
        ['KHONG-CO', 3],
        ['AO', 4],
        ['SP01', 'mười'],
      ],
    )
    const preview = await upload('/import/preview', bytes)
    expect(preview.body.data!.errors.map((e) => [e.row, e.message])).toEqual([
      [3, 'Mã hàng sp01 bị trùng ở dòng 2 và 3'],
      [4, 'Không tìm thấy mã hàng KHONG-CO trong cửa hàng'],
      [5, 'Mã hàng AO có biến thể, vui lòng nhập tồn theo mã từng biến thể'],
      [6, 'Số lượng phải là số'],
    ])
    const confirmed = await upload('/import/confirm', bytes, { digest: preview.body.data!.digest })
    expect(confirmed.status).toBe(422)
    expect(confirmed.body.error?.message).toBe('Tệp còn dòng lỗi, vui lòng sửa rồi tải lại')
  })

  it('tồn đổi sau lúc xem trước thì từ chối xác nhận', async () => {
    const id = await seedProduct({ sku: 'SP01' })
    const bytes = workbook(['Mã hàng', 'Số lượng thực tế'], [['SP01', 5]])
    const preview = await upload('/import/preview', bytes)
    await env.db.update(products).set({ currentStock: 2 }).where(eq(products.id, id))
    const confirmed = await upload('/import/confirm', bytes, { digest: preview.body.data!.digest })
    expect(confirmed.status).toBe(409)
  })

  it('thiếu cột bắt buộc báo tiếng Việt', async () => {
    const preview = await upload('/import/preview', workbook(['Tên hàng', 'Giá bán'], [['A', 1]]))
    expect(preview.status).toBe(400)
    expect(preview.body.error?.message).toContain('Mã hàng')
  })
})

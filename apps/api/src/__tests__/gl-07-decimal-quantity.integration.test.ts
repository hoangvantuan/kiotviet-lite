import { and, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import {
  amountByQtyRatio,
  bulkImportJobs,
  calculateLineTotal,
  categories,
  categoryDiscounts,
  inventoryTransactions,
  lineAmount,
  orderItems,
  products,
  stockCheckItems,
} from '@kiotviet-lite/shared'

import { createOrdersRoutes } from '../routes/orders.routes.js'
import { createPosRoutes } from '../routes/pos.routes.js'
import { createProductsRoutes } from '../routes/products.routes.js'
import { createPurchaseOrdersRoutes } from '../routes/purchase-orders.routes.js'
import { createStockChecksRoutes } from '../routes/stock-checks.routes.js'
import { createSuppliersRoutes } from '../routes/suppliers.routes.js'
import { createSyncRoutes } from '../routes/sync.routes.js'
import { createBulkImportJob } from '../services/bulk-import-jobs.service.js'
import { previewBulkImport } from '../services/bulk-import-preview.service.js'
import { runBulkImportJob } from '../services/bulk-import-runner.service.js'
import { createCustomer } from './helpers/factories.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

// GL-07, POS-09 (ADR-0015): số lượng thập phân cho hàng cân ký. Sau mỗi ca, bộ bất biến GL-14
// (scripts/invariants.sql, gồm I6 tồn = sổ kho và I11 tồn nguyên cho hàng không bật cờ) phải sạch.

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

const __dirname = dirname(fileURLToPath(import.meta.url))
const INVARIANT_INSERTS = readFileSync(resolve(__dirname, '../../scripts/invariants.sql'), 'utf8')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')
  .split(';')
  .map((stmt) => stmt.trim())
  .filter((stmt) => stmt.startsWith('INSERT INTO invariant_violations'))

let env: TestEnv
let app: Hono

interface Resp {
  status: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
}

async function call(
  method: string,
  path: string,
  body?: unknown,
  idempotent = false,
): Promise<Resp> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...env.owner.authHeader,
  }
  if (idempotent) headers['Idempotency-Key'] = randomUUID()
  const res = await app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : undefined }
}

async function invariantViolations() {
  await env.db.execute(sql`
    CREATE TEMP TABLE IF NOT EXISTS invariant_violations (
      check_name text NOT NULL, store_id uuid, entity text NOT NULL, detail text NOT NULL
    )`)
  await env.db.execute(sql`DELETE FROM invariant_violations`)
  expect(INVARIANT_INSERTS.length).toBeGreaterThanOrEqual(10)
  for (const stmt of INVARIANT_INSERTS) await env.db.execute(sql.raw(stmt))
  const result = (await env.db.execute(
    sql`SELECT check_name, entity, detail FROM invariant_violations`,
  )) as unknown as { rows: unknown[] }
  return result.rows
}

async function createProduct(
  values: Record<string, unknown>,
): Promise<{ id: string; name: string }> {
  const r = await call('POST', '/products', {
    sku: `SP-${randomUUID().slice(0, 8)}`,
    trackInventory: true,
    ...values,
  })
  expect(r.status).toBe(201)
  return r.body.data
}

async function stockOf(productId: string): Promise<number> {
  const [row] = await env.db
    .select({ stock: products.currentStock, cost: products.costPrice })
    .from(products)
    .where(eq(products.id, productId))
  return row!.stock
}

/** Đơn POS một dòng, tiền dòng tính bằng đúng hàm dùng chung mà POS và PGlite gọi */
function orderBody(line: {
  productId: string
  productName: string
  unitPrice: number
  quantity: number
  unitConversionId?: string
}) {
  const { lineTotal } = calculateLineTotal({
    unitPrice: line.unitPrice,
    quantity: line.quantity,
    discountType: 'amount',
    discountValue: 0,
  })
  return {
    subtotal: lineTotal,
    discountValue: 0,
    discountAmount: 0,
    total: lineTotal,
    paymentMethod: 'cash',
    paymentStatus: 'paid',
    cashAmount: lineTotal,
    transferAmount: 0,
    debtLimitOverridden: false,
    items: [
      {
        productId: line.productId,
        productName: line.productName,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        lineTotal,
        originalPrice: line.unitPrice,
        priceOverride: false,
        ...(line.unitConversionId ? { unitConversionId: line.unitConversionId } : {}),
      },
    ],
  }
}

beforeEach(async () => {
  env = await createTestEnv()
  app = new Hono()
  app.route('/pos', createPosRoutes({ db: env.db }))
  app.route('/sync', createSyncRoutes({ db: env.db }))
  app.route('/orders', createOrdersRoutes({ db: env.db }))
  app.route('/products', createProductsRoutes({ db: env.db }))
  app.route('/purchase-orders', createPurchaseOrdersRoutes({ db: env.db }))
  app.route('/suppliers', createSuppliersRoutes({ db: env.db }))
  app.route('/stock-checks', createStockChecksRoutes({ db: env.db }))
})

afterEach(async () => {
  expect(await invariantViolations()).toEqual([])
  await env.close()
})

describe('GL-07: bán, trả, nhập, kiểm kê với số lượng thập phân', () => {
  it('bán 1,255 kg giá 45.000 đ/kg: tiền dòng 56.475 đ, tồn giảm đúng 1,255; trả 0,5 kg', async () => {
    expect(lineAmount(45_000, 1.255)).toBe(56_475)
    const pork = await createProduct({
      name: 'Thịt heo',
      unit: 'kg',
      sellingPrice: 45_000,
      costPrice: 30_000,
      allowDecimalQuantity: true,
      initialStock: 10,
    })

    const sold = await call(
      'POST',
      '/pos/orders',
      orderBody({ productId: pork.id, productName: pork.name, unitPrice: 45_000, quantity: 1.255 }),
      true,
    )
    expect(sold.status).toBe(201)
    expect(sold.body.data.total).toBe(56_475)
    const orderId = sold.body.data.id as string

    const [line] = await env.db.select().from(orderItems).where(eq(orderItems.orderId, orderId))
    expect(line).toMatchObject({ quantity: 1.255, lineTotal: 56_475 })
    expect(await stockOf(pork.id)).toBe(8.745)
    const ledger = await env.db
      .select({
        quantity: inventoryTransactions.quantity,
        stockAfter: inventoryTransactions.stockAfter,
      })
      .from(inventoryTransactions)
      .where(
        and(eq(inventoryTransactions.productId, pork.id), eq(inventoryTransactions.type, 'sale')),
      )
    expect(ledger).toEqual([{ quantity: -1.255, stockAfter: 8.745 }])

    // Trả 0,5 kg: tiền hoàn theo tỷ lệ số lượng, làm tròn về đồng một lần
    const returned = await call(
      'POST',
      `/orders/${orderId}/returns`,
      { items: [{ orderItemId: line!.id, quantity: 0.5, reason: 'defective' }] },
      true,
    )
    expect(returned.status).toBe(201)
    expect(returned.body.data.refundAmount).toBe(amountByQtyRatio(56_475, 0.5, 1.255))
    expect(returned.body.data.refundAmount).toBe(22_500)
    expect(await stockOf(pork.id)).toBe(9.245)

    // Phần còn lại 0,755 kg: trả vượt bị chặn
    const over = await call(
      'POST',
      `/orders/${orderId}/returns`,
      { items: [{ orderItemId: line!.id, quantity: 0.756, reason: 'defective' }] },
      true,
    )
    expect(over.status).toBe(400)
  })

  it('hàng không bật cờ gửi 1,5 bị 400; số nguyên từ máy khách cũ vẫn nhận', async () => {
    const cup = await createProduct({
      name: 'Cốc sứ',
      unit: 'cái',
      sellingPrice: 20_000,
      initialStock: 5,
    })
    const decimal = await call(
      'POST',
      '/pos/orders',
      orderBody({ productId: cup.id, productName: cup.name, unitPrice: 20_000, quantity: 1.5 }),
      true,
    )
    expect(decimal.status).toBe(400)
    expect(decimal.body.error.details).toMatchObject({ reason: 'decimal_quantity_not_allowed' })
    expect(await stockOf(cup.id)).toBe(5)

    const whole = await call(
      'POST',
      '/pos/orders',
      orderBody({ productId: cup.id, productName: cup.name, unitPrice: 20_000, quantity: 2 }),
    )
    expect(whole.status).toBe(201)
    expect(await stockOf(cup.id)).toBe(3)

    // Hơn 3 chữ số lẻ thì bị chặn ở mọi mặt hàng
    const pork = await createProduct({
      name: 'Thịt bò',
      unit: 'kg',
      sellingPrice: 250_000,
      allowDecimalQuantity: true,
      initialStock: 3,
    })
    const tooFine = await call(
      'POST',
      '/pos/orders',
      orderBody({
        productId: pork.id,
        productName: pork.name,
        unitPrice: 250_000,
        quantity: 1.2345,
      }),
    )
    expect(tooFine.status).toBe(400)
  })

  it('đơn vị quy đổi: 0,5 thùng 24 lon được (12 lon), 0,3 thùng bị 400 khi hàng gốc không bật cờ', async () => {
    const can = await createProduct({
      name: 'Bia lon',
      unit: 'lon',
      sellingPrice: 10_000,
      initialStock: 48,
    })
    const conv = await call('POST', `/products/${can.id}/unit-conversions`, {
      unit: 'Thùng',
      conversionFactor: 24,
      sellingPrice: 240_000,
      allowDecimalQuantity: true,
    })
    expect(conv.status).toBe(201)
    const half = await call(
      'POST',
      '/pos/orders',
      orderBody({
        productId: can.id,
        productName: can.name,
        unitPrice: 240_000,
        quantity: 0.5,
        unitConversionId: conv.body.data.id,
      }),
    )
    expect(half.status).toBe(201)
    expect(await stockOf(can.id)).toBe(36)
    const third = await call(
      'POST',
      '/pos/orders',
      orderBody({
        productId: can.id,
        productName: can.name,
        unitPrice: 240_000,
        quantity: 0.3,
        unitConversionId: conv.body.data.id,
      }),
    )
    expect(third.status).toBe(400)
    expect(await stockOf(can.id)).toBe(36)
  })

  it('phiếu nhập 10,5 kg cập nhật giá vốn bình quân đúng', async () => {
    const fish = await createProduct({
      name: 'Cá basa',
      unit: 'kg',
      sellingPrice: 60_000,
      costPrice: 30_000,
      allowDecimalQuantity: true,
      initialStock: 2.5,
    })
    expect(await stockOf(fish.id)).toBe(2.5)
    const supplier = await call('POST', '/suppliers', { name: 'NCC cá' })
    const po = await call(
      'POST',
      '/purchase-orders',
      {
        supplierId: supplier.body.data.id,
        items: [{ productId: fish.id, quantity: 10.5, unitPrice: 40_000 }],
      },
      true,
    )
    expect(po.status).toBe(201)
    expect(po.body.data.totalAmount).toBe(420_000)
    const [row] = await env.db
      .select({ stock: products.currentStock, cost: products.costPrice })
      .from(products)
      .where(eq(products.id, fish.id))
    // (2,5 × 30.000 + 420.000) / 13 = 38.076,92 → 38.077
    expect(row).toEqual({ stock: 13, cost: 38_077 })

    // Trả hàng nhập 2,5 kg: rút đúng 2,5 kg giá 40.000, giá vốn còn lại tính lại trên 10,5 kg
    const ret = await call(
      'POST',
      `/purchase-orders/${po.body.data.id}/returns`,
      { items: [{ purchaseOrderItemId: po.body.data.items[0].id, quantity: 2.5 }] },
      true,
    )
    expect(ret.status).toBe(201)
    const [afterReturn] = await env.db
      .select({ stock: products.currentStock, cost: products.costPrice })
      .from(products)
      .where(eq(products.id, fish.id))
    // (13 × 38.077 − 100.000) / 10,5 = 37.619,14 → 37.619
    expect(afterReturn).toEqual({ stock: 10.5, cost: 37_619 })

    // Hàng không bật cờ nhập 1,5 bị 400
    const cup = await createProduct({ name: 'Bát', unit: 'cái', sellingPrice: 10_000 })
    const bad = await call('POST', '/purchase-orders', {
      supplierId: supplier.body.data.id,
      items: [{ productId: cup.id, quantity: 1.5, unitPrice: 5_000 }],
    })
    expect(bad.status).toBe(400)
  })

  it('kiểm kê số lẻ: tồn thực tế 7,25 kg; hàng không bật cờ nhận 1,5 bị 400', async () => {
    const rice = await createProduct({
      name: 'Gạo',
      unit: 'kg',
      sellingPrice: 18_000,
      costPrice: 15_000,
      allowDecimalQuantity: true,
      initialStock: 10,
    })
    const check = await call('POST', '/stock-checks', {
      items: [{ productId: rice.id, actualQty: 7.25 }],
    })
    expect(check.status).toBe(201)
    expect(check.body.data).toMatchObject({ totalDiffNegative: 2.75, totalDiffPositive: 0 })
    const confirmed = await call(
      'POST',
      `/stock-checks/${check.body.data.id}/confirm`,
      undefined,
      true,
    )
    expect(confirmed.status).toBe(200)
    expect(await stockOf(rice.id)).toBe(7.25)

    const cup = await createProduct({ name: 'Đĩa', unit: 'cái', sellingPrice: 10_000 })
    const bad = await call('POST', '/stock-checks', {
      items: [{ productId: cup.id, actualQty: 1.5 }],
    })
    expect(bad.status).toBe(400)

    // Tắt bán số lẻ khi tồn đang lẻ bị chặn
    const off = await call('PATCH', `/products/${rice.id}`, { allowDecimalQuantity: false })
    expect(off.status).toBe(422)
  })

  it('hủy đơn bán số lẻ hoàn đúng tồn đã trừ', async () => {
    const pork = await createProduct({
      name: 'Chả lụa',
      unit: 'kg',
      sellingPrice: 180_000,
      allowDecimalQuantity: true,
      initialStock: 2,
    })
    const sold = await call(
      'POST',
      '/pos/orders',
      orderBody({ productId: pork.id, productName: pork.name, unitPrice: 180_000, quantity: 0.75 }),
    )
    expect(sold.status).toBe(201)
    expect(await stockOf(pork.id)).toBe(1.25)
    const cancelled = await call(
      'POST',
      `/orders/${sold.body.data.id}/cancel`,
      { reason: 'Nhập nhầm' },
      true,
    )
    expect(cancelled.status).toBe(200)
    expect(await stockOf(pork.id)).toBe(2)
  })

  it('B1: chiết khấu danh mục với số lượng lẻ, có khách: tính giá, tạo đơn, đồng bộ ngoại tuyến không 500', async () => {
    const [category] = await env.db
      .insert(categories)
      .values({ storeId: env.storeId, name: 'Thịt tươi' })
      .returning()
    const pork = await createProduct({
      name: 'Thịt ba chỉ',
      unit: 'kg',
      sellingPrice: 45_000,
      categoryId: category!.id,
      allowDecimalQuantity: true,
      initialStock: 10,
    })
    const customer = await createCustomer(env)
    await env.db.insert(categoryDiscounts).values({
      storeId: env.storeId,
      categoryId: category!.id,
      customerId: customer.id,
      discountType: 'percent',
      discountValue: 10,
      minQty: 1,
      isActive: true,
    })

    const resolved = await call('POST', '/pos/resolve-prices', {
      customerId: customer.id,
      items: [
        { productId: pork.id, quantity: 1.5 },
        { productId: pork.id, quantity: 0.5 },
      ],
    })
    expect(resolved.status).toBe(200)
    expect(
      resolved.body.data.map((p: { price: number; source: string }) => [p.price, p.source]),
    ).toEqual([
      [40_500, 'category_discount'],
      [45_000, 'retail_price'],
    ])

    const body = {
      ...orderBody({
        productId: pork.id,
        productName: pork.name,
        unitPrice: 40_500,
        quantity: 1.5,
      }),
      customerId: customer.id,
    }
    // 1,5 × 40.500 = 60.750
    expect(body.total).toBe(60_750)
    const online = await call('POST', '/pos/orders', body, true)
    expect(online.status).toBe(201)
    const pushed = await call('POST', '/sync/push', {
      clientId: randomUUID(),
      orders: [{ clientId: randomUUID(), createdAt: new Date().toISOString(), orderData: body }],
    })
    expect(pushed.status).toBe(200)
    expect(pushed.body.data.results[0].status).toBe('synced')
    expect(await stockOf(pork.id)).toBe(7)
  })

  it('đơn ngoại tuyến số lẻ đồng bộ đúng, cùng tiền dòng với đơn trực tuyến', async () => {
    const pork = await createProduct({
      name: 'Sườn non',
      unit: 'kg',
      sellingPrice: 10_001,
      allowDecimalQuantity: true,
      initialStock: 5,
    })
    const body = orderBody({
      productId: pork.id,
      productName: pork.name,
      unitPrice: 10_001,
      quantity: 0.333,
    })
    // 0,333 × 10.001 = 3.330,333 → 3.330 ở mọi đường tính
    expect(body.total).toBe(3_330)

    const online = await call('POST', '/pos/orders', body, true)
    expect(online.status).toBe(201)
    const pushed = await call('POST', '/sync/push', {
      clientId: randomUUID(),
      orders: [{ clientId: randomUUID(), createdAt: new Date().toISOString(), orderData: body }],
    })
    expect(pushed.status).toBe(200)
    expect(pushed.body.data.results[0].status).toBe('synced')
    const offlineId = pushed.body.data.results[0].serverId as string

    const lines = await env.db
      .select({
        orderId: orderItems.orderId,
        quantity: orderItems.quantity,
        lineTotal: orderItems.lineTotal,
      })
      .from(orderItems)
      .where(eq(orderItems.productId, pork.id))
    expect(lines).toHaveLength(2)
    for (const l of lines) expect(l).toMatchObject({ quantity: 0.333, lineTotal: 3_330 })
    expect(lines.some((l) => l.orderId === offlineId)).toBe(true)
    expect(await stockOf(pork.id)).toBe(4.334)
  })
})

describe('GL-07: nhập Excel số lẻ', () => {
  const KV_PRODUCT_HEADERS = [
    'Loại hàng',
    'Mã hàng',
    'Tên hàng',
    'Giá bán',
    'Tồn kho',
    'ĐVT',
    'Mã ĐVT Cơ bản',
    'Nhóm hàng(3 Cấp)',
  ]
  const KV_STOCK_HEADERS = ['Mã hàng', 'Tên hàng', 'ĐVT', 'Tồn kho', 'Mã ĐVT Cơ bản']

  function workbook(headers: readonly string[], rows: unknown[][], sheetName = 'DanhSachSanPham') {
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([[...headers], ...rows]), sheetName)
    return new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }))
  }

  const actor = () => ({ storeId: env.storeId, userId: env.owner.id, role: 'owner' as const })

  async function importProducts(bytes: Uint8Array) {
    const plan = await previewBulkImport({
      db: env.db,
      actor: actor(),
      kind: 'products',
      mode: 'upsert',
      bytes,
      filename: 'kv.xlsx',
    })
    expect(plan.errors).toEqual([])
    const root = await mkdtemp(join(tmpdir(), 'gl07-'))
    try {
      const job = await createBulkImportJob({
        db: env.db,
        storageRoot: root,
        actor: actor(),
        type: 'product',
        mode: 'upsert',
        originalFilename: 'kv.xlsx',
        totalRows: plan.totalRows,
        file: bytes,
        digest: plan.digest,
        approveNewNames: true,
        approveConversions: true,
      })
      await runBulkImportJob({ db: env.db, storageRoot: root, storeId: env.storeId, id: job.id })
      const [done] = await env.db.select().from(bulkImportJobs).where(eq(bulkImportJobs.id, job.id))
      expect(done!.status).toBe('completed')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  async function uploadStock(path: string, bytes: Uint8Array, fields: Record<string, string> = {}) {
    const form = new FormData()
    form.append('file', new File([bytes], 'DanhSachSanPham_KV.xlsx'))
    for (const [key, value] of Object.entries(fields)) form.append(key, value)
    const res = await app.request(`/stock-checks${path}`, {
      method: 'POST',
      headers: env.owner.authHeader,
      body: form,
    })
    return { status: res.status, body: (await res.json()) as Resp['body'] }
  }

  it('tệp KiotViet: hàng kg và hàng có tồn lẻ tự bật bán số lẻ, tồn đầu kỳ lẻ mang sang đúng', async () => {
    const rows = [
      ['Hàng hóa', 'KG01', 'Thịt heo', 145_000, 12.345, 'kg', 'KG01', 'Tươi sống'],
      ['Hàng hóa', 'KG02', 'Rau muống', 20_000, 3, 'Kg', 'KG02', 'Tươi sống'],
      ['Hàng hóa', 'CU01', 'Dây điện', 8_000, 25.5, 'Cuộn', 'CU01', 'Điện'],
      ['Hàng hóa', 'CAI01', 'Ổ cắm', 50_000, 4, 'Cái', 'CAI01', 'Điện'],
    ]
    await importProducts(workbook(KV_PRODUCT_HEADERS, rows))
    const imported = await env.db
      .select({
        sku: products.sku,
        allow: products.allowDecimalQuantity,
        stock: products.currentStock,
      })
      .from(products)
      .where(eq(products.storeId, env.storeId))
    expect(Object.fromEntries(imported.map((p) => [p.sku, p.allow]))).toEqual({
      KG01: true,
      KG02: true,
      CU01: true,
      CAI01: false,
    })
    // ADR-0006: nhập danh mục không đổi tồn
    expect(imported.every((p) => p.stock === 0)).toBe(true)

    // Tồn đầu kỳ bằng chính tệp đó
    const stockFile = workbook(
      KV_STOCK_HEADERS,
      rows.map((r) => [r[1], r[2], r[5], r[4], r[6]]),
    )
    const preview = await uploadStock('/import/preview', stockFile)
    expect(preview.status).toBe(200)
    expect(preview.body.data.errors).toEqual([])
    const confirmed = await uploadStock('/import/confirm', stockFile, {
      digest: preview.body.data.digest,
      approveConversions: 'true',
    })
    expect(confirmed.status).toBe(201)
    const lines = await env.db
      .select({ sku: stockCheckItems.productSkuSnapshot, actualQty: stockCheckItems.actualQty })
      .from(stockCheckItems)
    expect(Object.fromEntries(lines.map((l) => [l.sku, l.actualQty]))).toEqual({
      KG01: 12.345,
      KG02: 3,
      CU01: 25.5,
      CAI01: 4,
    })
  })

  it('tồn đầu kỳ lẻ ở hàng không bật cờ báo lỗi đúng dòng', async () => {
    await env.db.insert(products).values({
      storeId: env.storeId,
      name: 'Ổ cắm',
      sku: 'CAI01',
      sellingPrice: 50_000,
      trackInventory: true,
    })
    const preview = await uploadStock(
      '/import/preview',
      workbook(KV_STOCK_HEADERS, [['CAI01', 'Ổ cắm', 'Cái', 2.5, 'CAI01']]),
    )
    expect(preview.status).toBe(200)
    expect(preview.body.data.errors).toEqual([
      {
        row: 2,
        column: 'Tồn kho',
        message: 'Mã hàng CAI01 chỉ nhận số lượng nguyên (mặt hàng chưa bật bán số lẻ)',
      },
    ])
  })

  it('tệp mẫu có cột Bán số lẻ và Định mức tối thiểu lẻ', async () => {
    const { BULK_EXPORT_HEADERS } = await import('../services/bulk-export.service.js')
    const headers = [...BULK_EXPORT_HEADERS.products]
    const row = (values: Record<string, unknown>) => headers.map((h) => values[h] ?? null)
    const bytes = workbook(
      headers,
      [
        row({
          'Mã hàng': 'T01',
          'Tên hàng': 'Tôm',
          'Giá bán': 300_000,
          'Đơn vị': 'kg',
          'Trạng thái': 'active',
          'Theo dõi tồn kho': 'Có',
          'Định mức tối thiểu': 1.5,
          'Bán số lẻ': 'Có',
        }),
        row({
          'Mã hàng': 'T02',
          'Tên hàng': 'Rổ',
          'Giá bán': 30_000,
          'Đơn vị': 'cái',
          'Trạng thái': 'active',
          'Theo dõi tồn kho': 'Có',
          'Bán số lẻ': 'Không',
        }),
      ],
      'Dữ liệu',
    )
    await importProducts(bytes)
    const imported = await env.db
      .select({
        sku: products.sku,
        allow: products.allowDecimalQuantity,
        minStock: products.minStock,
      })
      .from(products)
      .where(eq(products.storeId, env.storeId))
    expect(imported.sort((a, b) => a.sku.localeCompare(b.sku))).toEqual([
      { sku: 'T01', allow: true, minStock: 1.5 },
      { sku: 'T02', allow: false, minStock: 0 },
    ])
  })
})

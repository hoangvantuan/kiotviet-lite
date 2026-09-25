import { and, eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  inventoryTransactions,
  products,
  productVariants,
  purchaseOrderItems,
  suppliers,
} from '@kiotviet-lite/shared'

import { createPurchaseOrdersRoutes } from '../routes/purchase-orders.routes.js'
import { getEffectiveCostPrice } from '../services/inventory-cost.helper.js'
import { getInventoryCurrent } from '../services/inventory-report.service.js'
import { recordManualAdjustment } from '../services/inventory-transactions.service.js'
import { listProductPurchaseHistory } from '../services/product-history.service.js'
import {
  createProduct,
  createUnitConversion,
  createVariant,
  resetFactorySeq,
} from './helpers/factories.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.ACCESS_TOKEN_TTL_SECONDS = '900'
  process.env.REFRESH_TOKEN_TTL_SECONDS = '604800'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

interface POItemResp {
  productId: string
  variantId: string | null
  quantity: number
  baseQuantity: number
  unitName: string | null
  conversionFactor: number
  unitPrice: number
  discountAmount: number
  lineTotal: number
  orderDiscountAllocated: number | null
  unitCost: number | null
  costAfter: number | null
  stockAfter: number | null
}
interface PODetailResp {
  id: string
  code: string
  subtotal: number
  discountTotal: number
  totalAmount: number
  items: POItemResp[]
}

let env: TestEnv
let poApp: ReturnType<typeof createPurchaseOrdersRoutes>
let supplierId: string

async function postPO(body: Record<string, unknown>) {
  const res = await poApp.request('/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...env.owner.authHeader },
    body: JSON.stringify({ supplierId, ...body }),
  })
  const json = (await res.json()) as { data: PODetailResp; error?: { code: string } }
  return { status: res.status, body: json }
}

async function productRow(id: string) {
  const [row] = await env.db.select().from(products).where(eq(products.id, id))
  return row!
}

async function variantRow(id: string) {
  const [row] = await env.db.select().from(productVariants).where(eq(productVariants.id, id))
  return row!
}

async function ledgerRows(productId: string, note: string) {
  return env.db
    .select()
    .from(inventoryTransactions)
    .where(
      and(eq(inventoryTransactions.productId, productId), eq(inventoryTransactions.note, note)),
    )
}

beforeEach(async () => {
  resetFactorySeq()
  env = await createTestEnv()
  poApp = createPurchaseOrdersRoutes({ db: env.db })
  const [sup] = await env.db
    .insert(suppliers)
    .values({ storeId: env.storeId, name: 'NCC giá vốn', code: 'NCC-GV' })
    .returning()
  supplierId = sup!.id
})

afterEach(async () => {
  await env.close()
})

describe('KHO-04: chiết khấu phiếu nhập trừ vào giá vốn (VAS 02 đoạn 06)', () => {
  it('Phiếu 300.000 đ chiết khấu phiếu 10% → giá trị tồn tăng đúng 270.000 đ', async () => {
    // Tái hiện w11 PN-0002: DN001 tồn 40, giá vốn 32.000
    const p = await createProduct(env, { sku: 'DN001', currentStock: 40, costPrice: 32_000 })
    const valueBefore = 40 * 32_000

    const r = await postPO({
      items: [{ productId: p.id, quantity: 10, unitPrice: 30_000 }],
      discountTotalType: 'percent',
      discountTotalValue: 1000, // phần vạn: 1000 = 10%
      paidAmount: 270_000,
    })
    expect(r.status).toBe(201)
    expect(r.body.data.subtotal).toBe(300_000)
    expect(r.body.data.discountTotal).toBe(30_000)
    expect(r.body.data.totalAmount).toBe(270_000)
    const item = r.body.data.items[0]!
    expect(item.orderDiscountAllocated).toBe(30_000)
    expect(item.unitCost).toBe(27_000)
    // Tính tay: (40×32.000 + 270.000) / 50 = 31.000 (trước khi sửa: 31.600)
    expect(item.costAfter).toBe(31_000)

    const after = await productRow(p.id)
    expect(after.currentStock).toBe(50)
    expect(after.costPrice).toBe(31_000)
    expect(after.currentStock * after.costPrice! - valueBefore).toBe(270_000)

    // Sổ giao dịch kho ghi giá nhập thực, không phải đơn giá niêm yết
    const [ledger] = await ledgerRows(p.id, r.body.data.code)
    expect(ledger?.unitCost).toBe(27_000)
    expect(ledger?.costAfter).toBe(31_000)
  })

  it('Chiết khấu dòng + chiết khấu phiếu đều vào giá vốn (w11 PN-0001)', async () => {
    const p = await createProduct(env, { sku: 'NM001', currentStock: 60, costPrice: 17_000 })
    const r = await postPO({
      items: [
        {
          productId: p.id,
          quantity: 10,
          unitPrice: 20_000,
          discountType: 'amount',
          discountValue: 50_000,
        },
      ],
      discountTotalType: 'percent',
      discountTotalValue: 10, // 0,10%
    })
    expect(r.status).toBe(201)
    expect(r.body.data.subtotal).toBe(150_000)
    expect(r.body.data.discountTotal).toBe(150)
    expect(r.body.data.totalAmount).toBe(149_850)
    const item = r.body.data.items[0]!
    expect(item.lineTotal).toBe(150_000)
    expect(item.orderDiscountAllocated).toBe(150)
    // 149.850 / 10 = 14.985
    expect(item.unitCost).toBe(14_985)
    // Tính tay: (60×17.000 + 149.850) / 70 = 16.712,14 → 16.712 (trước khi sửa: 17.429)
    expect(item.costAfter).toBe(16_712)
    expect((await productRow(p.id)).costPrice).toBe(16_712)
    const [ledger] = await ledgerRows(p.id, r.body.data.code)
    expect(ledger?.unitCost).toBe(14_985)
  })

  it('Phân bổ chiết khấu phiếu theo tỷ lệ thành tiền dòng, tổng phân bổ khớp đúng số chiết khấu', async () => {
    const a = await createProduct(env, { currentStock: 0, costPrice: null })
    const b = await createProduct(env, { currentStock: 0, costPrice: null })
    const c = await createProduct(env, { currentStock: 0, costPrice: null })
    // Ba dòng 100.000 đ, chiết khấu phiếu 100 đ: 33,33 mỗi dòng → 34 + 33 + 33
    const r = await postPO({
      items: [
        { productId: a.id, quantity: 1, unitPrice: 100_000 },
        { productId: b.id, quantity: 1, unitPrice: 100_000 },
        { productId: c.id, quantity: 1, unitPrice: 100_000 },
      ],
      discountTotalType: 'amount',
      discountTotalValue: 100,
    })
    expect(r.status).toBe(201)
    const allocs = r.body.data.items.map((it) => it.orderDiscountAllocated)
    expect(allocs).toEqual([34, 33, 33])
    expect(allocs.reduce((s, v) => s! + v!, 0)).toBe(r.body.data.discountTotal)
    // Tổng tiền hàng thực các dòng = tổng phiếu
    const netTotal = r.body.data.items.reduce(
      (s, it) => s + it.lineTotal - it.orderDiscountAllocated!,
      0,
    )
    expect(netTotal).toBe(r.body.data.totalAmount)
    expect((await productRow(a.id)).costPrice).toBe(99_966)
    expect((await productRow(b.id)).costPrice).toBe(99_967)

    // Dòng giá trị lớn nhận phần lớn: 200.000 và 100.000, chiết khấu 30.000 → 20.000 và 10.000
    const d = await createProduct(env, { currentStock: 0, costPrice: null })
    const e = await createProduct(env, { currentStock: 0, costPrice: null })
    const r2 = await postPO({
      items: [
        { productId: d.id, quantity: 4, unitPrice: 50_000 },
        { productId: e.id, quantity: 2, unitPrice: 50_000 },
      ],
      discountTotalType: 'amount',
      discountTotalValue: 30_000,
    })
    expect(r2.body.data.items.map((it) => it.orderDiscountAllocated)).toEqual([20_000, 10_000])
    expect((await productRow(d.id)).costPrice).toBe(45_000)
    expect((await productRow(e.id)).costPrice).toBe(45_000)
  })

  it('Dòng giá 0 đồng không nhận chiết khấu phiếu, giá vốn không âm', async () => {
    const paid = await createProduct(env, { currentStock: 0, costPrice: null })
    const gift = await createProduct(env, { currentStock: 0, costPrice: null })
    const r = await postPO({
      items: [
        { productId: paid.id, quantity: 3, unitPrice: 10_000 },
        { productId: gift.id, quantity: 5, unitPrice: 0 },
      ],
      discountTotalType: 'amount',
      discountTotalValue: 1_000,
    })
    expect(r.status).toBe(201)
    expect(r.body.data.items.map((it) => it.orderDiscountAllocated)).toEqual([1_000, 0])
    expect((await productRow(gift.id)).costPrice).toBe(0)
    // 29.000 / 3 = 9.666,67 → 9.667
    expect((await productRow(paid.id)).costPrice).toBe(9_667)
  })
})

describe('KHO-05: nhập biến thể cập nhật giá vốn biến thể và tồn cha', () => {
  it('Nhập 10 lon × 30.000 → giá vốn lon 15.500, chai giữ nguyên, tồn cha 110', async () => {
    // Tái hiện w11: BH001 cha tồn 100 giá vốn 13.000; LON 50/12.600; CHAI 50/11.900
    const parent = await createProduct(env, {
      sku: 'BH001',
      withVariants: true,
      currentStock: 100,
      costPrice: 13_000,
    })
    const lon = await createVariant(env, parent.id, {
      sku: 'BH001-LON',
      attribute1Value: 'Lon',
      stockQuantity: 50,
      costPrice: 12_600,
    })
    const chai = await createVariant(env, parent.id, {
      sku: 'BH001-CHAI',
      attribute1Value: 'Chai',
      stockQuantity: 50,
      costPrice: 11_900,
    })

    const r = await postPO({
      items: [{ productId: parent.id, variantId: lon.id, quantity: 10, unitPrice: 30_000 }],
    })
    expect(r.status).toBe(201)
    const item = r.body.data.items[0]!
    // Tính tay: (50×12.600 + 10×30.000) / 60 = 15.500
    expect(item.costAfter).toBe(15_500)
    expect(item.stockAfter).toBe(60)

    const lonAfter = await variantRow(lon.id)
    expect(lonAfter.stockQuantity).toBe(60)
    expect(lonAfter.costPrice).toBe(15_500)
    const chaiAfter = await variantRow(chai.id)
    expect(chaiAfter.stockQuantity).toBe(50)
    expect(chaiAfter.costPrice).toBe(11_900)

    // Tồn cha đồng bộ ngay; giá vốn cha = bình quân theo tồn
    // (60×15.500 + 50×11.900) / 110 = 1.525.000 / 110 = 13.863,6 → 13.864
    const parentAfter = await productRow(parent.id)
    expect(parentAfter.currentStock).toBe(110)
    expect(parentAfter.costPrice).toBe(13_864)

    // Báo cáo tồn kho không còn thiếu 10 đơn vị; giá trị ≈ 1.525.000 (sai số làm tròn ≤ 55 đ)
    const report = await getInventoryCurrent(env.db, env.storeId)
    const row = report.rows.find((x) => x.productId === parent.id)!
    expect(row.currentStock).toBe(110)
    expect(Math.abs(row.stockValue - 1_525_000)).toBeLessThanOrEqual(55)

    // Giá vốn dùng khi bán (API cho luồng chụp giá vốn đơn bán)
    expect(
      await getEffectiveCostPrice({
        db: env.db,
        storeId: env.storeId,
        productId: parent.id,
        variantId: lon.id,
      }),
    ).toBe(15_500)
    expect(
      await getEffectiveCostPrice({
        db: env.db,
        storeId: env.storeId,
        productId: parent.id,
        variantId: chai.id,
      }),
    ).toBe(11_900)

    const [ledger] = await ledgerRows(parent.id, r.body.data.code)
    expect(ledger?.variantId).toBe(lon.id)
    expect(ledger?.unitCost).toBe(30_000)
    expect(ledger?.costAfter).toBe(15_500)
  })

  it('Biến thể chưa có giá vốn riêng kế thừa giá vốn cha làm giá vốn trước', async () => {
    const parent = await createProduct(env, {
      withVariants: true,
      currentStock: 10,
      costPrice: 20_000,
    })
    const v = await createVariant(env, parent.id, { stockQuantity: 10, costPrice: null })
    expect(
      await getEffectiveCostPrice({
        db: env.db,
        storeId: env.storeId,
        productId: parent.id,
        variantId: v.id,
      }),
    ).toBe(20_000)

    await postPO({
      items: [{ productId: parent.id, variantId: v.id, quantity: 10, unitPrice: 30_000 }],
    })
    // (10×20.000 + 300.000) / 20 = 25.000
    expect((await variantRow(v.id)).costPrice).toBe(25_000)
    expect((await productRow(parent.id)).currentStock).toBe(20)
  })

  it('Chiết khấu phiếu cũng vào giá vốn biến thể', async () => {
    const parent = await createProduct(env, { withVariants: true, currentStock: 0 })
    const v = await createVariant(env, parent.id, { stockQuantity: 0, costPrice: null })
    await postPO({
      items: [{ productId: parent.id, variantId: v.id, quantity: 10, unitPrice: 30_000 }],
      discountTotalType: 'percent',
      discountTotalValue: 1000,
    })
    expect((await variantRow(v.id)).costPrice).toBe(27_000)
  })

  it('Điều chỉnh tồn biến thể đồng bộ tồn cha ngay', async () => {
    const parent = await createProduct(env, { withVariants: true, currentStock: 100 })
    const v1 = await createVariant(env, parent.id, { stockQuantity: 50 })
    await createVariant(env, parent.id, { stockQuantity: 50 })
    await recordManualAdjustment({
      db: env.db,
      actor: { userId: env.owner.id, storeId: env.storeId, role: 'owner' },
      productId: parent.id,
      input: { variantId: v1.id, delta: -5, reason: 'Hư hỏng' },
    })
    expect((await productRow(parent.id)).currentStock).toBe(95)
  })
})

describe('KHO-10: phiếu nhập theo đơn vị quy đổi', () => {
  it('Nhập 1 thùng (48 hộp) × 240.000 → tồn +48 hộp, giá vốn theo hộp', async () => {
    // Tái hiện w4: SV001 tồn 200 hộp, giá vốn 4.500, thùng = 48 hộp
    const p = await createProduct(env, {
      sku: 'SV001',
      unit: 'Hộp',
      currentStock: 200,
      costPrice: 4_500,
    })
    const thung = await createUnitConversion(env, p.id, { unit: 'Thùng', conversionFactor: 48 })

    const r = await postPO({
      items: [{ productId: p.id, unitConversionId: thung.id, quantity: 1, unitPrice: 240_000 }],
    })
    expect(r.status).toBe(201)
    const item = r.body.data.items[0]!
    expect(item.quantity).toBe(1)
    expect(item.unitName).toBe('Thùng')
    expect(item.conversionFactor).toBe(48)
    expect(item.baseQuantity).toBe(48)
    expect(item.lineTotal).toBe(240_000)
    // 240.000 / 48 = 5.000 một hộp
    expect(item.unitCost).toBe(5_000)
    // (200×4.500 + 240.000) / 248 = 4.596,77 → 4.597
    expect(item.costAfter).toBe(4_597)
    expect(item.stockAfter).toBe(248)

    const after = await productRow(p.id)
    expect(after.currentStock).toBe(248)
    expect(after.costPrice).toBe(4_597)

    const [ledger] = await ledgerRows(p.id, r.body.data.code)
    expect(ledger?.quantity).toBe(48)
    expect(ledger?.unitCost).toBe(5_000)
    expect(ledger?.stockAfter).toBe(248)

    const [poi] = await env.db
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.purchaseOrderId, r.body.data.id))
    expect(poi?.unitConversionId).toBe(thung.id)
    expect(poi?.unitNameSnapshot).toBe('Thùng')
    expect(poi?.conversionFactor).toBe(48)

    // Lịch sử nhập của sản phẩm theo đơn vị tính, khớp tồn sau nhập
    const history = await listProductPurchaseHistory({
      db: env.db,
      storeId: env.storeId,
      productId: p.id,
      query: { page: 1, pageSize: 20 },
    })
    expect(history.items[0]?.quantity).toBe(48)
    expect(history.items[0]?.unitPrice).toBe(5_000)
  })

  it('Đơn vị quy đổi của sản phẩm khác → 400', async () => {
    const p = await createProduct(env)
    const other = await createProduct(env)
    const conv = await createUnitConversion(env, other.id, { conversionFactor: 24 })
    const r = await postPO({
      items: [{ productId: p.id, unitConversionId: conv.id, quantity: 1, unitPrice: 1_000 }],
    })
    expect(r.status).toBe(400)
    expect((await productRow(p.id)).currentStock).toBe(100)
  })

  it('Biến thể nhập theo thùng: tồn biến thể và tồn cha tăng theo đơn vị tính', async () => {
    const parent = await createProduct(env, { withVariants: true, currentStock: 0 })
    const v = await createVariant(env, parent.id, { stockQuantity: 0, costPrice: null })
    const thung = await createUnitConversion(env, parent.id, {
      unit: 'Thùng',
      conversionFactor: 24,
    })
    const r = await postPO({
      items: [
        {
          productId: parent.id,
          variantId: v.id,
          unitConversionId: thung.id,
          quantity: 2,
          unitPrice: 240_000,
        },
      ],
    })
    expect(r.status).toBe(201)
    const vAfter = await variantRow(v.id)
    expect(vAfter.stockQuantity).toBe(48)
    expect(vAfter.costPrice).toBe(10_000)
    expect((await productRow(parent.id)).currentStock).toBe(48)
  })

  it('Số lượng quy ra đơn vị tính vượt giới hạn → 422, không đổi tồn', async () => {
    const p = await createProduct(env)
    const conv = await createUnitConversion(env, p.id, { conversionFactor: 100_000 })
    const r = await postPO({
      items: [{ productId: p.id, unitConversionId: conv.id, quantity: 11, unitPrice: 1_000 }],
    })
    expect(r.status).toBe(422)
    expect((await productRow(p.id)).currentStock).toBe(100)
  })
})

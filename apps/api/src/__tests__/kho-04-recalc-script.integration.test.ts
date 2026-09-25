import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  auditLogs,
  inventoryTransactions,
  products,
  purchaseOrderItems,
  purchaseOrders,
  suppliers,
} from '@kiotviet-lite/shared'

import { recalcInflatedPurchaseCosts } from '../services/purchase-cost-recalc.service.js'
import { createProduct, createVariant, resetFactorySeq } from './helpers/factories.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

let env: TestEnv
let supplierId: string
let clock = Date.parse('2026-09-01T02:00:00Z')
const tick = () => new Date((clock += 60_000))

beforeEach(async () => {
  resetFactorySeq()
  env = await createTestEnv()
  const [sup] = await env.db
    .insert(suppliers)
    .values({ storeId: env.storeId, name: 'NCC cũ', code: 'NCC-OLD' })
    .returning()
  supplierId = sup!.id
})

afterEach(async () => {
  await env.close()
})

interface OldLineInput {
  productId: string
  variantId?: string | null
  quantity: number
  unitPrice: number
  discountAmount?: number
  /** Kết quả mà mã cũ đã ghi */
  costAfter: number
  stockAfter: number
}

/** Ghi một phiếu nhập đúng như mã trước khi sửa KHO-04 đã ghi (unit_cost null, sổ ghi đơn giá niêm yết). */
async function insertOldPurchaseOrder(code: string, lines: OldLineInput[], discountTotal = 0) {
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice - (l.discountAmount ?? 0), 0)
  const at = tick()
  const [po] = await env.db
    .insert(purchaseOrders)
    .values({
      storeId: env.storeId,
      supplierId,
      code,
      subtotal,
      discountTotal,
      discountTotalType: 'amount',
      discountTotalValue: discountTotal,
      totalAmount: subtotal - discountTotal,
      paidAmount: 0,
      paymentStatus: 'unpaid',
      purchaseDate: at,
      createdBy: env.owner.id,
    })
    .returning()
  for (const l of lines) {
    await env.db.insert(purchaseOrderItems).values({
      purchaseOrderId: po!.id,
      productId: l.productId,
      variantId: l.variantId ?? null,
      productNameSnapshot: 'SP',
      productSkuSnapshot: 'SKU',
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountAmount: l.discountAmount ?? 0,
      lineTotal: l.quantity * l.unitPrice - (l.discountAmount ?? 0),
      costAfter: l.costAfter,
      stockAfter: l.stockAfter,
      createdAt: at,
    })
    await env.db.insert(inventoryTransactions).values({
      storeId: env.storeId,
      productId: l.productId,
      variantId: l.variantId ?? null,
      type: 'purchase',
      quantity: l.quantity,
      unitCost: l.unitPrice,
      costAfter: l.costAfter,
      stockAfter: l.stockAfter,
      note: code,
      createdBy: env.owner.id,
      createdAt: at,
    })
  }
}

async function insertSale(productId: string, quantity: number, stockAfter: number) {
  await env.db.insert(inventoryTransactions).values({
    storeId: env.storeId,
    productId,
    type: 'sale',
    quantity: -quantity,
    stockAfter,
    note: 'HD-TEST',
    createdBy: env.owner.id,
    createdAt: tick(),
  })
}

async function costOf(id: string) {
  const [row] = await env.db.select().from(products).where(eq(products.id, id))
  return row!
}

describe('Script tính lại giá vốn bị thổi (KHO-04, quyết định 7)', () => {
  it('Chạy thử chỉ báo cáo; --apply ghi giá vốn đúng và audit; chạy lại không báo nữa', async () => {
    // DN001: tồn 40 giá vốn 32.000, phiếu cũ 10 × 30.000 chiết khấu phiếu 30.000
    // Mã cũ ghi giá vốn 31.600 (đúng là 31.000), bán 20, rồi phiếu cũ không chiết khấu 20 × 31.000
    const p = await createProduct(env, { sku: 'DN001', currentStock: 30, costPrice: 31_600 })
    await insertOldPurchaseOrder(
      'PN-OLD-0001',
      [{ productId: p.id, quantity: 10, unitPrice: 30_000, costAfter: 31_600, stockAfter: 50 }],
      30_000,
    )
    await insertSale(p.id, 20, 30)
    // Mã cũ: (30×31.600 + 620.000) / 50 = 31.360; đúng: (30×31.000 + 620.000) / 50 = 31.000
    await insertOldPurchaseOrder('PN-OLD-0002', [
      { productId: p.id, quantity: 20, unitPrice: 31_000, costAfter: 31_360, stockAfter: 50 },
    ])
    await env.db
      .update(products)
      .set({ currentStock: 50, costPrice: 31_360 })
      .where(eq(products.id, p.id))

    const dry = await recalcInflatedPurchaseCosts({ db: env.db, storeId: env.storeId })
    expect(dry.apply).toBe(false)
    const row = dry.rows.find((r) => r.productId === p.id)!
    expect(row.status).toBe('fixable')
    expect(row.currentCost).toBe(31_360)
    expect(row.correctedCost).toBe(31_000)
    expect(row.diffPerUnit).toBe(360)
    expect(row.inflatedValue).toBe(18_000)
    expect(row.discountMissed).toBe(30_000)
    expect(row.affectedPurchaseOrders).toEqual(['PN-OLD-0001'])
    // Chạy thử không ghi gì
    expect((await costOf(p.id)).costPrice).toBe(31_360)

    const applied = await recalcInflatedPurchaseCosts({
      db: env.db,
      storeId: env.storeId,
      apply: true,
    })
    expect(applied.rows.find((r) => r.productId === p.id)?.applied).toBe(true)
    expect((await costOf(p.id)).costPrice).toBe(31_000)
    const audits = await env.db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, 'inventory.cost_recalculated'), eq(auditLogs.targetId, p.id)))
    expect(audits).toHaveLength(1)

    const again = await recalcInflatedPurchaseCosts({
      db: env.db,
      storeId: env.storeId,
      apply: true,
    })
    expect(again.rows.find((r) => r.productId === p.id)).toBeUndefined()
    expect((await costOf(p.id)).costPrice).toBe(31_000)
  })

  it('Chiết khấu dòng và phiếu nhiều dòng: phân bổ theo tỷ lệ; tồn về 0 rồi nhập lại thì chỉ còn phần lô mới', async () => {
    const a = await createProduct(env, { currentStock: 15, costPrice: 18_000 })
    const b = await createProduct(env, { currentStock: 5, costPrice: 20_000 })
    // Phiếu cũ: A 10 × 20.000 chiết khấu dòng 20.000 (thành tiền 180.000), B 5 × 20.000 (100.000)
    // Chiết khấu phiếu 28.000 → A 18.000, B 10.000. A bị bỏ 38.000, B bị bỏ 10.000
    await insertOldPurchaseOrder(
      'PN-OLD-0003',
      [
        {
          productId: a.id,
          quantity: 10,
          unitPrice: 20_000,
          discountAmount: 20_000,
          costAfter: 18_000,
          stockAfter: 10,
        },
        { productId: b.id, quantity: 5, unitPrice: 20_000, costAfter: 20_000, stockAfter: 5 },
      ],
      28_000,
    )
    // A bán hết rồi nhập lại theo phiếu cũ có chiết khấu dòng 15.000
    await insertSale(a.id, 10, 0)
    await insertOldPurchaseOrder('PN-OLD-0004', [
      {
        productId: a.id,
        quantity: 15,
        unitPrice: 18_000,
        discountAmount: 15_000,
        costAfter: 18_000,
        stockAfter: 15,
      },
    ])

    const res = await recalcInflatedPurchaseCosts({ db: env.db, storeId: env.storeId })
    const rowA = res.rows.find((r) => r.productId === a.id)!
    const rowB = res.rows.find((r) => r.productId === b.id)!
    // A: tồn trước 0 nên chỉ còn chiết khấu của lô cuối: 15.000 / 15 = 1.000
    expect(rowA.correctedCost).toBe(17_000)
    expect(rowA.discountMissed).toBe(38_000 + 15_000)
    // B: 10.000 / 5 = 2.000
    expect(rowB.correctedCost).toBe(18_000)
    expect(rowB.inflatedValue).toBe(10_000)
  })

  it('Giá vốn đã sửa tay sau lần nhập cuối → xem tay, --apply không ghi', async () => {
    const p = await createProduct(env, { currentStock: 10, costPrice: 25_000 })
    await insertOldPurchaseOrder(
      'PN-OLD-0005',
      [{ productId: p.id, quantity: 10, unitPrice: 30_000, costAfter: 30_000, stockAfter: 10 }],
      10_000,
    )
    const res = await recalcInflatedPurchaseCosts({
      db: env.db,
      storeId: env.storeId,
      apply: true,
    })
    const row = res.rows.find((r) => r.productId === p.id)!
    expect(row.status).toBe('manual_review')
    expect(row.applied).toBe(false)
    expect((await costOf(p.id)).costPrice).toBe(25_000)
  })

  it('Sản phẩm có biến thể: liệt kê xem tay, --apply đồng bộ tồn và giá vốn cha theo biến thể', async () => {
    const parent = await createProduct(env, {
      withVariants: true,
      currentStock: 100,
      costPrice: 14_545,
    })
    const lon = await createVariant(env, parent.id, { stockQuantity: 60, costPrice: 12_600 })
    await createVariant(env, parent.id, { stockQuantity: 50, costPrice: 11_900 })
    await insertOldPurchaseOrder('PN-OLD-0006', [
      {
        productId: parent.id,
        variantId: lon.id,
        quantity: 10,
        unitPrice: 30_000,
        costAfter: 14_545,
        stockAfter: 60,
      },
    ])

    const dry = await recalcInflatedPurchaseCosts({ db: env.db, storeId: env.storeId })
    expect(dry.rows.find((r) => r.productId === parent.id)?.status).toBe('variant_parent')
    expect((await costOf(parent.id)).currentStock).toBe(100)

    await recalcInflatedPurchaseCosts({ db: env.db, storeId: env.storeId, apply: true })
    const after = await costOf(parent.id)
    expect(after.currentStock).toBe(110)
    // (60×12.600 + 50×11.900) / 110 = 12.281,8 → 12.282
    expect(after.costPrice).toBe(12_282)
  })

  it('Phiếu lập theo quy tắc mới không bị tính lại', async () => {
    const p = await createProduct(env, { currentStock: 10, costPrice: 27_000 })
    await insertOldPurchaseOrder(
      'PN-NEW-0001',
      [{ productId: p.id, quantity: 10, unitPrice: 30_000, costAfter: 27_000, stockAfter: 10 }],
      30_000,
    )
    await env.db
      .update(purchaseOrderItems)
      .set({ unitCost: 27_000, orderDiscountAllocated: 30_000 })
      .where(eq(purchaseOrderItems.productId, p.id))
    const res = await recalcInflatedPurchaseCosts({ db: env.db, storeId: env.storeId })
    expect(res.rows).toHaveLength(0)
  })
})

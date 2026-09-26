import { asc, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { inventoryTransactions } from '@kiotviet-lite/shared'

import { createOrdersRoutes } from '../routes/orders.routes.js'
import { createProductsRoutes } from '../routes/products.routes.js'
import { createPurchaseOrdersRoutes } from '../routes/purchase-orders.routes.js'
import { createStockChecksRoutes } from '../routes/stock-checks.routes.js'
import { createSuppliersRoutes } from '../routes/suppliers.routes.js'
import { expectInvariantsClean, invariantViolations } from './helpers/invariants.js'
import { sell } from './helpers/sell.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

// POS-18: mọi dòng sổ kho mang tham chiếu chứng từ gốc (reference_type, reference_id). Migration
// 0060 điền dòng cũ từ ghi chú theo đúng cách các service từng ghi.

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

const __dirname = dirname(fileURLToPath(import.meta.url))
const BACKFILL_UPDATES = readFileSync(
  resolve(__dirname, '../db/migrations/0060_pos18_inventory_reference.sql'),
  'utf8',
)
  .split('--> statement-breakpoint')
  .map((stmt) =>
    stmt
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')
      .trim(),
  )
  .filter((stmt) => stmt.startsWith('UPDATE'))

let env: TestEnv
let app: Hono

beforeEach(async () => {
  env = await createTestEnv()
  app = new Hono()
  app.route('/orders', createOrdersRoutes({ db: env.db }))
  app.route('/products', createProductsRoutes({ db: env.db }))
  app.route('/purchase-orders', createPurchaseOrdersRoutes({ db: env.db }))
  app.route('/stock-checks', createStockChecksRoutes({ db: env.db }))
  app.route('/suppliers', createSuppliersRoutes({ db: env.db }))
})

afterEach(async () => {
  await expectInvariantsClean(env.db)
  await env.close()
})

interface Resp {
  status: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
}

async function call(method: string, path: string, body?: unknown): Promise<Resp> {
  const res = await app.request(path, {
    method,
    headers: { ...env.owner.authHeader, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  const parsed = { status: res.status, body: text ? JSON.parse(text) : undefined }
  expect(parsed.status, `${method} ${path}: ${text}`).toBeLessThan(300)
  return parsed
}

async function ledger() {
  return env.db
    .select({
      type: inventoryTransactions.type,
      referenceType: inventoryTransactions.referenceType,
      referenceId: inventoryTransactions.referenceId,
    })
    .from(inventoryTransactions)
    .orderBy(asc(inventoryTransactions.createdAt), asc(inventoryTransactions.id))
}

/** Chạy đủ các luồng ghi sổ kho, trả về id chứng từ từng luồng */
async function runAllFlows() {
  const product = (
    await call('POST', '/products', {
      name: 'Sữa Ensure',
      sku: 'ENS-01',
      sellingPrice: 100_000,
      costPrice: 60_000,
      unit: 'Hộp',
      trackInventory: true,
      initialStock: 50,
    })
  ).body.data as { id: string; name: string }
  await call('POST', `/products/${product.id}/inventory/purchase`, {
    quantity: 5,
    unitCost: 60_000,
  })
  await call('POST', `/products/${product.id}/inventory/adjust`, { delta: -2, reason: 'Vỡ' })

  const supplier = (await call('POST', '/suppliers', { name: 'Vinamilk' })).body.data as {
    id: string
  }
  const purchaseBody = {
    supplierId: supplier.id,
    items: [
      {
        productId: product.id,
        quantity: 10,
        unitPrice: 60_000,
        discountType: 'amount',
        discountValue: 0,
      },
    ],
  }
  const po = (await call('POST', '/purchase-orders', purchaseBody)).body.data as {
    id: string
    items: Array<{ id: string }>
  }
  const purchaseReturn = (
    await call('POST', `/purchase-orders/${po.id}/returns`, {
      items: [{ purchaseOrderItemId: po.items[0]!.id, quantity: 2 }],
    })
  ).body.data as { id: string }
  const cancelledPo = (await call('POST', '/purchase-orders', purchaseBody)).body.data as {
    id: string
  }
  await call('POST', `/purchase-orders/${cancelledPo.id}/cancel`, { reason: 'Nhập nhầm' })

  const cancelledOrder = await sell(env, [{ product, quantity: 3 }])
  await call('POST', `/orders/${cancelledOrder.id}/cancel`, { reason: 'Nhập nhầm' })
  const returnedOrder = await sell(env, [{ product, quantity: 4 }])
  const orderReturn = (
    await call('POST', `/orders/${returnedOrder.id}/returns`, {
      items: [{ orderItemId: returnedOrder.items[0]!.id, quantity: 1, reason: 'defective' }],
    })
  ).body.data as { id: string }

  const check = (
    await call('POST', '/stock-checks', { items: [{ productId: product.id, actualQty: 40 }] })
  ).body.data as { id: string }
  await call('POST', `/stock-checks/${check.id}/confirm`)

  return {
    product,
    po,
    purchaseReturn,
    cancelledPo,
    cancelledOrder,
    returnedOrder,
    orderReturn,
    check,
  }
}

describe('POS-18: tham chiếu chứng từ trên sổ kho', () => {
  it('mọi luồng ghi sổ kho đều mang đúng tham chiếu', async () => {
    const d = await runAllFlows()
    expect(await ledger()).toEqual([
      { type: 'initial_stock', referenceType: 'product', referenceId: d.product.id },
      { type: 'purchase', referenceType: 'manual', referenceId: null },
      { type: 'manual_adjustment', referenceType: 'manual', referenceId: null },
      { type: 'purchase', referenceType: 'purchase_order', referenceId: d.po.id },
      {
        type: 'purchase_return',
        referenceType: 'purchase_return',
        referenceId: d.purchaseReturn.id,
      },
      { type: 'purchase', referenceType: 'purchase_order', referenceId: d.cancelledPo.id },
      { type: 'purchase_cancel', referenceType: 'purchase_order', referenceId: d.cancelledPo.id },
      { type: 'sale', referenceType: 'order', referenceId: d.cancelledOrder.id },
      { type: 'order_cancel', referenceType: 'order', referenceId: d.cancelledOrder.id },
      { type: 'sale', referenceType: 'order', referenceId: d.returnedOrder.id },
      { type: 'return', referenceType: 'order_return', referenceId: d.orderReturn.id },
      { type: 'stock_check', referenceType: 'stock_check', referenceId: d.check.id },
    ])
  })

  it('ghi dòng chứng từ thiếu reference_id bị ràng buộc CHECK chặn', async () => {
    const d = await runAllFlows()
    await expect(
      env.db.insert(inventoryTransactions).values({
        storeId: env.storeId,
        productId: d.product.id,
        type: 'sale',
        quantity: 0,
        referenceType: 'order',
        referenceId: null,
        createdBy: env.owner.id,
      }),
    ).rejects.toThrow()
  })

  it('bất biến I10 bắt tham chiếu trỏ sai chứng từ', async () => {
    const d = await runAllFlows()
    await env.db.execute(
      sql`UPDATE inventory_transactions SET reference_id = ${d.po.id} WHERE type = 'return'`,
    )
    const violations = await invariantViolations(env.db)
    expect(violations.map((v) => v.check_name)).toEqual(['I10_inventory_reference'])
    await env.db.execute(
      sql`UPDATE inventory_transactions SET reference_id = ${d.orderReturn.id} WHERE type = 'return'`,
    )
  })

  it('migration điền lại tham chiếu dòng cũ từ ghi chú, dòng không khớp theo loại dòng', async () => {
    const d = await runAllFlows()
    // Đơn bán đồng bộ offline ghi chú "<mã đơn> (offline sync)"
    await env.db.execute(
      sql`UPDATE inventory_transactions SET note = note || ' (offline sync)'
          WHERE type = 'sale' AND reference_id = ${d.returnedOrder.id}`,
    )
    // Dòng cũ có ghi chú không khớp chứng từ nào: rơi vào CASE dự phòng
    const at = Date.now() + 60_000
    const orphans = [
      { type: 'sale', note: 'HD-MAT-GHI-CHU' },
      { type: 'return', note: 'TH-MAT-GHI-CHU' },
      { type: 'purchase_cancel', note: 'Hủy PN-MAT' },
      { type: 'purchase', note: 'Nhập thêm hàng biếu' },
    ] as const
    for (const [i, o] of orphans.entries()) {
      await env.db.insert(inventoryTransactions).values({
        storeId: env.storeId,
        productId: d.product.id,
        type: o.type,
        quantity: 0,
        note: o.note,
        referenceType: 'manual',
        referenceId: null,
        createdBy: env.owner.id,
        createdAt: new Date(at + i * 1000),
      })
    }
    const expected = [
      ...(await ledger()).slice(0, -orphans.length),
      { type: 'sale', referenceType: 'order', referenceId: null },
      { type: 'return', referenceType: 'order_return', referenceId: null },
      { type: 'purchase_cancel', referenceType: 'purchase_order', referenceId: null },
      // Nhập tay cũng là loại 'purchase' ghi chú tự do nên dòng không khớp phiếu là manual
      { type: 'purchase', referenceType: 'manual', referenceId: null },
    ]
    expect(BACKFILL_UPDATES.length).toBe(9)

    // Đưa bảng về trạng thái lúc migration chạy: cột mới cho phép NULL, chưa có CHECK
    await env.db.execute(
      sql`ALTER TABLE inventory_transactions DROP CONSTRAINT chk_inventory_tx_reference_id`,
    )
    await env.db.execute(
      sql`ALTER TABLE inventory_transactions ALTER COLUMN reference_type DROP NOT NULL`,
    )
    await env.db.execute(
      sql`UPDATE inventory_transactions SET reference_type = NULL, reference_id = NULL`,
    )
    for (const stmt of BACKFILL_UPDATES) await env.db.execute(sql.raw(stmt))

    expect(await ledger()).toEqual(expected)
  })
})

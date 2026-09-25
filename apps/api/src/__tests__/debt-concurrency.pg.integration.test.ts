import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  type CreateOrderInput,
  customers,
  debts,
  orderItems,
  orders,
  products,
  stores,
  users,
} from '@kiotviet-lite/shared'
import * as schema from '@kiotviet-lite/shared/schema'

import type { Db } from '../db/index.js'
import { createOrder } from '../services/orders.service.js'
import { createReceipt } from '../services/receipts.service.js'
import { createReturn } from '../services/returns.service.js'
import { expectDebtLedgerConsistent } from './helpers/debt-ledger.js'

/**
 * TIEN-103 cần nhiều kết nối thật chạy song song, PGlite chỉ có một kết nối nên không tái hiện
 * được deadlock. Test chạy khi có `TEST_PG_URL` (Postgres dùng riêng cho test, cần quyền
 * CREATE DATABASE); mỗi lần chạy tạo một database tạm rồi xoá.
 */
const adminUrl = process.env.TEST_PG_URL
const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(__dirname, '../db/migrations')

const UNIT_PRICE = 3_500

describe.skipIf(!adminUrl)('TIEN-103: thứ tự khóa công nợ trên Postgres thật', () => {
  const dbName = `kvl_tien103_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
  let admin: postgres.Sql
  let client: postgres.Sql
  let db: Db
  let seq = 0

  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 1, onnotice: () => {} })
    await admin.unsafe(`CREATE DATABASE ${dbName}`)
    const url = new URL(adminUrl!)
    url.pathname = `/${dbName}`
    client = postgres(url.toString(), { max: 20, onnotice: () => {} })
    db = drizzle(client, { schema, casing: 'snake_case' }) as unknown as Db
    await migrate(db, { migrationsFolder })
  })

  afterAll(async () => {
    await client?.end()
    await admin?.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`)
    await admin?.end()
  })

  /** Cửa hàng riêng cho mỗi test: một khách đang nợ một đơn 200 gói, sản phẩm tồn 50. */
  async function seedDebtOrder() {
    const n = ++seq
    const [store] = await db
      .insert(stores)
      .values({ name: `Cửa hàng ${n}` })
      .returning()
    const [owner, manager] = await db
      .insert(users)
      .values([
        {
          storeId: store!.id,
          name: 'Chủ',
          phone: `09010${n}0001`,
          passwordHash: 'x',
          role: 'owner',
        },
        {
          storeId: store!.id,
          name: 'QL',
          phone: `09010${n}0002`,
          passwordHash: 'x',
          role: 'manager',
        },
      ])
      .returning()
    const [customer] = await db
      .insert(customers)
      .values({
        storeId: store!.id,
        code: 'KH000010',
        name: 'Khách nợ',
        currentDebt: 700_000,
        // ADR-0009: khách không có hạn mức thì không được nợ thêm
        debtUnlimited: true,
      })
      .returning()
    const [product] = await db
      .insert(products)
      .values({
        storeId: store!.id,
        name: 'Mì M3001',
        sku: `M3001-${n}`,
        unit: 'gói',
        sellingPrice: UNIT_PRICE,
        costPrice: 2_000,
        currentStock: 50,
        trackInventory: true,
      })
      .returning()
    const [order] = await db
      .insert(orders)
      .values({
        storeId: store!.id,
        orderNumber: 'HD-260925-0003',
        customerId: customer!.id,
        userId: owner!.id,
        subtotal: 700_000,
        discountAmount: 0,
        total: 700_000,
        paymentMethod: 'debt',
        paymentStatus: 'unpaid',
        cashAmount: 0,
        change: 0,
        status: 'completed',
      })
      .returning()
    const [item] = await db
      .insert(orderItems)
      .values({
        orderId: order!.id,
        productId: product!.id,
        productName: 'Mì M3001',
        unit: 'gói',
        unitPrice: UNIT_PRICE,
        quantity: 200,
        discountAmount: 0,
        lineTotal: 700_000,
      })
      .returning()
    const [debt] = await db
      .insert(debts)
      .values({
        storeId: store!.id,
        orderId: order!.id,
        customerId: customer!.id,
        amount: 700_000,
        remaining: 700_000,
      })
      .returning()
    return {
      store: store!,
      owner: owner!,
      manager: manager!,
      customer: customer!,
      product: product!,
      order: order!,
      item: item!,
      debt: debt!,
    }
  }

  function returnOne(s: Awaited<ReturnType<typeof seedDebtOrder>>) {
    return createReturn({
      db,
      actor: { userId: s.manager.id, storeId: s.store.id, role: 'manager' },
      orderId: s.order.id,
      input: { items: [{ orderItemId: s.item.id, quantity: 1, reason: 'defective' }], note: null },
    })
  }

  function rejectedReasons(results: PromiseSettledResult<unknown>[]) {
    return results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => `${String(r.reason)} | ${String((r.reason as { cause?: unknown }).cause ?? '')}`)
  }

  it('15 cặp phiếu thu 1.000 và trả 1 gói chạy cùng lúc: không deadlock, công nợ khớp', async () => {
    const s = await seedDebtOrder()
    const pairs = Array.from({ length: 15 }, () => [
      createReceipt({
        db,
        actor: { userId: s.owner.id, storeId: s.store.id, role: 'owner' },
        input: {
          customerId: s.customer.id,
          amount: 1_000,
          allocationMode: 'fifo',
          allocations: [{ debtId: s.debt.id, amount: 1_000 }],
        },
      }),
      returnOne(s),
    ]).flat()

    expect(rejectedReasons(await Promise.allSettled(pairs))).toEqual([])

    const [after] = await db.select().from(debts).where(eq(debts.id, s.debt.id))
    // 15 phiếu thu × 1.000 + 15 phiếu trả × 3.500 cấn nợ
    expect(after).toMatchObject({ paid: 15_000, reduced: 52_500, remaining: 632_500 })
    await expectDebtLedgerConsistent(db, s.store.id)
  })

  it('20 đơn bán ghi nợ đan xen 20 phiếu trả cùng khách, cùng sản phẩm: không deadlock, kho và nợ khớp', async () => {
    const s = await seedDebtOrder()
    const saleInput = {
      customerId: s.customer.id,
      subtotal: UNIT_PRICE,
      discountType: null,
      discountValue: 0,
      discountAmount: 0,
      total: UNIT_PRICE,
      paymentMethod: 'debt',
      paymentStatus: 'unpaid',
      debtAmount: UNIT_PRICE,
      debtLimitOverridden: false,
      note: null,
      items: [
        {
          productId: s.product.id,
          variantId: null,
          productName: 'Mì M3001',
          variantName: null,
          unit: 'gói',
          unitPrice: UNIT_PRICE,
          quantity: 1,
          discountType: null,
          discountValue: 0,
          discountAmount: 0,
          lineTotal: UNIT_PRICE,
          note: null,
          unitConversionId: null,
          originalPrice: null,
          priceOverride: false,
          priceOverrideReason: null,
          priceOverridePinUsed: false,
        },
      ],
    } as CreateOrderInput

    // OFF-08 (R4): mã đơn cấp từ bộ đếm nên đơn bán chạy song song được, đan xen với phiếu trả
    const ROUNDS = 20
    const actor = { userId: s.owner.id, storeId: s.store.id, role: 'owner' as const }
    const pairs = Array.from({ length: ROUNDS }, () => [
      createOrder({ db, actor, input: saleInput }),
      returnOne(s),
    ]).flat()

    expect(rejectedReasons(await Promise.allSettled(pairs))).toEqual([])

    const [customer] = await db.select().from(customers).where(eq(customers.id, s.customer.id))
    // +20 đơn nợ 3.500, -20 phiếu trả cấn 3.500 vào đơn cũ
    expect(Number(customer!.currentDebt)).toBe(700_000)
    const [product] = await db.select().from(products).where(eq(products.id, s.product.id))
    expect(Number(product!.currentStock)).toBe(50)
    await expectDebtLedgerConsistent(db, s.store.id)
  })
})

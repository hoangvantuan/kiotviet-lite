import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
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
import { createReceipt } from '../services/receipts.service.js'
import { createReturn } from '../services/returns.service.js'
import { expectDebtLedgerConsistent } from './helpers/debt-ledger.js'

/**
 * TIEN-103 cần hai kết nối thật chạy song song, PGlite chỉ có một kết nối nên không tái hiện
 * được deadlock. Test chạy khi có `TEST_PG_URL` (Postgres dùng riêng cho test, cần quyền
 * CREATE DATABASE); mỗi lần chạy tạo một database tạm rồi xoá.
 */
const adminUrl = process.env.TEST_PG_URL
const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(__dirname, '../db/migrations')

describe.skipIf(!adminUrl)('TIEN-103: phiếu thu và trả hàng đồng thời trên Postgres thật', () => {
  const dbName = `kvl_tien103_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
  let admin: postgres.Sql
  let client: postgres.Sql
  let db: Db

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

  it('15 cặp phiếu thu 1.000 và trả 1 gói chạy cùng lúc: không deadlock, công nợ khớp', async () => {
    const [store] = await db.insert(stores).values({ name: 'Cửa hàng' }).returning()
    const [owner, manager] = await db
      .insert(users)
      .values([
        { storeId: store!.id, name: 'Chủ', phone: '0901000001', passwordHash: 'x', role: 'owner' },
        { storeId: store!.id, name: 'QL', phone: '0901000002', passwordHash: 'x', role: 'manager' },
      ])
      .returning()
    const [customer] = await db
      .insert(customers)
      .values({ storeId: store!.id, code: 'KH000010', name: 'Khách nợ', currentDebt: 700_000 })
      .returning()
    const [product] = await db
      .insert(products)
      .values({
        storeId: store!.id,
        name: 'Mì M3001',
        sku: 'M3001',
        unit: 'gói',
        sellingPrice: 3_500,
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
        unitPrice: 3_500,
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

    const pairs = Array.from({ length: 15 }, () => [
      createReceipt({
        db,
        actor: { userId: owner!.id, storeId: store!.id, role: 'owner' },
        input: {
          customerId: customer!.id,
          amount: 1_000,
          allocationMode: 'fifo',
          allocations: [{ debtId: debt!.id, amount: 1_000 }],
        },
      }),
      createReturn({
        db,
        actor: { userId: manager!.id, storeId: store!.id, role: 'manager' },
        orderId: order!.id,
        input: { items: [{ orderItemId: item!.id, quantity: 1, reason: 'defective' }], note: null },
      }),
    ]).flat()

    const results = await Promise.allSettled(pairs)
    const failures = results.filter((r) => r.status === 'rejected')
    expect(failures.map((f) => String((f as PromiseRejectedResult).reason))).toEqual([])

    const [after] = await db.select().from(debts).where(eq(debts.id, debt!.id))
    // 15 phiếu thu × 1.000 + 15 phiếu trả × 3.500 cấn nợ
    expect(after).toMatchObject({ paid: 15_000, reduced: 52_500, remaining: 632_500 })
    await expectDebtLedgerConsistent(db, store!.id)
  })
})

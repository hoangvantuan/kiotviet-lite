import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { type CreateOrderInput, customers, orders, products, stores, users } from '@kiotviet-lite/shared'
import * as schema from '@kiotviet-lite/shared/schema'

import type { Db } from '../db/index.js'
import { createOrder } from '../services/orders.service.js'
import { expectDebtLedgerConsistent } from './helpers/debt-ledger.js'

// Sự kiện thông báo chạy kiểu fire-and-forget, không để nó chạm DB đã xoá lúc dọn test
vi.mock('@kiotviet-lite/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kiotviet-lite/notifications')>()),
  notify: vi.fn(async () => []),
}))

/**
 * ADR-0009: hạn mức nợ phải đứng vững khi hai đơn ghi nợ cùng một khách chạy song song. PGlite chỉ
 * có một kết nối nên không tái hiện được; test chạy khi có `TEST_PG_URL` như
 * debt-concurrency.pg.integration.test.ts, mỗi lần chạy tạo một database tạm rồi xoá.
 */
const adminUrl = process.env.TEST_PG_URL
const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(__dirname, '../db/migrations')

const PRICE = 300_000
const LIMIT = 500_000

describe.skipIf(!adminUrl)('ADR-0009: hai đơn ghi nợ cùng khách chạy song song trên Postgres thật', () => {
  const dbName = `kvl_debtlimit_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
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

  async function seed() {
    const n = ++seq
    const [store] = await db
      .insert(stores)
      .values({ name: `Cửa hàng ${n}` })
      .returning()
    const [staff] = await db
      .insert(users)
      .values({
        storeId: store!.id,
        name: 'NV',
        phone: `09020${n}0001`,
        passwordHash: 'x',
        role: 'staff',
      })
      .returning()
    const [customer] = await db
      .insert(customers)
      .values({ storeId: store!.id, code: 'KH000001', name: 'Khách nợ', debtLimit: LIMIT })
      .returning()
    const [product] = await db
      .insert(products)
      .values({
        storeId: store!.id,
        name: 'Sữa',
        sku: `SUA-${n}`,
        unit: 'hộp',
        sellingPrice: PRICE,
        costPrice: 200_000,
        currentStock: 50,
        trackInventory: true,
      })
      .returning()
    const actor = { userId: staff!.id, storeId: store!.id, role: 'staff' as const }
    const input = {
      customerId: customer!.id,
      subtotal: PRICE,
      discountType: null,
      discountValue: 0,
      discountAmount: 0,
      total: PRICE,
      paymentMethod: 'debt',
      paymentStatus: 'unpaid',
      cashAmount: 0,
      debtAmount: PRICE,
      debtLimitOverridden: false,
      note: null,
      items: [
        {
          productId: product!.id,
          variantId: null,
          productName: 'Sữa',
          variantName: null,
          unit: 'hộp',
          unitPrice: PRICE,
          quantity: 1,
          discountType: null,
          discountValue: 0,
          discountAmount: 0,
          lineTotal: PRICE,
          note: null,
          unitConversionId: null,
          originalPrice: null,
          priceOverride: false,
          priceOverrideReason: null,
          priceOverridePinUsed: false,
        },
      ],
    } as CreateOrderInput
    return { store: store!, customer: customer!, actor, input }
  }

  async function debtOf(customerId: string) {
    const [row] = await db.select().from(customers).where(eq(customers.id, customerId))
    return Number(row!.currentDebt)
  }

  it('tại quầy: hai đơn 300.000 cùng lúc với hạn mức 500.000, chỉ một đơn qua', async () => {
    const s = await seed()
    const results = await Promise.allSettled([
      createOrder({ db, actor: s.actor, input: s.input }),
      createOrder({ db, actor: s.actor, input: s.input }),
    ])
    const ok = results.filter((r) => r.status === 'fulfilled')
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    expect(ok).toHaveLength(1)
    expect(failed).toHaveLength(1)
    expect((failed[0]!.reason as { code?: string }).code).toBe('BUSINESS_RULE_VIOLATION')
    expect(await debtOf(s.customer.id)).toBe(PRICE)
    await expectDebtLedgerConsistent(db, s.store.id)
  })

  it('ngoại tuyến: hai đơn cùng lúc đều được nhận, đúng một đơn chờ duyệt vì vượt hạn mức', async () => {
    const s = await seed()
    const offline = (clientId: string) =>
      createOrder({
        db,
        actor: s.actor,
        input: s.input,
        source: 'offline_sync',
        clientId,
        offlineCreatedAt: new Date(),
      })
    const results = await Promise.allSettled([
      offline('cccccccc-2222-4444-8888-000000000001'),
      offline('cccccccc-2222-4444-8888-000000000002'),
    ])
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
    expect(await debtOf(s.customer.id)).toBe(PRICE * 2)
    const rows = await db.select().from(orders).where(eq(orders.customerId, s.customer.id))
    expect(rows.map((r) => r.reviewStatus).sort()).toEqual(['none', 'pending_review'])
    await expectDebtLedgerConsistent(db, s.store.id)
  })
})

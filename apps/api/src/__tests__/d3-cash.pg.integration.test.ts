import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  cashShifts,
  customers,
  orders,
  products,
  receipts,
  stores,
  suppliers,
  users,
} from '@kiotviet-lite/shared'
import * as schema from '@kiotviet-lite/shared/schema'

import type { Db } from '../db/index.js'
import { signAccessToken } from '../lib/jwt.js'
import { createPosRoutes } from '../routes/pos.routes.js'
import { createReceiptsRoutes } from '../routes/receipts.routes.js'
import { createShiftsRoutes } from '../routes/shifts.routes.js'
import { computeShiftSummary } from '../services/shifts.service.js'

/**
 * TIEN-109, POS-06 cần nhiều kết nối thật chạy song song (PGlite chỉ có một kết nối): mã phiếu
 * thu cấp song song không trùng, mở ca trùng bị chỉ mục unique chặn, đóng ca không sót đơn đang
 * ghi. Chạy khi có `TEST_PG_URL` (Postgres riêng cho test, cần quyền CREATE DATABASE).
 */
const adminUrl = process.env.TEST_PG_URL
const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(__dirname, '../db/migrations')

const PARALLEL = 5

describe.skipIf(!adminUrl)(
  'TIEN-109, POS-06: phiếu thu và ca bán hàng song song trên Postgres thật',
  () => {
    const dbName = `kvl_d3cash_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
    let admin: postgres.Sql
    let client: postgres.Sql
    let db: Db
    let seq = 0

    beforeAll(async () => {
      process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
      process.env.ACCESS_TOKEN_TTL_SECONDS = '900'
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

    /** Cửa hàng riêng cho mỗi test: chủ cửa hàng, một sản phẩm tồn 100, một nhà cung cấp đang nợ. */
    async function seedStore() {
      const n = ++seq
      const [store] = await db
        .insert(stores)
        .values({ name: `Cửa hàng D3 ${n}` })
        .returning()
      const [owner] = await db
        .insert(users)
        .values({
          storeId: store!.id,
          name: 'Chủ',
          phone: `09050${n}0001`,
          passwordHash: 'x',
          role: 'owner',
        })
        .returning()
      const [product] = await db
        .insert(products)
        .values({
          storeId: store!.id,
          name: 'Mì D3',
          sku: `D3-${n}`,
          unit: 'gói',
          sellingPrice: 10_000,
          costPrice: 6_000,
          currentStock: 100,
          trackInventory: true,
        })
        .returning()
      const [supplier] = await db
        .insert(suppliers)
        .values({ storeId: store!.id, code: `NCC-D3-${n}`, name: 'NCC D3', currentDebt: 1_000_000 })
        .returning()
      const token = signAccessToken({ userId: owner!.id, storeId: store!.id, role: 'owner' })
      return { store: store!, owner: owner!, product: product!, supplier: supplier!, token }
    }

    type Seed = Awaited<ReturnType<typeof seedStore>>

    function post(
      s: Seed,
      app: { request: (path: string, init?: RequestInit) => Response | Promise<Response> },
      path: string,
      body: unknown,
      key?: string,
    ) {
      return Promise.resolve(
        app.request(path, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${s.token}`,
            ...(key ? { 'Idempotency-Key': key } : {}),
          },
          body: JSON.stringify(body),
        }),
      )
    }

    function orderPayload(s: Seed, extra: Record<string, unknown> = {}) {
      return {
        subtotal: 10_000,
        discountAmount: 0,
        total: 10_000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashAmount: 10_000,
        items: [
          {
            productId: s.product.id,
            productName: 'Mì D3',
            unit: 'gói',
            unitPrice: 10_000,
            quantity: 1,
            discountAmount: 0,
            lineTotal: 10_000,
          },
        ],
        ...extra,
      }
    }

    async function statuses(responses: Response[]) {
      return Promise.all(
        responses.map(async (r) => (r.status === 201 ? 201 : `${r.status} ${await r.text()}`)),
      )
    }

    it(`${PARALLEL} phiếu thu lập cùng lúc cho các khách khác nhau: mã PT không trùng, liên tục`, async () => {
      const s = await seedStore()
      const pos = createPosRoutes({ db })
      const app = createReceiptsRoutes({ db })

      const debtIds: Array<{ customerId: string; debtId: string }> = []
      for (let i = 0; i < PARALLEL; i++) {
        const [customer] = await db
          .insert(customers)
          .values({
            storeId: s.store.id,
            code: `KH-D3-${seq}-${i}`,
            name: `Khách ${i}`,
            debtLimit: 1_000_000,
          })
          .returning()
        const res = await post(
          s,
          pos,
          '/orders',
          orderPayload(s, {
            customerId: customer!.id,
            paymentMethod: 'debt',
            paymentStatus: 'unpaid',
            cashAmount: undefined,
            debtAmount: 10_000,
          }),
        )
        expect(res.status, await res.clone().text()).toBe(201)
        const debts = await app.request(`/customer-debts/${customer!.id}`, {
          headers: { Authorization: `Bearer ${s.token}` },
        })
        const body = (await debts.json()) as { data: { items: Array<{ id: string }> } }
        debtIds.push({ customerId: customer!.id, debtId: body.data.items[0]!.id })
      }

      const responses = await Promise.all(
        debtIds.map(({ customerId, debtId }) =>
          post(
            s,
            app,
            '/',
            {
              customerId,
              amount: 10_000,
              paymentMethod: 'cash',
              allocationMode: 'manual',
              allocations: [{ debtId, amount: 10_000 }],
            },
            randomUUID(),
          ),
        ),
      )

      expect(await statuses(responses)).toEqual(Array(PARALLEL).fill(201))
      const rows = await db.select().from(receipts).where(eq(receipts.storeId, s.store.id))
      const codes = rows.map((r) => r.code).sort()
      expect(new Set(codes).size).toBe(PARALLEL)
      expect(codes.map((c) => c.slice(-4))).toEqual(['0001', '0002', '0003', '0004', '0005'])
      expect(codes.every((c) => /^PT-\d{6}-\d{4}$/.test(c))).toBe(true)
    })

    it(`${PARALLEL} lần mở ca cùng lúc của một người: đúng một ca được mở`, async () => {
      const s = await seedStore()
      const app = createShiftsRoutes({ db })

      const responses = await Promise.all(
        Array.from({ length: PARALLEL }, () =>
          post(s, app, '/open', { openingCash: 100_000 }, randomUUID()),
        ),
      )

      const codes = responses.map((r) => r.status).sort()
      expect(codes).toEqual([201, ...Array(PARALLEL - 1).fill(409)])
      const open = await db.select().from(cashShifts).where(eq(cashShifts.storeId, s.store.id))
      expect(open).toHaveLength(1)
    })

    it('đóng ca trong lúc đang bán: số chụp lúc đóng không sót đơn đã gắn vào ca', async () => {
      const s = await seedStore()
      await db.update(stores).set({ shiftsEnabled: true }).where(eq(stores.id, s.store.id))
      const shifts = createShiftsRoutes({ db })
      const pos = createPosRoutes({ db })

      const opened = await post(s, shifts, '/open', { openingCash: 0 }, randomUUID())
      const shiftId = ((await opened.json()) as { data: { id: string } }).data.id

      const sales = Array.from({ length: PARALLEL * 2 }, () =>
        post(s, pos, '/orders', orderPayload(s), randomUUID()),
      )
      const close = post(s, shifts, `/${shiftId}/close`, { countedCash: 0 }, randomUUID())
      const [closeRes, ...saleRes] = await Promise.all([close, ...sales])
      expect(closeRes.status, await closeRes.clone().text()).toBe(200)

      // Đơn bán sau lúc đóng ca bị chặn (chưa mở ca), không lọt vào ca đã đóng
      for (const r of saleRes) {
        if (r.status !== 201) {
          const body = (await r.json()) as { error: { details: { reason: string } } }
          expect(body.error.details.reason).toBe('shift_required')
        }
      }
      const [shift] = await db.select().from(cashShifts).where(eq(cashShifts.id, shiftId))
      const attached = await db.select().from(orders).where(eq(orders.shiftId, shiftId))
      const recomputed = await computeShiftSummary(db, shift!)
      expect(shift!.closeSummary).toEqual(recomputed)
      expect(shift!.closeSummary!.orderCount).toBe(attached.length)
      expect(shift!.expectedCash).toBe(attached.length * 10_000)
      expect(saleRes.filter((r) => r.status === 201)).toHaveLength(attached.length)
    })
  },
)

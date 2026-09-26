import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { CreateOrderInput } from '@kiotviet-lite/shared'
import { pgliteMigrations } from '@kiotviet-lite/shared/migrations/pglite'

import { saveOfflineOrder } from './offline-orders'
import { runPGliteMigrations } from './pglite-migrations'

const OWNER = { storeId: 'store-1', userId: 'user-1' }

const order = {
  subtotal: 10_000,
  discountAmount: 0,
  total: 10_000,
  paymentMethod: 'cash',
  paymentStatus: 'paid',
  cashAmount: 10_000,
  items: [
    {
      productId: '0199aa00-0000-7000-8000-000000000001',
      productName: 'Mì',
      unit: 'gói',
      unitPrice: 10_000,
      quantity: 1,
      discountAmount: 0,
      lineTotal: 10_000,
    },
  ],
} as CreateOrderInput

describe('R4 OFF-07: hàng chờ ngoại tuyến dùng clientId của lần bán', () => {
  let pglite: PGlite

  beforeEach(async () => {
    pglite = new PGlite()
    await runPGliteMigrations(pglite, pgliteMigrations)
  })

  afterEach(async () => {
    await pglite.close()
  })

  it('lưu đúng clientId được cấp, không tự sinh clientId mới', async () => {
    const clientId = crypto.randomUUID()

    const saved = await saveOfflineOrder(pglite, OWNER, { ...order, clientId }, clientId)

    expect(saved).toBe(clientId)
    const rows = await pglite.query<{ client_id: string }>('SELECT client_id FROM offline_orders')
    expect(rows.rows).toEqual([{ client_id: clientId }])
  })

  it('lưu lại cùng clientId không thêm dòng thứ hai', async () => {
    const clientId = crypto.randomUUID()

    await saveOfflineOrder(pglite, OWNER, { ...order, clientId }, clientId)
    await saveOfflineOrder(pglite, OWNER, { ...order, clientId }, clientId)

    const rows = await pglite.query('SELECT client_id FROM offline_orders')
    expect(rows.rows).toHaveLength(1)
  })
})

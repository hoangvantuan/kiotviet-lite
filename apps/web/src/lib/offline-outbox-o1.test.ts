import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type CreateOrderInput, SYNC_PUSH_MAX_BATCH } from '@kiotviet-lite/shared'
import { type PGliteMigration, pgliteMigrations } from '@kiotviet-lite/shared/migrations/pglite'

import { useAuthStore } from '@/stores/use-auth-store'
import { useOfflineStore } from '@/stores/use-offline-store'

import {
  getErrorOrders,
  getOfflineOrder,
  getOrderCounts,
  getPendingOrders,
  markOrderFailed,
  markOrderSynced,
  offlineOrderNumber,
  saveOfflineOrder,
  scheduleOrderRetry,
} from './offline-orders'
import {
  clearOfflineStoreData,
  OFFLINE_STORE_TABLES,
  registerOfflineStoreTable,
} from './offline-store-data'
import { pushPendingOrders } from './order-sync'
import { runPGliteMigrations } from './pglite-migrations'

const STORE_A = '0199aa00-0000-7000-8000-00000000000a'
const STORE_B = '0199aa00-0000-7000-8000-00000000000b'
const SELLER_1 = '0199aa00-0000-7000-8000-000000000101'
const SELLER_2 = '0199aa00-0000-7000-8000-000000000102'
const SELLER_B = '0199aa00-0000-7000-8000-000000000201'

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

function signIn(storeId: string, userId: string, accessToken: string | null = 'token') {
  useAuthStore.setState({
    accessToken,
    user: { id: userId, storeId, name: 'Thu ngân', phone: null, role: 'staff' },
  })
}

async function sell(pglite: PGlite, storeId: string, userId: string, extra: object = {}) {
  const clientId = crypto.randomUUID()
  await saveOfflineOrder(pglite, { storeId, userId }, { ...order, ...extra, clientId }, clientId)
  return clientId
}

interface PushedOrder {
  clientId: string
  sellerUserId?: string
  createdAt: string
}

/** Máy chủ giả cho /sync/push: ghi lại từng lô, trả kết quả theo hàm `decide` */
function fakeSyncServer(
  decide: (o: PushedOrder, index: number) => object = (o, i) => ({
    clientId: o.clientId,
    status: 'synced',
    serverId: crypto.randomUUID(),
    orderNumber: `HD-260926-${i + 1}`,
  }),
) {
  const batches: PushedOrder[][] = []
  let seen = 0
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { orders: PushedOrder[] }
    batches.push(body.orders)
    const results = body.orders.map((o) => decide(o, seen++))
    return new Response(JSON.stringify({ data: { results, syncedAt: new Date().toISOString() } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { batches, fetchMock }
}

let pglite: PGlite

beforeEach(async () => {
  vi.stubGlobal('navigator', { onLine: true })
  pglite = new PGlite()
  await runPGliteMigrations(pglite, pgliteMigrations)
  useOfflineStore.setState({
    status: 'online',
    connectivity: 'online',
    pendingOrderCount: 0,
    errorOrderCount: 0,
    otherStoreOrderCount: 0,
    errorMessage: null,
    reviewPendingOrders: [],
  })
  signIn(STORE_A, SELLER_1)
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await pglite.close()
})

describe('runPGliteMigrations: máy mới và máy đang có đơn chờ', () => {
  it('DB mới chạy đủ v001 tới bản mới nhất, có cột người bán và lịch thử lại', async () => {
    const fresh = new PGlite()
    const result = await runPGliteMigrations(fresh, pgliteMigrations)
    const versions = await fresh.query<{ version: number }>(
      'SELECT version FROM schema_version WHERE version > 0 ORDER BY version',
    )
    const cols = await fresh.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'offline_orders'`,
    )
    await fresh.close()

    expect(result).toEqual({ success: true, needsResync: false })
    expect(versions.rows.map((r) => r.version)).toEqual(pgliteMigrations.map((m) => m.version))
    expect(cols.rows.map((r) => r.column_name)).toEqual(
      expect.arrayContaining(['user_id', 'error_code', 'next_retry_at', 'server_order_number']),
    )
  })

  it('DB bản v2 còn đơn chờ kèm PIN: lên v3 giữ đơn, xóa PIN (OFF-13)', async () => {
    const old = new PGlite()
    await runPGliteMigrations(
      old,
      pgliteMigrations.filter((m) => m.version <= 2),
    )
    const pinOrder = { ...order, debtLimitOverridden: true, debtLimitOverridePin: '123456' }
    await old.query(
      `INSERT INTO offline_orders (store_id, client_id, sync_status, order_data)
       VALUES ($1, $2, 'pending', $3)`,
      [STORE_A, 'c-old', JSON.stringify(pinOrder)],
    )

    await runPGliteMigrations(old, pgliteMigrations)
    const row = await old.query<{ order_data: Record<string, unknown>; user_id: string | null }>(
      `SELECT order_data, user_id FROM offline_orders WHERE client_id = 'c-old'`,
    )
    await old.close()

    expect(row.rows).toHaveLength(1)
    expect(row.rows[0]!.user_id).toBeNull()
    expect(row.rows[0]!.order_data).not.toHaveProperty('debtLimitOverridePin')
    expect(row.rows[0]!.order_data.debtLimitOverridden).toBe(false)
    expect(row.rows[0]!.order_data.total).toBe(10_000)
  })

  it('cách biệt lớn chỉ báo cần tải lại danh mục, KHÔNG bỏ qua migration', async () => {
    // Bốn bước giả nối sau bản thật mới nhất: máy ở v2 cách bản mới nhất hơn 3 bước
    const latest = Math.max(...pgliteMigrations.map((m) => m.version))
    const extra: PGliteMigration[] = [1, 2, 3, 4].map((step) => ({
      version: latest + step,
      name: `t${latest + step}`,
      sql: `CREATE TABLE IF NOT EXISTS t_${latest + step} (id int)`,
    }))
    const old = new PGlite()
    await runPGliteMigrations(
      old,
      pgliteMigrations.filter((m) => m.version <= 2),
    )
    const result = await runPGliteMigrations(old, [...pgliteMigrations, ...extra])
    const max = await old.query<{ v: number }>('SELECT MAX(version) AS v FROM schema_version')
    await old.close()

    expect(result).toEqual({ success: true, needsResync: true })
    expect(max.rows[0]!.v).toBe(latest + 4)
  })
})

describe('OFF-05, OFF-13: hàng chờ lưu người bán, không lưu PIN', () => {
  it('lưu cửa hàng và người bán gốc, bỏ PIN khỏi dữ liệu đơn', async () => {
    const clientId = await sell(pglite, STORE_A, SELLER_1, {
      priceOverridePin: '654321',
    })

    const saved = await getOfflineOrder(pglite, clientId)
    const raw = await pglite.query<{ order_data: string }>(
      'SELECT order_data::text AS order_data FROM offline_orders',
    )
    expect(saved).toMatchObject({ storeId: STORE_A, userId: SELLER_1, syncStatus: 'pending' })
    expect(raw.rows[0]!.order_data).not.toContain('654321')
    expect(raw.rows[0]!.order_data).not.toMatch(/OverridePin"/)
  })

  it('đếm theo cửa hàng đang đăng nhập, đơn cửa hàng khác đếm riêng', async () => {
    await sell(pglite, STORE_A, SELLER_1)
    await sell(pglite, STORE_A, SELLER_2)
    await sell(pglite, STORE_B, SELLER_B)

    expect(await getOrderCounts(pglite, STORE_A)).toEqual({
      pending: 2,
      error: 0,
      synced: 0,
      otherStores: 1,
    })
    expect(useOfflineStore.getState()).toMatchObject({
      pendingOrderCount: 2,
      otherStoreOrderCount: 1,
    })
  })

  it('mã tạm có tiền tố TAM-, sau đồng bộ lưu mã máy chủ (OFF-17)', async () => {
    const clientId = await sell(pglite, STORE_A, SELLER_1)
    expect(offlineOrderNumber(clientId)).toMatch(/^TAM-[0-9A-F]{8}$/)

    await markOrderSynced(pglite, clientId, { serverId: 'srv', orderNumber: 'HD-260926-7' })
    expect(await getOfflineOrder(pglite, clientId)).toMatchObject({
      syncStatus: 'synced',
      serverOrderNumber: 'HD-260926-7',
    })
  })
})

describe('OFF-04: tab chủ đóng đúng lúc đang ghi đơn', () => {
  /** Tab chủ chết sau khi lệnh INSERT đã ghi: PGliteWorker báo lỗi, không rõ đã ghi hay chưa */
  function leaderDiesAfterInsert(db: PGlite) {
    let died = false
    return new Proxy(db, {
      get(target, prop, receiver) {
        if (prop !== 'query') return Reflect.get(target, prop, receiver)
        return async (sql: string, params?: unknown[]) => {
          const result = await target.query(sql, params)
          if (!died && sql.includes('INSERT INTO offline_orders')) {
            died = true
            throw new Error('Leader changed, pending operation in indeterminate state')
          }
          return result
        }
      },
    })
  }

  it('lệnh ghi đã vào mà mất phản hồi: tự thử lại qua tab chủ mới, không nhân đôi đơn', async () => {
    const clientId = crypto.randomUUID()
    await saveOfflineOrder(
      leaderDiesAfterInsert(pglite),
      { storeId: STORE_A, userId: SELLER_1 },
      { ...order, clientId },
      clientId,
    )

    const rows = await pglite.query('SELECT client_id FROM offline_orders')
    expect(rows.rows).toEqual([{ client_id: clientId }])
    expect(useOfflineStore.getState().pendingOrderCount).toBe(1)
  })

  it('lỗi khác không tự thử lại', async () => {
    const broken = new Proxy(pglite, {
      get(target, prop, receiver) {
        if (prop !== 'query') return Reflect.get(target, prop, receiver)
        return vi.fn().mockRejectedValue(new Error('disk full'))
      },
    })
    const clientId = crypto.randomUUID()
    await expect(
      saveOfflineOrder(
        broken,
        { storeId: STORE_A, userId: SELLER_1 },
        { ...order, clientId },
        clientId,
      ),
    ).rejects.toThrow('disk full')
  })
})

describe('OFF-14: lỗi tạm thời thử lại lùi dần, lỗi nghiệp vụ không tự thử', () => {
  it('lỗi tạm thời giữ pending, hẹn giờ 5s rồi 10s; chưa tới giờ thì không lấy', async () => {
    const clientId = await sell(pglite, STORE_A, SELLER_1)
    const t0 = new Date('2026-09-26T03:00:00.000Z')
    const failure = { code: 'NETWORK_ERROR', message: 'mất mạng' }

    await scheduleOrderRetry(pglite, [clientId], failure, t0)
    let o = await getOfflineOrder(pglite, clientId)
    expect(o?.syncStatus).toBe('pending')
    expect(new Date(o!.nextRetryAt!).getTime() - t0.getTime()).toBe(5_000)
    expect(
      await getPendingOrders(pglite, STORE_A, { now: new Date(t0.getTime() + 4_000) }),
    ).toHaveLength(0)
    expect(
      await getPendingOrders(pglite, STORE_A, { now: new Date(t0.getTime() + 5_000) }),
    ).toHaveLength(1)
    expect(await getPendingOrders(pglite, STORE_A, { now: t0, ignoreBackoff: true })).toHaveLength(
      1,
    )

    await scheduleOrderRetry(pglite, [clientId], failure, t0)
    o = await getOfflineOrder(pglite, clientId)
    expect(new Date(o!.nextRetryAt!).getTime() - t0.getTime()).toBe(10_000)
  })

  it('đánh lỗi chỉ khi còn pending: đơn tab khác vừa đồng bộ không bị ghi đè', async () => {
    const clientId = await sell(pglite, STORE_A, SELLER_1)
    await markOrderSynced(pglite, clientId, { serverId: 'srv' })

    await markOrderFailed(pglite, clientId, { code: 'VALIDATION_ERROR', message: 'x' })
    expect((await getOfflineOrder(pglite, clientId))?.syncStatus).toBe('synced')
  })
})

describe('pushPendingOrders (OFF-05, OFF-10, OFF-14)', () => {
  it('120 đơn đi thành 2 lô (100 + 20), tất cả đồng bộ, lưu mã máy chủ', async () => {
    for (let i = 0; i < 120; i++) await sell(pglite, STORE_A, SELLER_1)
    const { batches } = fakeSyncServer()

    const outcome = await pushPendingOrders(pglite)

    expect(batches.map((b) => b.length)).toEqual([SYNC_PUSH_MAX_BATCH, 20])
    expect(outcome).toMatchObject({ synced: 120, errors: 0, retrying: 0, blocked: null })
    expect(await getOrderCounts(pglite, STORE_A)).toMatchObject({ pending: 0, synced: 120 })
    expect(useOfflineStore.getState()).toMatchObject({ status: 'online', pendingOrderCount: 0 })
  })

  it('mỗi đơn mang người bán gốc; không bao giờ gửi đơn của cửa hàng khác', async () => {
    const a1 = await sell(pglite, STORE_A, SELLER_1)
    const a2 = await sell(pglite, STORE_A, SELLER_2)
    const b1 = await sell(pglite, STORE_B, SELLER_B)
    signIn(STORE_A, SELLER_2)
    const { batches } = fakeSyncServer()

    await pushPendingOrders(pglite)

    const sent = batches.flat()
    expect(sent.map((o) => [o.clientId, o.sellerUserId])).toEqual([
      [a1, SELLER_1],
      [a2, SELLER_2],
    ])
    expect(sent.some((o) => o.clientId === b1)).toBe(false)
    expect((await getOfflineOrder(pglite, b1))?.syncStatus).toBe('pending')
    expect(useOfflineStore.getState().otherStoreOrderCount).toBe(1)
  })

  it('đơn lỗi nghiệp vụ không chặn đơn khác; lỗi tạm thời ở lại hàng chờ', async () => {
    const ok = await sell(pglite, STORE_A, SELLER_1)
    const bad = await sell(pglite, STORE_A, SELLER_1)
    const busy = await sell(pglite, STORE_A, SELLER_1)
    fakeSyncServer((o) => {
      if (o.clientId === bad)
        return {
          clientId: bad,
          status: 'error',
          error: { code: 'FORBIDDEN', message: 'x', reason: 'seller_not_in_store' },
        }
      if (o.clientId === busy)
        return { clientId: busy, status: 'error', error: { code: 'LOCKED', message: 'bận' } }
      return { clientId: o.clientId, status: 'synced', serverId: 'srv', orderNumber: 'HD-1' }
    })

    const outcome = await pushPendingOrders(pglite)

    expect(outcome).toMatchObject({ synced: 1, errors: 1, retrying: 1 })
    expect((await getOfflineOrder(pglite, ok))?.syncStatus).toBe('synced')
    const [errored] = await getErrorOrders(pglite, STORE_A)
    expect(errored?.clientId).toBe(bad)
    // Câu tiếng Việt chỉ cách xử lý, không phải câu gốc của máy chủ
    expect(errored?.errorMessage).toMatch(/cửa hàng/)
    const retry = await getOfflineOrder(pglite, busy)
    expect(retry).toMatchObject({ syncStatus: 'pending', errorCode: 'LOCKED' })
    expect(retry?.nextRetryAt).not.toBeNull()
    expect(useOfflineStore.getState()).toMatchObject({ status: 'error', errorOrderCount: 1 })
  })

  it('mất mạng giữa lượt: cả lô ở lại pending kèm lịch thử lại, không đánh lỗi', async () => {
    const c = await sell(pglite, STORE_A, SELLER_1)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const outcome = await pushPendingOrders(pglite)

    expect(outcome.blocked?.code).toBe('NETWORK_ERROR')
    expect(await getOfflineOrder(pglite, c)).toMatchObject({
      syncStatus: 'pending',
      retryCount: 1,
    })
    expect(useOfflineStore.getState().status).not.toBe('error')
  })

  it('phiên ngoại tuyến chưa có token (OFF-03): không gọi máy chủ, đơn giữ nguyên', async () => {
    await sell(pglite, STORE_A, SELLER_1)
    signIn(STORE_A, SELLER_1, null)
    const { fetchMock } = fakeSyncServer()

    const outcome = await pushPendingOrders(pglite)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(outcome.synced).toBe(0)
    expect(await getOrderCounts(pglite, STORE_A)).toMatchObject({ pending: 1 })
  })
})

describe('clearOfflineStoreData (OFF-05)', () => {
  it('xóa bảng dữ liệu cửa hàng đã đăng ký và đơn đã đồng bộ, giữ đơn chờ', async () => {
    await pglite.exec('CREATE TABLE test_catalog (id int); INSERT INTO test_catalog VALUES (1)')
    registerOfflineStoreTable('test_catalog')
    registerOfflineStoreTable('bang_chua_tao')
    const pending = await sell(pglite, STORE_A, SELLER_1)
    const done = await sell(pglite, STORE_A, SELLER_1)
    await markOrderSynced(pglite, done, { serverId: 'srv' })

    try {
      await clearOfflineStoreData(pglite)
    } finally {
      OFFLINE_STORE_TABLES.splice(0)
    }

    const catalog = await pglite.query('SELECT * FROM test_catalog')
    expect(catalog.rows).toHaveLength(0)
    expect(await getOfflineOrder(pglite, pending)).not.toBeNull()
    expect(await getOfflineOrder(pglite, done)).toBeNull()
    expect(() => registerOfflineStoreTable('x; DROP TABLE offline_orders')).toThrow()
  })
})

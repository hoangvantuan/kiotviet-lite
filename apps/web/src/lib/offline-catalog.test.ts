import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SyncPullEntity, SyncPullResponse } from '@kiotviet-lite/shared'
import { pgliteMigrations } from '@kiotviet-lite/shared/migrations/pglite'

import { useAuthStore } from '@/stores/use-auth-store'
import { useCatalogSyncStore } from '@/stores/use-catalog-sync-store'

import {
  CatalogUnavailableError,
  getCustomerDebtOffline,
  resolvePricesFromCatalog,
  searchCustomersOffline,
  searchProductsOffline,
} from './offline-catalog'
import { runPGliteMigrations } from './pglite-migrations'
import { syncCatalogNow } from './sync-engine'

const STORE = '0199aa00-0000-7000-8000-00000000000a'
const CARROT = '0199aa00-0000-7000-8000-000000000001'
const CABBAGE = '0199aa00-0000-7000-8000-000000000002'
const BOX = '0199aa00-0000-7000-8000-000000000003'
const CUSTOMER = '0199aa00-0000-7000-8000-000000000010'
const GROUP = '0199aa00-0000-7000-8000-000000000011'
const SERVER_TIME = '2026-09-26T08:00:00.000000Z'

const product = (id: string, name: string, sku: string, sellingPrice: number) => ({
  id,
  name,
  sku,
  barcode: `893${sku}`,
  categoryId: null,
  sellingPrice,
  unit: 'Kg',
  imageUrl: null,
  hasVariants: false,
  trackInventory: true,
  currentStock: 10,
  status: 'active',
})

/** Dữ liệu máy chủ trả theo từng loại; sản phẩm chia hai trang để kiểm phân trang */
const PAGES: Partial<Record<SyncPullEntity, SyncPullResponse['data']['rows'][]>> = {
  customer_groups: [
    [{ id: GROUP, name: 'Khách sỉ', defaultPriceListId: null, debtLimit: 5_000_000 }],
  ],
  customers: [
    [
      {
        id: CUSTOMER,
        name: 'Nguyễn Thị Hòa',
        code: 'KH000001',
        phone: '0901234567',
        groupId: GROUP,
        debtLimit: 1_000_000,
        debtUnlimited: false,
        currentDebt: 300_000,
      },
    ],
  ],
  products: [
    [product(CARROT, 'Cà rốt Đà Lạt', 'CR01', 18_000)],
    [product(CABBAGE, 'Bắp cải', 'BC01', 12_000)],
  ],
  unit_conversions: [
    [
      {
        id: BOX,
        productId: CARROT,
        unit: 'Thùng',
        conversionFactor: 10,
        sellingPrice: 170_000,
        sortOrder: 0,
        createdAt: SERVER_TIME,
      },
    ],
  ],
  customer_prices: [
    [
      {
        id: '0199aa00-0000-7000-8000-000000000020',
        customerId: CUSTOMER,
        productId: CARROT,
        price: 16_000,
      },
    ],
  ],
}

function pullFetch() {
  return vi.fn(async (url: string) => {
    const params = new URL(url, 'http://x').searchParams
    const entity = params.get('entity') as SyncPullEntity
    const pages = PAGES[entity] ?? [[]]
    const index = params.get('after') ? Number(params.get('afterId')!.slice(-1)) : 0
    const rows = pages[index] ?? []
    const hasMore = index < pages.length - 1
    const body: SyncPullResponse = {
      data: { entity, rows, deleted: [] },
      meta: {
        hasMore,
        // Mã trang kế tiếp nhét vào ký tự cuối của afterId cho gọn
        nextCursor: { t: SERVER_TIME, id: `00000000-0000-7000-8000-00000000000${index + 1}` },
        serverTime: SERVER_TIME,
        ...(index === 0 ? { total: pages.flat().length } : {}),
      },
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
}

describe('OFF-09, OFF-15, GL-03: bán hàng trên bản sao danh mục trong PGlite', () => {
  let pglite: PGlite

  beforeEach(async () => {
    pglite = new PGlite()
    await runPGliteMigrations(pglite, pgliteMigrations)
    useAuthStore.setState({
      accessToken: 't',
      user: { id: 'u1', storeId: STORE, role: 'staff' } as never,
    })
    useCatalogSyncStore.getState().reset()
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await pglite.close()
  })

  it('chưa đồng bộ lần nào thì báo rõ, không trả danh sách rỗng như thể không có hàng', async () => {
    await expect(searchProductsOffline({ search: 'ca rot' }, pglite)).rejects.toBeInstanceOf(
      CatalogUnavailableError,
    )
  })

  it('đồng bộ lần đầu theo trang, có tiến độ, rồi tìm hàng và khách không dấu khi ngoại tuyến', async () => {
    const fetchMock = pullFetch()
    vi.stubGlobal('fetch', fetchMock)

    const result = await syncCatalogNow(pglite)

    expect(result).toMatchObject({ full: true, syncedAt: SERVER_TIME })
    const productCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes('entity=products'))
    expect(productCalls).toHaveLength(2)
    expect(String(productCalls[1]![0])).toContain('after=')
    const progress = useCatalogSyncStore.getState()
    expect(progress).toMatchObject({ status: 'idle', syncedAt: SERVER_TIME, loaded: 6, total: 6 })

    const carrots = await searchProductsOffline({ search: 'ca rot da lat' }, pglite)
    expect(carrots.map((p) => p.name)).toEqual(['Cà rốt Đà Lạt'])
    expect(carrots[0]!.unitConversions.map((u) => u.unit)).toEqual(['Thùng'])
    // Quyết định 3: nhân viên không nhận giá vốn
    expect(carrots[0]).not.toHaveProperty('costPrice')
    expect((await searchProductsOffline({ search: '893BC01' }, pglite)).map((p) => p.id)).toEqual([
      CABBAGE,
    ])
    expect((await searchProductsOffline({}, pglite)).map((p) => p.id).sort()).toEqual(
      [CABBAGE, CARROT].sort(),
    )

    const customers = await searchCustomersOffline('nguyen thi hoa', pglite)
    expect(customers.map((c) => c.id)).toEqual([CUSTOMER])
    expect(customers[0]!.groupName).toBe('Khách sỉ')
  })

  it('giá ngoại tuyến theo cùng quy tắc: giá riêng của khách thắng giá bán lẻ', async () => {
    vi.stubGlobal('fetch', pullFetch())
    await syncCatalogNow(pglite)

    const prices = await resolvePricesFromCatalog(
      {
        customerId: CUSTOMER,
        items: [
          { productId: CARROT, variantId: null, quantity: 1 },
          { productId: CABBAGE, variantId: null, quantity: 1 },
        ],
      },
      pglite,
    )

    expect(prices.map((p) => [p.productId, p.price, p.source])).toEqual([
      [CARROT, 16_000, 'customer_price'],
      [CABBAGE, 12_000, 'retail_price'],
    ])
  })

  it('nợ ngoại tuyến: theo lần đồng bộ, cộng đơn ghi nợ trên máy chưa phản ánh vào bản sao', async () => {
    vi.stubGlobal('fetch', pullFetch())
    await syncCatalogNow(pglite)
    const debtOrder = (debtAmount: number) =>
      JSON.stringify({ customerId: CUSTOMER, debtAmount, total: debtAmount })
    await pglite.query(
      `INSERT INTO offline_orders (id, store_id, client_id, sync_status, order_data, created_at, synced_at)
       VALUES (gen_random_uuid(), $1, gen_random_uuid(), 'pending', $2, now(), NULL),
              (gen_random_uuid(), $1, gen_random_uuid(), 'synced', $3, now(), '2026-09-26T09:00:00Z'),
              (gen_random_uuid(), $1, gen_random_uuid(), 'synced', $4, now(), '2026-09-26T07:00:00Z')`,
      [STORE, debtOrder(100_000), debtOrder(50_000), debtOrder(999_000)],
    )

    const debt = await getCustomerDebtOffline(CUSTOMER, pglite)

    // 300k lúc đồng bộ + 100k đang chờ + 50k đồng bộ sau mốc; đơn đồng bộ trước mốc đã nằm trong 300k
    expect(debt).toMatchObject({
      currentDebt: 450_000,
      pendingDebt: 150_000,
      customerDebtLimit: 1_000_000,
      groupDebtLimit: 5_000_000,
      effectiveDebtLimit: 1_000_000,
      syncedAt: new Date(SERVER_TIME).toISOString(),
    })
  })
})

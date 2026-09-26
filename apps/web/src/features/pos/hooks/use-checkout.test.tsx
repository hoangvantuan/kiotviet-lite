// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiClientError, REQUEST_TIMEOUT_MS } from '@/lib/api-client'
import { resetIdempotencyKeysForTest } from '@/lib/idempotency'
import { posTransferNote } from '@/lib/vietqr'
import { useAuthStore } from '@/stores/use-auth-store'
import { useCartStore } from '@/stores/use-cart-store'

import {
  type CheckoutVariables,
  OFFLINE_UNKNOWN_OUTCOME_MESSAGE,
  pendingCheckoutKey,
  PREVIOUS_ORDER_SAVED,
  UNKNOWN_OUTCOME_RETRY_HINT,
  useCheckoutMutation,
} from './use-checkout'

// Hàng chờ ngoại tuyến: mặc định không mở được (như máy không có PGlite) để các bài R4 bên dưới
// giữ nguyên tiền đề "lỗi mạng thì báo lỗi, lưu lại cùng khóa"; bài OFF-06 tự bật lên
const offline = vi.hoisted(() => ({
  getOfflineDB: vi.fn<() => Promise<object>>(),
  saveOfflineOrder: vi.fn(),
  toastWarning: vi.fn(),
}))
vi.mock('@/lib/pglite', () => ({ getOfflineDB: offline.getOfflineDB }))
vi.mock('@/lib/offline-orders', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/offline-orders')>()),
  saveOfflineOrder: offline.saveOfflineOrder,
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: offline.toastWarning, error: vi.fn() },
}))

const PRODUCT_ID = '01a0da5f-d368-7cda-9dfe-5c0c5757357c'

function order(overrides: Partial<CheckoutVariables['order']> = {}): CheckoutVariables['order'] {
  return {
    customerId: null,
    subtotal: 36_000,
    discountType: null,
    discountValue: 0,
    discountAmount: 0,
    total: 36_000,
    paymentMethod: 'cash',
    cashAmount: 50_000,
    items: [
      {
        productId: PRODUCT_ID,
        variantId: null,
        productName: 'Dưa leo',
        variantName: null,
        unit: 'Kg',
        unitPrice: 18_000,
        quantity: 2,
        discountType: null,
        discountValue: 0,
        discountAmount: 0,
        lineTotal: 36_000,
        note: null,
        unitConversionId: null,
      },
    ],
    ...overrides,
  }
}

const created = () =>
  new Response(JSON.stringify({ data: { id: crypto.randomUUID(), orderNumber: 'HD-1' } }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  })

const keyReused = () =>
  new Response(
    JSON.stringify({
      error: {
        code: 'BUSINESS_RULE_VIOLATION',
        message: 'Idempotency-Key đã dùng cho một yêu cầu khác',
        details: { reason: 'idempotency_key_reused' },
      },
    }),
    { status: 422, headers: { 'Content-Type': 'application/json' } },
  )

interface SentOrder {
  key: string | null
  clientId: string | undefined
}

function sentOrders(fetchMock: ReturnType<typeof vi.fn>): SentOrder[] {
  return fetchMock.mock.calls
    .filter(([url, init]) => String(url).endsWith('/api/v1/pos/orders') && init?.method === 'POST')
    .map(([, init]) => {
      const request = init as RequestInit & { headers: Headers }
      return {
        key: request.headers.get('Idempotency-Key'),
        clientId: (JSON.parse(String(request.body)) as { clientId?: string }).clientId,
      }
    })
}

function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const { result } = renderHook(() => useCheckoutMutation(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
  return result
}

async function checkout(
  result: ReturnType<typeof setup>,
  variables: CheckoutVariables,
): Promise<unknown> {
  let outcome: unknown
  await act(async () => {
    try {
      outcome = await result.current.mutateAsync(variables)
    } catch (error) {
      outcome = error
    }
  })
  return outcome
}

beforeEach(() => {
  offline.getOfflineDB.mockReset().mockRejectedValue(new Error('PGlite không khả dụng'))
  offline.saveOfflineOrder.mockReset().mockImplementation(async (_db, _store, _o, id) => id)
  offline.toastWarning.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  sessionStorage.clear()
  resetIdempotencyKeysForTest()
  useAuthStore.setState({ accessToken: 'test-token', user: { id: 'u1', storeId: 's1' } as never })
  useCartStore.setState({ activeTab: 1 })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('R4: khóa lưu đơn POS gắn với giỏ hàng của tab', () => {
  it('mất phản hồi, đóng mở lại hộp thanh toán và trả tiền khác: vẫn cùng khóa, clientId = khóa', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(created())
      .mockResolvedValueOnce(created())
    vi.stubGlobal('fetch', fetchMock)
    const result = setup()

    await checkout(result, { tab: 1, order: order() })
    // Mở lại hộp: chọn mệnh giá khác, rồi đổi sang chuyển khoản có PIN duyệt
    await checkout(result, { tab: 1, order: order({ cashAmount: 100_000 }) })

    const [first, second] = sentOrders(fetchMock)
    expect(first!.key).toMatch(/^[0-9a-f-]{36}$/)
    expect(second!.key).toBe(first!.key)
    expect(first!.clientId).toBe(first!.key)
    expect(second!.clientId).toBe(first!.key)
  })

  it('đổi phương thức, PIN hay người duyệt cũng không đổi khóa', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(created())
    vi.stubGlobal('fetch', fetchMock)
    const result = setup()

    await checkout(result, { tab: 1, order: order() })
    await checkout(result, {
      tab: 1,
      order: order({
        paymentMethod: 'transfer',
        cashAmount: undefined,
        transferAmount: 36_000,
        priceOverridePin: '111111',
        priceApproverId: 'approver',
        note: 'ghi chú',
      }),
    })

    const [first, second] = sentOrders(fetchMock)
    expect(second!.key).toBe(first!.key)
  })

  it('đổi hàng, khách hay chiết khấu thì sinh khóa mới', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(created())
    vi.stubGlobal('fetch', fetchMock)
    const result = setup()

    await checkout(result, { tab: 1, order: order() })
    const more = order()
    more.items[0] = { ...more.items[0]!, quantity: 3, lineTotal: 54_000 }
    await checkout(result, { tab: 1, order: { ...more, subtotal: 54_000, total: 54_000 } })
    await checkout(result, {
      tab: 1,
      order: order({ discountType: 'amount', discountValue: 1_000, discountAmount: 1_000 }),
    })

    const keys = sentOrders(fetchMock).map((s) => s.key)
    expect(new Set(keys).size).toBe(3)
  })

  it('mỗi tab giữ khóa riêng', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)
    const result = setup()

    await checkout(result, { tab: 1, order: order() })
    await checkout(result, { tab: 2, order: order() })

    const [first, second] = sentOrders(fetchMock)
    expect(second!.key).not.toBe(first!.key)
  })

  it('lưu thành công hoặc xóa giỏ thì giỏ kế tiếp giống hệt là đơn mới', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(created())
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(created())
    vi.stubGlobal('fetch', fetchMock)
    const result = setup()

    await checkout(result, { tab: 1, order: order() })
    await checkout(result, { tab: 1, order: order() })
    act(() => useCartStore.getState().clearCart())
    await checkout(result, { tab: 1, order: order() })

    const keys = sentOrders(fetchMock).map((s) => s.key)
    expect(new Set(keys).size).toBe(3)
  })

  it('máy chủ báo khóa đã dùng: tra đơn theo clientId, báo đơn trước đã lưu, giữ khóa', async () => {
    const orderId = crypto.randomUUID()
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/api/v1/orders?clientId=')) {
        return new Response(
          JSON.stringify({ data: [{ id: orderId, orderNumber: 'HD-260926-0007' }], meta: {} }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (init?.method === 'POST') return keyReused()
      return new Response('{}', { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = setup()

    const error = await checkout(result, { tab: 1, order: order({ cashAmount: 200_000 }) })
    await checkout(result, { tab: 1, order: order({ cashAmount: 500_000 }) })

    expect(error).toBeInstanceOf(ApiClientError)
    expect((error as ApiClientError).code).toBe(PREVIOUS_ORDER_SAVED)
    expect((error as ApiClientError).message).toContain('HD-260926-0007')
    expect((error as ApiClientError).details).toEqual({ orderId, orderNumber: 'HD-260926-0007' })
    const [first, second] = sentOrders(fetchMock)
    const lookup = fetchMock.mock.calls.find(([url]) => String(url).includes('clientId='))
    expect(String(lookup![0])).toContain(`clientId=${first!.key}`)
    expect(second!.key).toBe(first!.key)
  })
})

describe('POS-07: nội dung chuyển khoản trong mã VietQR tra ngược ra đơn', () => {
  it('khóa tính trước khi mở hộp thanh toán là clientId của đơn được gửi đi', async () => {
    const fetchMock = vi.fn().mockResolvedValue(created())
    vi.stubGlobal('fetch', fetchMock)
    const result = setup()

    // Lúc mở hộp chưa biết cách trả tiền: tính với tiền mặt, khách chọn QR vẫn cùng khóa
    const expected = pendingCheckoutKey({ tab: 1, order: order() })
    await checkout(result, {
      tab: 1,
      order: order({ paymentMethod: 'qr', cashAmount: undefined }),
    })

    const [sent] = sentOrders(fetchMock)
    expect(sent!.clientId).toBe(expected)
    expect(posTransferNote(expected)).toBe(
      `TT ${expected.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
    )
  })
})

describe('OFF-06: tạo đơn gặp lỗi mạng hoặc hết giờ: chưa rõ thì theo R4, rồi lưu ngoại tuyến bằng cùng clientId', () => {
  beforeEach(() => {
    offline.getOfflineDB.mockReset().mockResolvedValue({})
  })

  /** fetch treo tới khi bị hủy, như có Wi-Fi mà máy chủ không phản hồi */
  const hangingFetch = () =>
    vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal!.reason))
        }),
    )

  it('hết giờ chờ lần đầu: đi luồng chưa rõ của R4, chưa lưu vào máy, không tự gửi lại', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const fetchMock = hangingFetch()
      vi.stubGlobal('fetch', fetchMock)
      const result = setup()

      let outcome: unknown
      await act(async () => {
        const pending = result.current.mutateAsync({ tab: 1, order: order() }).catch((e) => e)
        await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
        outcome = await pending
      })

      expect(sentOrders(fetchMock)).toHaveLength(1)
      expect(offline.saveOfflineOrder).not.toHaveBeenCalled()
      expect(outcome).toMatchObject({ code: 'NETWORK_ERROR', details: { outcomeUnknown: true } })
      expect((outcome as Error).message).toContain('Chưa rõ đã lưu hay chưa')
      expect((outcome as Error).message).toContain(UNKNOWN_OUTCOME_RETRY_HINT)
    } finally {
      vi.useRealTimers()
    }
  })

  it('bấm lại mà vẫn hết giờ: lưu vào hàng chờ đúng clientId đã gửi, báo chưa rõ kết quả', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const fetchMock = hangingFetch()
      vi.stubGlobal('fetch', fetchMock)
      const result = setup()

      let outcome: unknown
      await act(async () => {
        const first = result.current.mutateAsync({ tab: 1, order: order() }).catch((e) => e)
        await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
        await first
        const second = result.current.mutateAsync({ tab: 1, order: order() })
        await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
        outcome = await second
      })

      const sent = sentOrders(fetchMock)
      expect(sent).toHaveLength(2)
      expect(sent[1]!.key).toBe(sent[0]!.key)
      expect(offline.saveOfflineOrder).toHaveBeenCalledTimes(1)
      const [, seller, payload, clientId] = offline.saveOfflineOrder.mock.calls[0]!
      expect(seller).toEqual({ storeId: 's1', userId: 'u1' })
      expect(clientId).toBe(sent[0]!.key)
      expect((payload as { clientId: string }).clientId).toBe(sent[0]!.key)
      expect((outcome as { data: { id: string } }).data.id).toBe(sent[0]!.key)
      expect(offline.toastWarning).toHaveBeenCalledWith(OFFLINE_UNKNOWN_OUTCOME_MESSAGE)
    } finally {
      vi.useRealTimers()
    }
  })

  it('lỗi mạng và máy đã báo ngoại tuyến: lưu ngay bằng khóa đó', async () => {
    let online = true
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online)
    const fetchMock = vi.fn(async () => {
      online = false
      throw new TypeError('Failed to fetch')
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = setup()

    const outcome = await checkout(result, { tab: 1, order: order() })

    const [sent] = sentOrders(fetchMock)
    expect(offline.saveOfflineOrder.mock.calls[0]![3]).toBe(sent!.key)
    expect((outcome as { data: { id: string } }).data.id).toBe(sent!.key)
  })

  it('máy chủ trả lỗi nghiệp vụ: không lưu ngoại tuyến', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Sai dữ liệu' } }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
    )
    const result = setup()

    const outcome = await checkout(result, { tab: 1, order: order() })

    expect(outcome).toBeInstanceOf(ApiClientError)
    expect(offline.saveOfflineOrder).not.toHaveBeenCalled()
  })

  it('không ghi được vào máy: trả lại lỗi mạng gốc và giữ khóa cho lần lưu lại', async () => {
    offline.saveOfflineOrder.mockRejectedValueOnce(new Error('đĩa đầy'))
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(created())
    vi.stubGlobal('fetch', fetchMock)
    const result = setup()

    await checkout(result, { tab: 1, order: order() })
    const error = await checkout(result, { tab: 1, order: order() })
    await checkout(result, { tab: 1, order: order() })

    expect(offline.saveOfflineOrder).toHaveBeenCalledTimes(1)
    expect(error).toMatchObject({ code: 'NETWORK_ERROR', details: { outcomeUnknown: true } })
    const [first, second, third] = sentOrders(fetchMock)
    expect(second!.key).toBe(first!.key)
    expect(third!.key).toBe(first!.key)
  })
})

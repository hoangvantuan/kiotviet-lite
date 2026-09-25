// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiClientError } from '@/lib/api-client'
import { resetIdempotencyKeysForTest } from '@/lib/idempotency'
import { useAuthStore } from '@/stores/use-auth-store'
import { useCartStore } from '@/stores/use-cart-store'

import { type CheckoutVariables, PREVIOUS_ORDER_SAVED, useCheckoutMutation } from './use-checkout'

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
  sessionStorage.clear()
  resetIdempotencyKeysForTest()
  useAuthStore.setState({ accessToken: 'test-token', user: { id: 'u1', storeId: 's1' } as never })
  useCartStore.setState({ activeTab: 1 })
})

afterEach(() => {
  vi.unstubAllGlobals()
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

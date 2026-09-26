// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CurrentShiftResponse } from '@kiotviet-lite/shared'

import { useAuthStore } from '@/stores/use-auth-store'

import { usePosShiftGate } from './use-pos-shift-gate'

function currentShift(body: CurrentShiftResponse) {
  const fetchMock = vi.fn<(url: string) => Promise<Response>>(
    async () =>
      new Response(JSON.stringify({ data: body }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function setup(isOffline = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderHook(() => usePosShiftGate(isOffline), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
}

const OPEN_SHIFT = {
  id: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002',
  userName: 'Thu ngân',
  status: 'open',
  openingCash: 500_000,
  openNote: null,
  openedAt: '2026-09-26T01:00:00.000Z',
  closedAt: null,
  closedBy: null,
  closedByName: null,
  expectedCash: null,
  countedCash: null,
  difference: null,
  closeNote: null,
  summary: {
    openingCash: 500_000,
    cashSales: 0,
    cashReceipts: 0,
    cashRefunds: 0,
    cashSupplierPayments: 0,
    expectedCash: 500_000,
    transferIn: 0,
    qrIn: 0,
    transferOut: 0,
    debtSales: 0,
    orderCount: 0,
    receiptCount: 0,
    returnCount: 0,
    supplierPaymentCount: 0,
  },
  closeSummary: null,
} satisfies CurrentShiftResponse['shift']

beforeEach(() => {
  useAuthStore.setState({ accessToken: 'test-token', user: { id: 'u1', storeId: 's1' } as never })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('POS-06: POS yêu cầu mở ca khi cửa hàng bật ca', () => {
  it('bật ca, chưa có ca: tự mở hộp mở ca và chặn thanh toán', async () => {
    const fetchMock = currentShift({ shiftsEnabled: true, shift: null })
    const { result } = setup()

    await waitFor(() => expect(result.current.shiftRequired).toBe(true))
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/v1/shifts/current')
    expect(result.current.openShiftOpen).toBe(true)

    act(() => result.current.setOpenShiftOpen(false))
    let allowed = true
    act(() => {
      allowed = result.current.ensureShift()
    })
    expect(allowed).toBe(false)
    expect(result.current.openShiftOpen).toBe(true)
  })

  it('bật ca và đã mở ca: bán bình thường', async () => {
    currentShift({ shiftsEnabled: true, shift: OPEN_SHIFT })
    const { result } = setup()

    await waitFor(() => expect(result.current.currentShift.isSuccess).toBe(true))
    expect(result.current.shiftRequired).toBe(false)
    expect(result.current.openShiftOpen).toBe(false)
    expect(result.current.ensureShift()).toBe(true)
  })

  it('cửa hàng không dùng ca (mặc định): không hỏi mở ca', async () => {
    currentShift({ shiftsEnabled: false, shift: null })
    const { result } = setup()

    await waitFor(() => expect(result.current.currentShift.isSuccess).toBe(true))
    expect(result.current.shiftRequired).toBe(false)
    expect(result.current.ensureShift()).toBe(true)
  })

  it('mất mạng: không chặn bán, đơn ngoại tuyến gắn ca khi đồng bộ', async () => {
    currentShift({ shiftsEnabled: true, shift: null })
    const { result } = setup(true)

    await waitFor(() => expect(result.current.currentShift.isSuccess).toBe(true))
    expect(result.current.shiftRequired).toBe(false)
    expect(result.current.openShiftOpen).toBe(false)
    expect(result.current.ensureShift()).toBe(true)
  })
})

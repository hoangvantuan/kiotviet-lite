// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiClientError } from '@/lib/api-client'
import { useAuthStore } from '@/stores/use-auth-store'

import { OrderCancelButton } from './order-cancel'
import type { OrderDetailResponse } from './orders-api'

const mutateAsync = vi.fn()
const handleApiError = vi.fn()

vi.mock('./use-orders', () => ({
  useCancelOrderMutation: () => ({ mutateAsync, isPending: false }),
}))
vi.mock('@/lib/api-error', () => ({ handleApiError: (err: unknown) => handleApiError(err) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
vi.mock('@/features/auth/pin-dialog', () => ({ PinDialog: () => null }))

const shifts = [
  {
    id: '00000000-0000-4000-8000-0000000000a1',
    userId: '00000000-0000-4000-8000-0000000000b1',
    userName: 'Thu ngân A',
    openedAt: '2026-09-26T01:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-0000000000a2',
    userId: '00000000-0000-4000-8000-0000000000b2',
    userName: 'Thu ngân B',
    openedAt: '2026-09-26T02:00:00.000Z',
  },
]

function order(extra: Partial<OrderDetailResponse>): OrderDetailResponse {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    orderNumber: 'HD-0001',
    status: 'completed',
    total: 100_000,
    paymentMethod: 'cash',
    cashAmount: null,
    transferAmount: null,
    debtAmount: 0,
    debtAmountAtSale: 0,
    ...extra,
  } as OrderDetailResponse
}

function openAndConfirm(o: OrderDetailResponse) {
  render(<OrderCancelButton order={o} />)
  fireEvent.click(screen.getByRole('button', { name: /Hủy đơn/ }))
  fireEvent.change(screen.getByLabelText('Lý do hủy'), { target: { value: 'Bán nhầm' } })
}

const okResult = (refundMethod: string | null) => ({
  data: { cashRefundAmount: 100_000, prepaymentRefundAmount: 0, refundMethod },
})

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'u1', storeId: 's1', role: 'owner' } as never })
  mutateAsync.mockReset()
  handleApiError.mockReset()
})
afterEach(cleanup)

describe('OrderCancelButton (BC-06): kênh trả lại khách và ca chi tiền', () => {
  it('đơn chuyển khoản: chọn sẵn hoàn chuyển khoản, không có QR, gửi kèm phương thức', async () => {
    mutateAsync.mockResolvedValue(okResult('transfer'))
    openAndConfirm(order({ paymentMethod: 'transfer' }))
    const group = screen.getByRole('radiogroup', { name: /Trả lại khách .* qua/ })
    expect(group.querySelectorAll('[role="radio"]')).toHaveLength(2)
    expect(screen.queryByRole('radio', { name: /QR/ })).toBeNull()
    expect(screen.getByRole('radio', { name: /Chuyển khoản/ }).getAttribute('aria-checked')).toBe(
      'true',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hủy' }))
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        orderId: '00000000-0000-4000-8000-000000000001',
        input: { reason: 'Bán nhầm', refundMethod: 'transfer' },
      }),
    )
  })

  it('nhiều ca đang mở: hiện ô chọn ca, chặn xác nhận, không báo lỗi thêm', async () => {
    mutateAsync.mockRejectedValue(
      new ApiClientError(422, {
        code: 'BUSINESS_RULE_VIOLATION',
        message: 'Có nhiều ca đang mở',
        details: { reason: 'shift_choice_required', shifts },
      }),
    )
    openAndConfirm(order({ paymentMethod: 'cash' }))
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hủy' }))
    expect(await screen.findByRole('combobox', { name: 'Ca bán hàng' })).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Xác nhận hủy' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(handleApiError).not.toHaveBeenCalled()

    // Đổi sang chuyển khoản thì không cần chọn ca nữa
    fireEvent.click(screen.getByRole('radio', { name: /Chuyển khoản/ }))
    expect(screen.queryByRole('combobox', { name: 'Ca bán hàng' })).toBeNull()
    expect(
      (screen.getByRole('button', { name: 'Xác nhận hủy' }) as HTMLButtonElement).disabled,
    ).toBe(false)
  })

  it('đơn ghi nợ toàn bộ: không có tiền trả lại nên không hỏi kênh', async () => {
    mutateAsync.mockResolvedValue(okResult(null))
    openAndConfirm(order({ paymentMethod: 'debt', debtAmount: 100_000, debtAmountAtSale: 100_000 }))
    expect(screen.queryByRole('radiogroup')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hủy' }))
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        orderId: '00000000-0000-4000-8000-000000000001',
        input: { reason: 'Bán nhầm' },
      }),
    )
  })
})

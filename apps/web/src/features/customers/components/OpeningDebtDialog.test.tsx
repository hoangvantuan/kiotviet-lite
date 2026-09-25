// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { OpeningDebtDialog } from './OpeningDebtDialog'

const customerMutate = vi.fn<(input: unknown) => Promise<object>>(async () => ({}))
const supplierMutate = vi.fn<(input: unknown) => Promise<object>>(async () => ({}))

vi.mock('../hooks/use-customer-detail', () => ({
  useCreateOpeningDebtMutation: () => ({ mutateAsync: customerMutate, isPending: false }),
}))
vi.mock('@/features/suppliers/use-suppliers', () => ({
  useCreateSupplierOpeningDebtMutation: () => ({ mutateAsync: supplierMutate, isPending: false }),
}))
vi.mock('@/lib/toast', () => ({ showSuccess: vi.fn() }))

afterEach(() => {
  cleanup()
  customerMutate.mockClear()
  supplierMutate.mockClear()
})

function renderDialog(kind: 'customer' | 'supplier') {
  render(
    <OpeningDebtDialog
      open
      onOpenChange={() => {}}
      target={{ kind, id: '00000000-0000-4000-8000-000000000001', name: 'Khách A' }}
    />,
  )
}

function setDate(value: string) {
  fireEvent.change(screen.getByLabelText('Ngày phát sinh'), { target: { value } })
}

describe('OpeningDebtDialog (GL-09)', () => {
  it('để trống số tiền báo tiếng Việt, không hiện thông báo tiếng Anh của zod', async () => {
    const user = userEvent.setup()
    renderDialog('customer')
    setDate('2025-01-15')
    await user.click(screen.getByRole('button', { name: 'Xác nhận nạp nợ' }))
    expect(screen.getByRole('alert').textContent).toBe('Vui lòng nhập số tiền')
    expect(customerMutate).not.toHaveBeenCalled()
  })

  it('khách trả trước gửi số âm lên sổ công nợ', async () => {
    const user = userEvent.setup()
    renderDialog('customer')
    await user.click(screen.getByLabelText(/Khách trả trước/))
    await user.type(screen.getByLabelText('Số tiền khách trả trước'), '5000')
    setDate('2025-01-15')
    await user.click(screen.getByRole('button', { name: 'Xác nhận nạp nợ' }))
    await waitFor(() =>
      expect(customerMutate).toHaveBeenCalledWith({ amount: -5000, incurredAt: '2025-01-15' }),
    )
  })

  it('nhà cung cấp không có lựa chọn trả trước', () => {
    renderDialog('supplier')
    expect(screen.queryByLabelText(/Khách trả trước/)).toBeNull()
  })
})

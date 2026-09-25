// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { type DebtAdjustmentChange, DebtAdjustmentFormDialog } from './debt-adjustment-form-dialog'

/** Mở hộp thoại từ bên ngoài như CustomerDebtsTab và SupplierDebtPanel (setOpen(true)). */
function Harness({ onSubmit }: { onSubmit: (change: DebtAdjustmentChange) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Điều chỉnh nợ
      </button>
      <DebtAdjustmentFormDialog
        open={open}
        onOpenChange={setOpen}
        title="Điều chỉnh nợ khách hàng"
        description="Mô tả"
        currentDebt={500_000}
        onSubmit={onSubmit}
        onConflict={() => {}}
      />
    </>
  )
}

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Giảm nợ' }))
  await user.type(screen.getByLabelText(/Số tiền điều chỉnh/), '100000')
  await user.type(screen.getByLabelText(/Lý do/), 'Chiết khấu cuối kỳ')
  await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))
}

function expectFreshForm() {
  expect(screen.getByRole('button', { name: 'Tiếp tục' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Xác nhận điều chỉnh' })).toBeNull()
  expect((screen.getByLabelText(/Số tiền điều chỉnh/) as HTMLInputElement).value).toBe('')
  expect((screen.getByLabelText(/Lý do/) as HTMLTextAreaElement).value).toBe('')
  expect(screen.getByRole('button', { name: 'Giảm nợ' }).getAttribute('aria-pressed')).toBe('false')
}

afterEach(() => cleanup())

describe('DebtAdjustmentFormDialog (TIEN-110)', () => {
  it('lưu xong mở lại thì form trống và ở bước nhập, không lưu trùng được bằng một cú bấm', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn(async () => {})
    render(<Harness onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: 'Điều chỉnh nợ' }))
    await fillForm(user)
    expect(screen.getByText(/Nợ trước:/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Xác nhận điều chỉnh' }))
    expect(onSubmit).toHaveBeenCalledWith({
      direction: 'decrease',
      amount: 100_000,
      expectedCurrentDebt: 500_000,
      reason: 'Chiết khấu cuối kỳ',
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await user.click(screen.getByRole('button', { name: 'Điều chỉnh nợ' }))
    expectFreshForm()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('huỷ rồi mở lại cũng trống', async () => {
    const user = userEvent.setup()
    render(<Harness onSubmit={vi.fn(async () => {})} />)

    await user.click(screen.getByRole('button', { name: 'Điều chỉnh nợ' }))
    await user.click(screen.getByRole('button', { name: 'Giảm nợ' }))
    await user.type(screen.getByLabelText(/Số tiền điều chỉnh/), '100000')
    await user.type(screen.getByLabelText(/Lý do/), 'Nhập dở')
    await user.click(screen.getByRole('button', { name: 'Huỷ' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await user.click(screen.getByRole('button', { name: 'Điều chỉnh nợ' }))
    expectFreshForm()
  })

  it('đóng ở bước xác nhận rồi mở lại thì quay về bước nhập', async () => {
    const user = userEvent.setup()
    render(<Harness onSubmit={vi.fn(async () => {})} />)

    await user.click(screen.getByRole('button', { name: 'Điều chỉnh nợ' }))
    await fillForm(user)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await user.click(screen.getByRole('button', { name: 'Điều chỉnh nợ' }))
    expectFreshForm()
  })
})

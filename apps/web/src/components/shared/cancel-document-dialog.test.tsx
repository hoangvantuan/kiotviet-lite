// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/use-auth-store'

import { CancelDocumentDialog } from './cancel-document-dialog'

// PinDialog cần QueryClient; ở đây chỉ kiểm hộp thoại có mở bước PIN hay không
vi.mock('@/features/auth/pin-dialog', () => ({
  PinDialog: ({ open }: { open: boolean }) => (open ? <div>Duyệt bằng PIN</div> : null),
}))

afterEach(() => cleanup())

function setup(role: 'owner' | 'manager' | 'staff', allowApproval = true) {
  useAuthStore.setState({ user: { id: 'u1', storeId: 's1', role } as never })
  const onConfirm = vi.fn().mockResolvedValue(undefined)
  const onOpenChange = vi.fn()
  render(
    <CancelDocumentDialog
      open
      onOpenChange={onOpenChange}
      title="Hủy phiếu thu"
      description={<p>Đảo phần đã thu</p>}
      isPending={false}
      onConfirm={onConfirm}
      allowApproval={allowApproval}
    />,
  )
  return { onConfirm, onOpenChange }
}

describe('CancelDocumentDialog (TIEN-107)', () => {
  it('bắt buộc nhập lý do, lý do chỉ có khoảng trắng không gửi được', () => {
    setup('owner')
    const confirm = screen.getByRole('button', { name: 'Xác nhận hủy' })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Lý do hủy'), { target: { value: '   ' } })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
  })

  it('chủ cửa hàng hủy thẳng, gửi lý do đã cắt khoảng trắng', async () => {
    const { onConfirm, onOpenChange } = setup('owner')
    fireEvent.change(screen.getByLabelText('Lý do hủy'), { target: { value: ' Thu trùng ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hủy' }))
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ reason: 'Thu trùng' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('nhân viên phải qua bước PIN của chủ hoặc quản lý', () => {
    const { onConfirm } = setup('staff')
    expect(screen.getByText(/cần chủ cửa hàng hoặc quản lý nhập mã PIN/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Lý do hủy'), { target: { value: 'Bán nhầm' } })
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hủy' }))
    expect(screen.getByText('Duyệt bằng PIN')).toBeTruthy()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})

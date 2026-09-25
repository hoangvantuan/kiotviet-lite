// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { StockCheckImportDialog } from './stock-check-import-dialog'
import type { StockImportPreview } from './stock-checks-api'

const preview: StockImportPreview = {
  filename: 'DanhSachSanPham_KV.xlsx',
  totalRows: 11_055,
  items: 1_076,
  checks: 2,
  totalDiffPositive: 1_197_653,
  totalDiffNegative: 0,
  errors: [],
  conversions: [
    {
      code: 'qty_negative',
      message: 'Tồn âm được đưa về 0 (phiếu kiểm chỉ nhận số không âm)',
      count: 5208,
      rows: [3, 4],
      requiresConfirmation: true,
    },
  ],
  requiresApproval: true,
  sample: [],
  digest: 'a'.repeat(64),
}
const previewApi = vi.fn<(file: File) => Promise<StockImportPreview>>(async () => preview)
const confirmApi = vi.fn<
  (file: File, digest: string, approved: boolean) => Promise<{ ids: string[]; items: number }>
>(async () => ({
  ids: ['1', '2'],
  items: 1_076,
}))

vi.mock('./stock-checks-api', () => ({
  previewStockImportApi: (file: File) => previewApi(file),
  confirmStockImportApi: (file: File, digest: string, approved: boolean) =>
    confirmApi(file, digest, approved),
}))
vi.mock('@/lib/toast', () => ({ showSuccess: vi.fn() }))

afterEach(() => cleanup())

describe('StockCheckImportDialog (GL-02)', () => {
  it('xem trước, phải chấp thuận thay đổi tự động rồi mới tạo phiếu kiểm nháp', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <StockCheckImportDialog open onOpenChange={() => {}} />
      </QueryClientProvider>,
    )
    await user.upload(screen.getByLabelText('Tệp XLSX'), new File(['x'], 'DanhSachSanPham_KV.xlsx'))
    await screen.findByText(/phiếu kiểm nháp \(tăng/)
    expect(screen.getByLabelText('Thay đổi tự động').textContent).toContain('5208 dòng: 3, 4…')
    const submit = screen.getByRole('button', { name: 'Tạo phiếu kiểm nháp' })
    expect((submit as HTMLButtonElement).disabled).toBe(true)
    await user.click(screen.getByLabelText(/Tôi đã xem và đồng ý/))
    expect((submit as HTMLButtonElement).disabled).toBe(false)
    await user.click(submit)
    await waitFor(() =>
      expect(confirmApi).toHaveBeenCalledWith(expect.any(File), 'a'.repeat(64), true),
    )
  })
})

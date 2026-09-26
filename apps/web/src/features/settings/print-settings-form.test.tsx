// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PrintSettingsResponse } from '@kiotviet-lite/shared'

const { mutateAsync, showError, showSuccess } = vi.hoisted(() => ({
  mutateAsync: vi.fn<(input: unknown) => Promise<object>>(async () => ({})),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}))
let settings: PrintSettingsResponse

// jsdom không có ResizeObserver (Radix Switch/Select dùng để đo kích thước)
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.mock('./use-print-settings', () => ({
  usePrintSettingsQuery: () => ({ data: settings, isLoading: false, isError: false }),
  useUpdatePrintSettingsMutation: () => ({ mutateAsync, isPending: false }),
}))
vi.mock('../orders/use-invoice-store-info', () => ({
  useInvoiceStoreInfo: () => ({ name: 'Tạp hóa Minh Anh', address: null, phone: null }),
}))
vi.mock('@/lib/toast', () => ({ showError, showSuccess }))

import { PrintSettingsForm } from './print-settings-form'

describe('PrintSettingsForm (BC-07)', () => {
  beforeEach(() => {
    mutateAsync.mockClear()
    showError.mockClear()
    settings = {
      id: '00000000-0000-4000-8000-000000000001',
      storeId: '00000000-0000-4000-8000-000000000002',
      logoUrl: null,
      slogan: 'Cũ',
      defaultPaperSize: '80mm',
      showOldDebt: false,
      showNewDebt: true,
      showCostPrice: false,
      showDiscount: true,
      showNotes: true,
      showCustomerName: true,
      showCustomerPhone: true,
      showSku: false,
      footerText: 'Cảm ơn quý khách!',
    }
  })
  afterEach(() => cleanup())

  it('sau khi tải lại, khổ giấy đã lưu vẫn hiện và sửa slogan rồi lưu gửi đúng khổ giấy', async () => {
    render(<PrintSettingsForm />)
    const trigger = screen.getAllByRole('combobox')[0]!
    await waitFor(() => expect(trigger.textContent).toContain('Thermal 80mm'))
    // Chưa sửa gì thì nút lưu phải tắt
    expect(screen.getByRole('button', { name: 'Lưu cài đặt' })).toHaveProperty('disabled', true)

    fireEvent.change(screen.getByLabelText('Slogan'), { target: { value: 'Mới' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Lưu cài đặt' }))
    })
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    expect(mutateAsync.mock.calls[0]![0]).toMatchObject({ defaultPaperSize: '80mm', slogan: 'Mới' })
  })

  it('nhãn tùy chọn nợ đúng nghĩa (UX-09)', () => {
    render(<PrintSettingsForm />)
    expect(screen.getByText('Công nợ trước đơn', { selector: 'label' })).toBeTruthy()
    expect(screen.getByText('Tổng công nợ sau đơn', { selector: 'label' })).toBeTruthy()
    expect(screen.queryByText('Nợ mới')).toBeNull()
  })
})

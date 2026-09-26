// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/use-auth-store'

vi.mock('@/features/settings/store-settings-api', () => ({
  getStoreApi: vi.fn(async () => ({
    data: { name: 'Tạp hóa Minh Anh', address: '12 Lê Lợi, Huế', phone: '0234000111' },
  })),
}))
vi.mock('@/features/settings/print-settings-api', () => ({
  getPrintSettingsApi: vi.fn(async () => ({ data: { slogan: 'Vui lòng kiểm tra hàng' } })),
}))

import { useInvoiceStoreInfo } from './use-invoice-store-info'

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useInvoiceStoreInfo (BC-03)', () => {
  afterEach(() => {
    useAuthStore.setState({ user: null })
  })

  it('lấy tên, địa chỉ, SĐT từ cài đặt cửa hàng, không lấy tên nhân viên đang đăng nhập', async () => {
    useAuthStore.setState({
      user: { id: 'u1', storeId: 's1', name: 'Trần Thị Bình', role: 'staff' } as never,
    })
    const { result } = renderHook(() => useInvoiceStoreInfo(), { wrapper })
    await waitFor(() => expect(result.current.name).toBe('Tạp hóa Minh Anh'))
    expect(result.current).toEqual({
      name: 'Tạp hóa Minh Anh',
      address: '12 Lê Lợi, Huế',
      phone: '0234000111',
      slogan: 'Vui lòng kiểm tra hàng',
    })
  })
})

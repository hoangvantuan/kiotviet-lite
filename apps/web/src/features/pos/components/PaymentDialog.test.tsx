// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildVietQrPayload } from '@/lib/vietqr'

import { PaymentDialog } from './PaymentDialog'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/settings/store">{children}</a>,
}))

const BANK = {
  bankBin: '970436',
  bankAccountNumber: '0011223344',
  bankAccountName: 'NGUYEN VAN A',
}

function renderDialog(props: Partial<React.ComponentProps<typeof PaymentDialog>>) {
  const client = new QueryClient()
  return render(
    <QueryClientProvider client={client}>
      <PaymentDialog
        open
        onOpenChange={() => {}}
        grandTotal={125_000}
        customerId={null}
        customerName={null}
        onComplete={() => {}}
        {...props}
      />
    </QueryClientProvider>,
  )
}

afterEach(() => cleanup())

describe('POS-07: VietQR trong hộp thanh toán', () => {
  it('chọn QR: mã chứa tài khoản cửa hàng, đúng số tiền và nội dung là mã tạm của đơn', () => {
    renderDialog({ defaultMethod: 'qr', bank: BANK, transferNote: 'TT 0192C3A4' })
    const qr = screen.getByTestId('vietqr-code')
    expect(qr.getAttribute('data-payload')).toBe(
      buildVietQrPayload({
        bankBin: '970436',
        accountNumber: '0011223344',
        amount: 125_000,
        note: 'TT 0192C3A4',
      }),
    )
    expect(screen.getByText('TT 0192C3A4')).toBeTruthy()
    expect(screen.getByText('Vietcombank')).toBeTruthy()
  })

  it('chọn chuyển khoản cũng hiện mã để khách quét', () => {
    renderDialog({ defaultMethod: 'transfer', bank: BANK, transferNote: 'TT 0192C3A4' })
    expect(screen.getByTestId('vietqr-code')).toBeTruthy()
  })

  it('cửa hàng chưa cấu hình tài khoản: hướng dẫn vào Cài đặt cửa hàng, không sinh mã', () => {
    renderDialog({ defaultMethod: 'qr', bank: null, transferNote: 'TT 0192C3A4' })
    expect(screen.queryByTestId('vietqr-code')).toBeNull()
    expect(screen.getByTestId('vietqr-not-configured').textContent).toContain('Cài đặt cửa hàng')
  })
})

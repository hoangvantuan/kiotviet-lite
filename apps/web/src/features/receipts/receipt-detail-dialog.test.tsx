// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ReceiptDetail } from '@kiotviet-lite/shared'

import { ReceiptDetailDialog } from './receipt-detail-dialog'
import { ReceiptPrintTemplate } from './receipt-print-template'

const receipt: ReceiptDetail = {
  id: '00000000-0000-4000-8000-00000000abcd',
  customerId: '00000000-0000-4000-8000-000000000001',
  customerName: 'Khách nợ',
  customerCode: 'KH000001',
  customerPhone: null,
  amount: 60_000,
  note: null,
  allocationCount: 3,
  createdBy: '00000000-0000-4000-8000-000000000002',
  createdByName: 'Chủ',
  createdAt: '2026-09-25T08:00:00.000Z',
  debtAfter: 190_000,
  status: 'active',
  cancelledAt: null,
  cancelledBy: null,
  cancelledByName: null,
  cancelReason: null,
  allocations: [
    {
      id: '00000000-0000-4000-8000-000000000011',
      debtId: '00000000-0000-4000-8000-000000000021',
      orderId: null,
      orderCode: null,
      type: 'opening',
      amount: 30_000,
      debtRemainingAfter: 0,
    },
    {
      id: '00000000-0000-4000-8000-000000000012',
      debtId: '00000000-0000-4000-8000-000000000022',
      orderId: null,
      orderCode: null,
      type: 'adjustment',
      amount: 20_000,
      debtRemainingAfter: 0,
    },
    {
      id: '00000000-0000-4000-8000-000000000013',
      debtId: '00000000-0000-4000-8000-000000000023',
      orderId: '00000000-0000-4000-8000-000000000031',
      orderCode: 'HD-260925-0001',
      type: 'sale',
      amount: 10_000,
      debtRemainingAfter: 140_000,
    },
  ],
}

vi.mock('./use-receipts', () => ({
  useReceiptQuery: () => ({ data: receipt, isLoading: false }),
  useCancelReceiptMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
}))

/** Cột đầu của từng dòng phân bổ trong bảng. */
function allocationLabels(table: HTMLElement) {
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent)
}

afterEach(() => cleanup())

describe('Nhãn khoản nợ trên phiếu thu', () => {
  it('chi tiết phiếu thu ghi mã đơn, Nợ đầu kỳ, Điều chỉnh tăng nợ theo type', () => {
    render(<ReceiptDetailDialog open onOpenChange={() => {}} receiptId={receipt.id} />)
    const table = within(screen.getByRole('dialog')).getByRole('table')
    expect(allocationLabels(table)).toEqual(['Nợ đầu kỳ', 'Điều chỉnh tăng nợ', 'HD-260925-0001'])
  })

  it('bản in phiếu thu ghi nhãn giống chi tiết', () => {
    const { container } = render(<ReceiptPrintTemplate receipt={receipt} />)
    const table = container.querySelector('table') as HTMLElement
    expect(allocationLabels(table)).toEqual(['Nợ đầu kỳ', 'Điều chỉnh tăng nợ', 'HD-260925-0001'])
  })
})

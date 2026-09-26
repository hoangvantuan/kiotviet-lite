// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { OrderDetail } from '../types'
import { OrderCompletionDialog } from './OrderCompletionDialog'

const printOrder = vi.hoisted(() => vi.fn())

vi.mock('@/features/settings/use-print-settings', () => ({
  usePrintSettingsQuery: () => ({ data: undefined }),
}))
vi.mock('../../orders/use-invoice-store-info', () => ({ useInvoiceStoreInfo: () => ({}) }))
vi.mock('../../orders/order-invoice-template', () => ({
  OrderInvoiceA4: () => null,
  OrderInvoiceA5: () => null,
  OrderInvoiceThermal: () => null,
}))
vi.mock('../../orders/use-print-order', () => ({
  getDefaultFormat: () => 'thermal-80',
  toThermalOrder: (o: unknown) => o,
  usePrintOrder: () => ({ printOrder }),
}))

// POS-17: hộp thoại hoàn thành đơn không tự đóng; In và Đơn hàng mới có phím tắt

const ORDER: OrderDetail = {
  id: 'o1',
  orderNumber: 'HD-260926-0001',
  customerId: null,
  subtotal: 100_000,
  discountAmount: 0,
  total: 100_000,
  paymentMethod: 'cash',
  paymentStatus: 'paid',
  cashAmount: 100_000,
  transferAmount: null,
  debtAmount: 0,
  change: 0,
  note: null,
  status: 'completed',
  items: [],
  createdAt: '2026-09-26T00:00:00.000Z',
}

function renderDialog(onNewOrder = vi.fn(), onOpenChange = vi.fn()) {
  render(
    <OrderCompletionDialog
      open
      onOpenChange={onOpenChange}
      order={ORDER}
      onNewOrder={onNewOrder}
    />,
  )
  return { onNewOrder, onOpenChange }
}

beforeEach(() => {
  vi.useFakeTimers()
  printOrder.mockReset()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('POS-17: hộp thoại hoàn thành đơn', () => {
  it('không tự đóng sau vài giây', () => {
    const { onNewOrder, onOpenChange } = renderDialog()
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(onNewOrder).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByText('HD-260926-0001')).toBeTruthy()
    expect(screen.queryByText(/Tự động đóng/)).toBeNull()
  })

  it('chọn sẵn nút Đơn hàng mới; Enter mở đơn mới', () => {
    const { onNewOrder } = renderDialog()
    const newOrder = screen.getByRole('button', { name: 'Đơn hàng mới' })
    expect(document.activeElement).toBe(newOrder)
    fireEvent.keyDown(newOrder, { key: 'Enter' })
    expect(onNewOrder).toHaveBeenCalledTimes(1)
  })

  it('P hoặc Ctrl+P in hoá đơn theo khổ mặc định', () => {
    renderDialog()
    const newOrder = screen.getByRole('button', { name: 'Đơn hàng mới' })
    fireEvent.keyDown(newOrder, { key: 'p' })
    fireEvent.keyDown(newOrder, { key: 'p', ctrlKey: true })
    expect(printOrder).toHaveBeenCalledTimes(2)
    expect(printOrder.mock.calls[0]?.[0]).toMatchObject({ format: 'thermal-80' })
  })

  it('bấm nút In hoá đơn thì in, không mở đơn mới', () => {
    const { onNewOrder } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /In hoá đơn/ }))
    expect(printOrder).toHaveBeenCalledTimes(1)
    expect(onNewOrder).not.toHaveBeenCalled()
  })
})

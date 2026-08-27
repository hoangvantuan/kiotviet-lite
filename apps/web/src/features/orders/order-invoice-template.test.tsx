import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PrintSettingsResponse } from '@kiotviet-lite/shared'

import { usePrintStore } from '@/stores/use-print-store'

vi.mock('@/stores/use-print-store', () => {
  let state: { activePrintFormat: string | null } = { activePrintFormat: null }
  const store = <T,>(selector: (s: typeof state) => T): T => selector(state)
  store.setState = (newState: Partial<typeof state>) => {
    state = { ...state, ...newState }
  }
  store.getState = () => state
  return { usePrintStore: store }
})

import { OrderInvoiceA4, OrderInvoiceA5, OrderInvoiceThermal } from './order-invoice-template'
import type { OrderDetailResponse } from './orders-api'

const mockOrder: OrderDetailResponse = {
  id: 'ord-123',
  orderNumber: 'HD-260827-0001',
  customerId: 'cust-123',
  customerName: 'Nguyễn Văn A',
  customerPhone: '0987654321',
  customerGroupName: 'Khách VIP',
  createdByName: 'Thu ngân 1',
  subtotal: 90000,
  discountType: 'amount',
  discountValue: 5000,
  discountAmount: 5000,
  total: 85000,
  paymentMethod: 'cash',
  paymentStatus: 'partial',
  cashAmount: 65000,
  transferAmount: null,
  change: 0,
  paidAmount: 65000,
  debtAmount: 20000,
  oldDebt: 50000,
  note: 'Giao hàng buổi sáng',
  status: 'completed',
  createdAt: '2026-08-27T10:30:00.000Z',
  updatedAt: '2026-08-27T10:30:00.000Z',
  items: [
    {
      id: 'item-1',
      productId: 'prod-1',
      variantId: 'var-1',
      productName: 'Sữa tươi Tiệt trùng',
      variantName: '1 Lít',
      unit: 'Hộp',
      unitPrice: 35000,
      quantity: 2,
      discountType: 'amount',
      discountValue: 5000,
      discountAmount: 5000,
      lineTotal: 65000,
      originalPrice: 35000,
      priceOverride: false,
      sku: 'SUA-001',
      costPrice: 28000,
    },
    {
      id: 'item-2',
      productId: 'prod-2',
      variantId: null,
      productName: 'Bánh mì sandwich',
      variantName: null,
      unit: 'Gói',
      unitPrice: 20000,
      quantity: 1,
      discountType: null,
      discountValue: 0,
      discountAmount: 0,
      lineTotal: 20000,
      originalPrice: 20000,
      priceOverride: false,
      sku: 'BM-002',
      costPrice: 15000,
    },
  ],
}

const mockStore = {
  name: 'Cửa hàng Tạp Hóa Xanh',
  address: '123 Đường ABC, Hà Nội',
  phone: '0901234567',
  slogan: 'Uy tín tạo niềm tin',
}

const fullPrintSettings: PrintSettingsResponse = {
  id: 'set-1',
  storeId: 'store-1',
  logoUrl: 'https://example.com/logo.png',
  slogan: 'Slogan tuỳ chỉnh',
  defaultPaperSize: '58mm',
  showCustomerName: true,
  showCustomerPhone: true,
  showDiscount: true,
  showSku: true,
  showOldDebt: true,
  showNewDebt: true,
  showCostPrice: true,
  showNotes: true,
  footerText: 'Cảm ơn và hẹn gặp lại!',
}

const minimalPrintSettings: PrintSettingsResponse = {
  id: 'set-2',
  storeId: 'store-1',
  logoUrl: null,
  slogan: null,
  defaultPaperSize: '58mm',
  showCustomerName: false,
  showCustomerPhone: false,
  showDiscount: false,
  showSku: false,
  showOldDebt: false,
  showNewDebt: false,
  showCostPrice: false,
  showNotes: false,
  footerText: 'Tạm biệt!',
}

describe('OrderInvoiceThermal template', () => {
  beforeEach(() => {
    usePrintStore.setState({ activePrintFormat: 'thermal-58' })
  })

  it('render đầy đủ các trường khi cờ bật', () => {
    const html = renderToStaticMarkup(
      <OrderInvoiceThermal order={mockOrder} store={mockStore} printSettings={fullPrintSettings} />,
    )

    expect(html).toContain('Cửa hàng Tạp Hóa Xanh')
    expect(html).toContain('Slogan tuỳ chỉnh')
    expect(html).toContain('HĐ: HD-260827-0001')
    expect(html).toContain('KH: Nguyễn Văn A')
    expect(html).toContain('SĐT: 0987654321')
    expect(html).toContain('[SUA-001]')
    expect(html).toContain('Chiết khấu')
    expect(html).toContain('Nợ cũ')
    expect(html).toContain('Còn nợ')
    expect(html).toContain('Giá vốn')
    expect(html).toContain('Ghi chú: Giao hàng buổi sáng')
    expect(html).toContain('Cảm ơn và hẹn gặp lại!')
  })

  it('ẩn các trường khi cờ tắt', () => {
    const html = renderToStaticMarkup(
      <OrderInvoiceThermal
        order={mockOrder}
        store={mockStore}
        printSettings={minimalPrintSettings}
      />,
    )

    expect(html).not.toContain('KH: Nguyễn Văn A')
    expect(html).not.toContain('SĐT: 0987654321')
    expect(html).not.toContain('[SUA-001]')
    expect(html).not.toContain('Chiết khấu')
    expect(html).not.toContain('Nợ cũ')
    expect(html).not.toContain('Còn nợ')
    expect(html).not.toContain('Giá vốn')
    expect(html).not.toContain('Ghi chú: Giao hàng buổi sáng')
    expect(html).toContain('Tạm biệt!')
  })
})

describe('OrderInvoiceA4 template', () => {
  beforeEach(() => {
    usePrintStore.setState({ activePrintFormat: 'a4' })
  })

  it('render đầy đủ các trường và bảng items trên A4 khi cờ bật', () => {
    const html = renderToStaticMarkup(
      <OrderInvoiceA4 order={mockOrder} store={mockStore} printSettings={fullPrintSettings} />,
    )

    expect(html).toContain('HÓA ĐƠN BÁN HÀNG')
    expect(html).toContain('Cửa hàng Tạp Hóa Xanh')
    expect(html).toContain('Slogan tuỳ chỉnh')
    expect(html).toContain('Nguyễn Văn A')
    expect(html).toContain('0987654321')
    expect(html).toContain('[SUA-001]')
    expect(html).toContain('[BM-002]')
    expect(html).toContain('Chiết khấu')
    expect(html).toContain('Nợ cũ')
    expect(html).toContain('Còn nợ')
    expect(html).toContain('Tổng giá vốn')
    expect(html).toContain('Ghi chú: Giao hàng buổi sáng')
    expect(html).toContain('Cảm ơn và hẹn gặp lại!')
  })

  it('ẩn các trường khi cờ tắt trên A4', () => {
    const html = renderToStaticMarkup(
      <OrderInvoiceA4 order={mockOrder} store={mockStore} printSettings={minimalPrintSettings} />,
    )

    expect(html).not.toContain('Khách hàng:')
    expect(html).not.toContain('SĐT: 0987654321')
    expect(html).not.toContain('[SUA-001]')
    expect(html).not.toContain('Nợ cũ')
    expect(html).not.toContain('Còn nợ')
    expect(html).not.toContain('Tổng giá vốn')
    expect(html).not.toContain('Ghi chú: Giao hàng buổi sáng')
    expect(html).toContain('Tạm biệt!')
  })
})

describe('OrderInvoiceA5 template', () => {
  beforeEach(() => {
    usePrintStore.setState({ activePrintFormat: 'a5' })
  })

  it('render đầy đủ các trường trên A5 khi cờ bật', () => {
    const html = renderToStaticMarkup(
      <OrderInvoiceA5 order={mockOrder} store={mockStore} printSettings={fullPrintSettings} />,
    )

    expect(html).toContain('HÓA ĐƠN BÁN HÀNG')
    expect(html).toContain('Nguyễn Văn A')
    expect(html).toContain('0987654321')
    expect(html).toContain('[SUA-001]')
    expect(html).toContain('Nợ cũ')
    expect(html).toContain('Còn nợ')
    expect(html).toContain('Giá vốn')
    expect(html).toContain('Ghi chú: Giao hàng buổi sáng')
    expect(html).toContain('Cảm ơn và hẹn gặp lại!')
  })

  it('ẩn các trường khi cờ tắt trên A5', () => {
    const html = renderToStaticMarkup(
      <OrderInvoiceA5 order={mockOrder} store={mockStore} printSettings={minimalPrintSettings} />,
    )

    expect(html).not.toContain('KH:')
    expect(html).not.toContain('SĐT: 0987654321')
    expect(html).not.toContain('[SUA-001]')
    expect(html).not.toContain('Nợ cũ')
    expect(html).not.toContain('Còn nợ')
    expect(html).not.toContain('Giá vốn')
    expect(html).not.toContain('Ghi chú: Giao hàng buổi sáng')
    expect(html).toContain('Tạm biệt!')
  })
})

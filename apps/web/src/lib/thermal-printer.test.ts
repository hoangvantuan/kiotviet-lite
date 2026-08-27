import { describe, expect, it } from 'vitest'

import {
  buildOrderReceipt,
  type PrintOptions,
  type ThermalOrder,
  type ThermalStoreInfo,
} from './thermal-printer'

const mockStore: ThermalStoreInfo = {
  name: 'Cửa hàng Tạp Hóa Xanh',
  address: '123 Đường ABC, Hà Nội',
  phone: '0901234567',
  slogan: 'Uy tín tạo niềm tin',
}

const mockOrder: ThermalOrder = {
  orderNumber: 'HD-260827-0001',
  createdAt: '2026-08-27T10:30:00.000Z',
  customerName: 'Nguyễn Văn A',
  customerPhone: '0987654321',
  items: [
    {
      productName: 'Sữa tươi Tiệt trùng',
      variantName: '1 Lít',
      unit: 'Hộp',
      quantity: 2,
      unitPrice: 35000,
      discountAmount: 5000,
      lineTotal: 65000,
      sku: 'SUA-001',
      costPrice: 28000,
    },
    {
      productName: 'Bánh mì sandwich',
      variantName: null,
      unit: 'Gói',
      quantity: 1,
      unitPrice: 20000,
      discountAmount: 0,
      lineTotal: 20000,
      sku: 'BM-002',
      costPrice: 15000,
    },
  ],
  subtotal: 90000,
  discountAmount: 5000,
  total: 85000,
  paymentMethod: 'cash',
  cashAmount: 100000,
  paidAmount: 85000,
  change: 15000,
  debtAmount: 20000,
  oldDebt: 50000,
  note: 'Giao hàng buổi sáng',
}

function decodeBuffer(buf: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(buf)
}

describe('thermal-printer buildOrderReceipt', () => {
  it('in đúng thông tin cơ bản với cấu hình mặc định (58mm)', () => {
    const options: PrintOptions = {
      paperWidth: '58mm',
      showCustomerName: true,
      showCustomerPhone: true,
      showDiscount: true,
      showSku: false,
      showOldDebt: false,
      showNewDebt: true,
      showCostPrice: false,
      showNotes: true,
      footerText: 'Cảm ơn và hẹn gặp lại!',
    }

    const buf = buildOrderReceipt(mockOrder, mockStore, options)
    const text = decodeBuffer(buf)

    expect(text).toContain('Cửa hàng Tạp Hóa Xanh')
    expect(text).toContain('Uy tín tạo niềm tin')
    expect(text).toContain('HĐ:')
    expect(text).toContain('HD-260827-0')
    expect(text).toContain('KH: Nguyễn Văn A')
    expect(text).toContain('SĐT: 0987654321')
    expect(text).toContain('Chiết khấu:')
    expect(text).toContain('Còn nợ:')
    expect(text).toContain('Ghi chú: Giao hàng buổi sáng')
    expect(text).toContain('Cảm ơn và hẹn gặp lại!')
    expect(text).not.toContain('SUA-001')
    expect(text).not.toContain('Nợ cũ:')
    expect(text).not.toContain('Giá vốn:')
  })

  it('tôn trọng các toggle tắt: ẩn tên KH, SĐT, chiết khấu, nợ, ghi chú', () => {
    const options: PrintOptions = {
      paperWidth: '58mm',
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

    const buf = buildOrderReceipt(mockOrder, mockStore, options)
    const text = decodeBuffer(buf)

    expect(text).not.toContain('KH: Nguyễn Văn A')
    expect(text).not.toContain('SĐT: 0987654321')
    expect(text).not.toContain('Chiết khấu:')
    expect(text).not.toContain('Còn nợ:')
    expect(text).not.toContain('Nợ cũ:')
    expect(text).not.toContain('Ghi chú:')
    expect(text).toContain('Tạm biệt!')
  })

  it('in SKU, Nợ cũ, Giá vốn khi các toggle tương ứng được bật', () => {
    const options: PrintOptions = {
      paperWidth: '80mm',
      showCustomerName: true,
      showCustomerPhone: true,
      showDiscount: true,
      showSku: true,
      showOldDebt: true,
      showNewDebt: true,
      showCostPrice: true,
      showNotes: true,
    }

    const buf = buildOrderReceipt(mockOrder, mockStore, options)
    const text = decodeBuffer(buf)

    expect(text).toContain('[SUA-001]')
    expect(text).toContain('[BM-002]')
    expect(text).toContain('Nợ cũ:')
    expect(text).toContain('Còn nợ:')
    expect(text).toContain('Giá vốn:')
  })

  it('in đúng nhãn BẢN IN LẠI khi isReprint=true', () => {
    const options: PrintOptions = {
      paperWidth: '58mm',
      isReprint: true,
    }

    const buf = buildOrderReceipt(mockOrder, mockStore, options)
    const text = decodeBuffer(buf)

    expect(text).toContain('*** BẢN IN LẠI ***')
  })
})

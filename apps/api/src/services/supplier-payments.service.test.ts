import { describe, expect, it } from 'vitest'

import {
  createSupplierPayment,
  formatVnd,
  getSupplierPayment,
  listSupplierPayments,
  toSupplierPaymentDetail,
  toSupplierPaymentListItem,
} from './supplier-payments.service.js'

describe('supplier-payments.service exports', () => {
  it('exports all public functions', () => {
    expect(typeof createSupplierPayment).toBe('function')
    expect(typeof listSupplierPayments).toBe('function')
    expect(typeof getSupplierPayment).toBe('function')
  })
})

describe('formatVnd', () => {
  it('formats integer amount with Vietnamese locale', () => {
    expect(formatVnd(1_000_000)).toBe('1.000.000đ')
  })

  it('formats zero', () => {
    expect(formatVnd(0)).toBe('0đ')
  })

  it('formats small amount', () => {
    expect(formatVnd(500)).toBe('500đ')
  })

  it('formats large amount', () => {
    expect(formatVnd(99_999_999_999)).toContain('đ')
  })
})

describe('toSupplierPaymentListItem', () => {
  const baseRow = {
    id: 'pay-1',
    supplierId: 'sup-1',
    supplierName: 'NCC Test',
    supplierPhone: '0901000000',
    amount: 500_000,
    note: 'Trả nợ tháng 4',
    createdBy: 'user-1',
    createdByName: 'Nguyễn Văn A',
    createdAt: new Date('2026-04-30T10:00:00Z'),
  }

  it('maps all fields correctly', () => {
    const item = toSupplierPaymentListItem(baseRow)
    expect(item).toEqual({
      id: 'pay-1',
      supplierId: 'sup-1',
      supplierName: 'NCC Test',
      supplierPhone: '0901000000',
      amount: 500_000,
      note: 'Trả nợ tháng 4',
      createdBy: 'user-1',
      createdByName: 'Nguyễn Văn A',
      createdAt: '2026-04-30T10:00:00.000Z',
    })
  })

  it('converts amount to number (handles decimal string from DB)', () => {
    const row = { ...baseRow, amount: '300000' as unknown as number }
    const item = toSupplierPaymentListItem(row)
    expect(item.amount).toBe(300_000)
    expect(typeof item.amount).toBe('number')
  })

  it('converts createdAt to ISO string', () => {
    const item = toSupplierPaymentListItem(baseRow)
    expect(item.createdAt).toBe('2026-04-30T10:00:00.000Z')
  })

  it('handles null supplierName and supplierPhone', () => {
    const row = { ...baseRow, supplierName: null, supplierPhone: null }
    const item = toSupplierPaymentListItem(row)
    expect(item.supplierName).toBeNull()
    expect(item.supplierPhone).toBeNull()
  })

  it('handles null note', () => {
    const row = { ...baseRow, note: null }
    const item = toSupplierPaymentListItem(row)
    expect(item.note).toBeNull()
  })

  it('handles null createdByName', () => {
    const row = { ...baseRow, createdByName: null }
    const item = toSupplierPaymentListItem(row)
    expect(item.createdByName).toBeNull()
  })
})

describe('toSupplierPaymentDetail', () => {
  const baseRow = {
    id: 'pay-1',
    supplierId: 'sup-1',
    supplierName: 'NCC Test',
    supplierPhone: '0901000000',
    amount: 500_000,
    note: null,
    createdBy: 'user-1',
    createdByName: 'Owner',
    createdAt: new Date('2026-04-30T10:00:00Z'),
  }

  it('includes debtAfter when provided', () => {
    const detail = toSupplierPaymentDetail(baseRow, 200_000)
    expect(detail.debtAfter).toBe(200_000)
  })

  it('defaults debtAfter to null', () => {
    const detail = toSupplierPaymentDetail(baseRow)
    expect(detail.debtAfter).toBeNull()
  })

  it('debtAfter = 0 when fully paid', () => {
    const detail = toSupplierPaymentDetail(baseRow, 0)
    expect(detail.debtAfter).toBe(0)
  })

  it('inherits all list item fields', () => {
    const detail = toSupplierPaymentDetail(baseRow, 100_000)
    expect(detail.id).toBe('pay-1')
    expect(detail.supplierId).toBe('sup-1')
    expect(detail.amount).toBe(500_000)
    expect(detail.createdAt).toBe('2026-04-30T10:00:00.000Z')
  })
})

import { describe, expect, it } from 'vitest'

import {
  createReceipt,
  formatVnd,
  getReceipt,
  listCustomerOpenDebts,
  listReceipts,
  toOpenDebtItem,
  toReceiptListItem,
} from './receipts.service.js'

describe('receipts.service exports', () => {
  it('exports all public functions', () => {
    expect(typeof createReceipt).toBe('function')
    expect(typeof listReceipts).toBe('function')
    expect(typeof getReceipt).toBe('function')
    expect(typeof listCustomerOpenDebts).toBe('function')
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

describe('toReceiptListItem', () => {
  const baseRow = {
    id: 'receipt-1',
    customerId: 'cust-1',
    customerName: 'Nguyễn Văn A',
    customerPhone: '0901000000',
    amount: 250_000,
    note: 'Thu nợ tháng 4',
    allocationCount: 2,
    createdBy: 'user-1',
    createdByName: 'Manager',
    createdAt: new Date('2026-04-30T10:00:00Z'),
  }

  it('maps all fields correctly', () => {
    const item = toReceiptListItem(baseRow)
    expect(item).toEqual({
      id: 'receipt-1',
      customerId: 'cust-1',
      customerName: 'Nguyễn Văn A',
      customerPhone: '0901000000',
      amount: 250_000,
      note: 'Thu nợ tháng 4',
      allocationCount: 2,
      createdBy: 'user-1',
      createdByName: 'Manager',
      createdAt: '2026-04-30T10:00:00.000Z',
    })
  })

  it('converts amount to number (handles bigint string from DB)', () => {
    const row = { ...baseRow, amount: '300000' as unknown as number }
    const item = toReceiptListItem(row)
    expect(item.amount).toBe(300_000)
    expect(typeof item.amount).toBe('number')
  })

  it('converts allocationCount to number', () => {
    const row = { ...baseRow, allocationCount: '5' as unknown as number }
    const item = toReceiptListItem(row)
    expect(item.allocationCount).toBe(5)
    expect(typeof item.allocationCount).toBe('number')
  })

  it('converts createdAt to ISO string', () => {
    const item = toReceiptListItem(baseRow)
    expect(item.createdAt).toBe('2026-04-30T10:00:00.000Z')
  })

  it('handles null customerName and customerPhone (orphan customer)', () => {
    const row = { ...baseRow, customerName: null, customerPhone: null }
    const item = toReceiptListItem(row)
    expect(item.customerName).toBeNull()
    expect(item.customerPhone).toBeNull()
  })

  it('handles null note', () => {
    const row = { ...baseRow, note: null }
    const item = toReceiptListItem(row)
    expect(item.note).toBeNull()
  })

  it('handles null createdByName', () => {
    const row = { ...baseRow, createdByName: null }
    const item = toReceiptListItem(row)
    expect(item.createdByName).toBeNull()
  })
})

describe('toOpenDebtItem', () => {
  const baseRow = {
    id: 'debt-1',
    orderId: 'order-1',
    orderCode: 'ORD-001',
    amount: 500_000,
    paid: 100_000,
    remaining: 400_000,
    createdAt: new Date('2026-04-01T08:00:00Z'),
  }

  it('maps all fields correctly', () => {
    const item = toOpenDebtItem(baseRow)
    expect(item).toEqual({
      id: 'debt-1',
      orderId: 'order-1',
      orderCode: 'ORD-001',
      amount: 500_000,
      paid: 100_000,
      remaining: 400_000,
      createdAt: '2026-04-01T08:00:00.000Z',
    })
  })

  it('converts numeric fields properly', () => {
    const row = {
      ...baseRow,
      amount: '500000' as unknown as number,
      paid: '100000' as unknown as number,
      remaining: '400000' as unknown as number,
    }
    const item = toOpenDebtItem(row)
    expect(item.amount).toBe(500_000)
    expect(item.paid).toBe(100_000)
    expect(item.remaining).toBe(400_000)
  })

  it('handles null orderCode', () => {
    const row = { ...baseRow, orderCode: null }
    const item = toOpenDebtItem(row)
    expect(item.orderCode).toBe('')
  })

  it('converts createdAt to ISO string', () => {
    const item = toOpenDebtItem(baseRow)
    expect(item.createdAt).toBe('2026-04-01T08:00:00.000Z')
  })
})

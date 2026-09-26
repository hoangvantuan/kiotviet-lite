import { describe, expect, it } from 'vitest'

import { defaultRefundMethod } from './cash-management'

const order = (
  paymentMethod: string,
  cashAmount: number | null,
  transferAmount: number | null,
) => ({
  paymentMethod,
  cashAmount,
  transferAmount,
})

describe('defaultRefundMethod (TIEN-02)', () => {
  it('đơn tiền mặt hoàn tiền mặt; đơn chuyển khoản, QR hoàn chuyển khoản', () => {
    expect(defaultRefundMethod(order('cash', 100_000, null))).toBe('cash')
    expect(defaultRefundMethod(order('transfer', null, null))).toBe('transfer')
    expect(defaultRefundMethod(order('qr', null, null))).toBe('transfer')
  })

  it('đơn kết hợp hoàn theo kênh chiếm phần lớn, bằng nhau thì tiền mặt', () => {
    expect(defaultRefundMethod(order('combined', 30_000, 70_000))).toBe('transfer')
    expect(defaultRefundMethod(order('combined', 70_000, 30_000))).toBe('cash')
    expect(defaultRefundMethod(order('combined', 50_000, 50_000))).toBe('cash')
  })

  it('đơn ghi nợ trả trước chuyển khoản hoàn chuyển khoản; không trả trước thì tiền mặt', () => {
    expect(defaultRefundMethod(order('debt', null, 80_000))).toBe('transfer')
    expect(defaultRefundMethod(order('debt', 50_000, null))).toBe('cash')
    expect(defaultRefundMethod(order('debt', null, null))).toBe('cash')
  })
})

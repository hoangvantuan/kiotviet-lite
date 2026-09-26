import { describe, expect, it } from 'vitest'

import {
  defaultRefundMethod,
  orderPaidByChannel,
  refundableByChannel,
  refundExceedsChannel,
} from './cash-management'

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

describe('hoàn vượt số khách đã trả theo kênh (TIEN-111)', () => {
  const paid = (paymentMethod: string, cashAmount: number | null, transferAmount: number | null) =>
    orderPaidByChannel({ paymentMethod, total: 1_000_000, cashAmount, transferAmount, change: 0 })

  it('số khách đã trả theo từng kênh', () => {
    expect(paid('cash', 1_000_000, null)).toEqual({ cash: 1_000_000, transfer: 0 })
    expect(paid('qr', null, null)).toEqual({ cash: 0, transfer: 1_000_000 })
    expect(paid('combined', 10_000, 990_000)).toEqual({ cash: 10_000, transfer: 990_000 })
    expect(paid('debt', 100_000, null)).toEqual({ cash: 100_000, transfer: 0 })
    expect(
      orderPaidByChannel({
        paymentMethod: 'combined',
        total: 1_000_000,
        cashAmount: 500_000,
        transferAmount: 600_000,
        change: 100_000,
      }),
    ).toEqual({ cash: 400_000, transfer: 600_000 })
  })

  it('đơn 10.000 tiền mặt + 990.000 chuyển khoản: hoàn 1.000.000 tiền mặt là vượt quyền', () => {
    const refundable = refundableByChannel(paid('combined', 10_000, 990_000), {
      cash: 0,
      transfer: 0,
    })
    expect(refundExceedsChannel(refundable, 'cash', 1_000_000)).toBe(true)
    expect(refundExceedsChannel(refundable, 'cash', 10_000)).toBe(false)
    expect(refundExceedsChannel(refundable, 'qr', 990_000)).toBe(false)
    expect(refundExceedsChannel(refundable, null, 1_000_000)).toBe(false)
  })

  it('trừ phần các phiếu trả trước đã hoàn qua kênh đó, không xuống âm', () => {
    const refundable = refundableByChannel(paid('combined', 10_000, 990_000), {
      cash: 50_000,
      transfer: 90_000,
    })
    expect(refundable).toEqual({ cash: 0, transfer: 900_000 })
    expect(refundExceedsChannel(refundable, 'cash', 1)).toBe(true)
  })
})

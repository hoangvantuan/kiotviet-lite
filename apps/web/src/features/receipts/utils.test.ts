import { describe, expect, it } from 'vitest'

import type { OpenDebtItem } from '@kiotviet-lite/shared'

import { computeFifoAllocation } from './utils'

function makeDebt(id: string, orderCode: string, remaining: number): OpenDebtItem {
  return {
    id,
    orderId: id,
    orderCode,
    amount: remaining,
    paid: 0,
    remaining,
    createdAt: new Date().toISOString(),
  }
}

describe('computeFifoAllocation', () => {
  it('debts rỗng: trả allocations rỗng và unallocated = amount', () => {
    const r = computeFifoAllocation([], 100_000)
    expect(r.allocations).toEqual([])
    expect(r.unallocated).toBe(100_000)
  })

  it('amount = 0: không phân bổ', () => {
    const debts = [makeDebt('d1', 'O1', 100_000)]
    const r = computeFifoAllocation(debts, 0)
    expect(r.allocations).toEqual([])
    expect(r.unallocated).toBe(0)
  })

  it('1 debt vừa đủ amount', () => {
    const debts = [makeDebt('d1', 'O1', 100_000)]
    const r = computeFifoAllocation(debts, 100_000)
    expect(r.allocations).toEqual([{ debtId: 'd1', orderCode: 'O1', amount: 100_000 }])
    expect(r.unallocated).toBe(0)
  })

  it('1 debt amount nhỏ hơn remaining', () => {
    const debts = [makeDebt('d1', 'O1', 200_000)]
    const r = computeFifoAllocation(debts, 80_000)
    expect(r.allocations).toEqual([{ debtId: 'd1', orderCode: 'O1', amount: 80_000 }])
    expect(r.unallocated).toBe(0)
  })

  it('nhiều debts vừa đủ tổng amount', () => {
    const debts = [
      makeDebt('d1', 'O1', 100_000),
      makeDebt('d2', 'O2', 200_000),
      makeDebt('d3', 'O3', 150_000),
    ]
    const r = computeFifoAllocation(debts, 450_000)
    expect(r.allocations).toEqual([
      { debtId: 'd1', orderCode: 'O1', amount: 100_000 },
      { debtId: 'd2', orderCode: 'O2', amount: 200_000 },
      { debtId: 'd3', orderCode: 'O3', amount: 150_000 },
    ])
    expect(r.unallocated).toBe(0)
  })

  it('amount nằm giữa: tất toán debt 1 + một phần debt 2', () => {
    const debts = [
      makeDebt('d1', 'O1', 100_000),
      makeDebt('d2', 'O2', 200_000),
      makeDebt('d3', 'O3', 150_000),
    ]
    const r = computeFifoAllocation(debts, 250_000)
    expect(r.allocations).toEqual([
      { debtId: 'd1', orderCode: 'O1', amount: 100_000 },
      { debtId: 'd2', orderCode: 'O2', amount: 150_000 },
    ])
    expect(r.unallocated).toBe(0)
  })

  it('amount dư so với tổng debts: trả phần thừa ở unallocated', () => {
    const debts = [makeDebt('d1', 'O1', 100_000), makeDebt('d2', 'O2', 50_000)]
    const r = computeFifoAllocation(debts, 200_000)
    expect(r.allocations).toEqual([
      { debtId: 'd1', orderCode: 'O1', amount: 100_000 },
      { debtId: 'd2', orderCode: 'O2', amount: 50_000 },
    ])
    expect(r.unallocated).toBe(50_000)
  })

  it('amount nhỏ chỉ phân bổ 1 phần debt đầu', () => {
    const debts = [makeDebt('d1', 'O1', 100_000), makeDebt('d2', 'O2', 200_000)]
    const r = computeFifoAllocation(debts, 30_000)
    expect(r.allocations).toEqual([{ debtId: 'd1', orderCode: 'O1', amount: 30_000 }])
    expect(r.unallocated).toBe(0)
  })

  it('skip debts có remaining = 0 (không tạo allocation 0)', () => {
    const debts = [makeDebt('d1', 'O1', 0), makeDebt('d2', 'O2', 100_000)]
    const r = computeFifoAllocation(debts, 50_000)
    expect(r.allocations).toEqual([{ debtId: 'd2', orderCode: 'O2', amount: 50_000 }])
    expect(r.unallocated).toBe(0)
  })
})

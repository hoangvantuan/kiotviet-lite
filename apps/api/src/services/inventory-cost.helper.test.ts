import { describe, expect, it } from 'vitest'

import { allocateProportionally, computeWac } from './inventory-cost.helper.js'

describe('allocateProportionally', () => {
  it('Tổng phân bổ luôn đúng bằng số cần chia', () => {
    const cases: Array<[number[], number]> = [
      [[100_000, 100_000, 100_000], 100],
      [[1, 2, 3, 4, 5], 7],
      [[150_000], 150],
      [[999_999, 1, 1], 1_000],
      [[33, 33, 34], 99],
    ]
    for (const [weights, total] of cases) {
      const parts = allocateProportionally(weights, total)
      expect(parts.reduce((s, v) => s + v, 0)).toBe(total)
    }
  })

  it('Phần dư lớn nhất nhận thêm, hòa thì dòng trước', () => {
    expect(allocateProportionally([100_000, 100_000, 100_000], 100)).toEqual([34, 33, 33])
    expect(allocateProportionally([200_000, 100_000], 30_000)).toEqual([20_000, 10_000])
  })

  it('Không phần nào vượt quá trọng số của nó (chiết khấu không vượt thành tiền dòng)', () => {
    const weights = [1, 1, 1, 0, 997]
    const parts = allocateProportionally(weights, 1_000)
    parts.forEach((p, i) => expect(p).toBeLessThanOrEqual(weights[i]!))
    expect(parts[3]).toBe(0)
  })

  it('Tổng 0 hoặc trọng số 0 → toàn 0', () => {
    expect(allocateProportionally([10, 20], 0)).toEqual([0, 0])
    expect(allocateProportionally([0, 0], 50)).toEqual([0, 0])
  })

  it('Số lớn không tràn (BigInt)', () => {
    const parts = allocateProportionally([9_000_000_000_000, 1_000_000_000_000], 999_999_999)
    expect(parts.reduce((s, v) => s + v, 0)).toBe(999_999_999)
  })
})

describe('computeWac', () => {
  it('Dùng tổng tiền hàng thực của lô, làm tròn một lần ở kết quả', () => {
    expect(
      computeWac({ costBefore: 17_000, stockBefore: 60, quantity: 10, totalCost: 149_850 }),
    ).toBe(16_712)
  })

  it('Tồn trước ≤ 0 hoặc chưa có giá vốn → giá nhập thực của lô', () => {
    expect(computeWac({ costBefore: null, stockBefore: 5, quantity: 3, totalCost: 29_000 })).toBe(
      9_667,
    )
    expect(computeWac({ costBefore: 10_000, stockBefore: -2, quantity: 4, totalCost: 100 })).toBe(
      25,
    )
  })
})

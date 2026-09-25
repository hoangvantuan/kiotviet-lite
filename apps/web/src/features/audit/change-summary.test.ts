import { describe, expect, it } from 'vitest'

import { summariseChanges } from './change-summary'

describe('summariseChanges', () => {
  it('dịch khóa sang tiếng Việt kèm giá trị, không hiện tên khóa thô', () => {
    const text = summariseChanges({
      code: 'PK-001',
      itemCount: 3,
      totalDiffNegative: 2,
      totalDiffPositive: 1,
    })
    expect(text).toBe('Mã: PK-001, Số dòng: 3, Tổng chênh lệch giảm: 2, +1')
    expect(text).not.toMatch(/itemCount|totalDiffNegative/)
  })

  it('số tiền có đơn vị, before/after thành mũi tên, boolean thành Có/Không', () => {
    expect(summariseChanges({ amount: 150000 })).toBe('Số tiền: 150.000\xA0đ')
    expect(summariseChanges({ name: { before: 'A', after: 'B' } })).toBe('Tên: A → B')
    expect(summariseChanges({ isActive: { before: true, after: false } })).toBe(
      'Đang hoạt động: Có → Không',
    )
  })

  it('bỏ qua khóa id và khóa chưa có nhãn', () => {
    expect(summariseChanges({ customerId: 'uuid', orderedIds: ['a'], name: 'X' })).toBe('Tên: X')
    expect(summariseChanges({ customerId: 'uuid' })).toBe('')
  })

  it('rỗng hoặc null trả chuỗi rỗng', () => {
    expect(summariseChanges(null)).toBe('')
    expect(summariseChanges({})).toBe('')
  })
})

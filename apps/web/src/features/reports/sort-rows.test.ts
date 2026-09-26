import { describe, expect, it } from 'vitest'

import { nextSort, sortRows } from './sort-rows'

describe('sortRows (BC-17: bảng lợi nhuận sắp xếp theo cột)', () => {
  const rows = [
    { name: 'Bánh', profit: 50 },
    { name: 'Ấm', profit: 200 },
    { name: 'Cà phê', profit: -10 },
  ]

  it('sắp số theo giá trị, hai chiều', () => {
    expect(sortRows(rows, { key: 'profit', direction: 'desc' }).map((r) => r.profit)).toEqual([
      200, 50, -10,
    ])
    expect(sortRows(rows, { key: 'profit', direction: 'asc' }).map((r) => r.profit)).toEqual([
      -10, 50, 200,
    ])
  })

  it('sắp chuỗi theo tiếng Việt, không làm đổi mảng gốc', () => {
    expect(sortRows(rows, { key: 'name', direction: 'asc' }).map((r) => r.name)).toEqual([
      'Ấm',
      'Bánh',
      'Cà phê',
    ])
    expect(rows[0]!.name).toBe('Bánh')
  })

  it('bấm lại cột đang sắp thì đảo chiều, cột mới bắt đầu giảm dần', () => {
    expect(nextSort({ key: 'profit', direction: 'desc' }, 'profit')).toEqual({
      key: 'profit',
      direction: 'asc',
    })
    expect(nextSort({ key: 'profit', direction: 'asc' }, 'name')).toEqual({
      key: 'name',
      direction: 'desc',
    })
  })
})

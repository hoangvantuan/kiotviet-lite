import { describe, expect, it } from 'vitest'

import { getDebtStatusBadge } from './debt-status'

describe('getDebtStatusBadge (TIEN-112)', () => {
  const thresholds = [30, 60, 90]

  it('tuổi nợ tính theo ngày lịch Việt Nam: 23:30 ngày 25/08 xem 06:00 ngày 25/09 là 31 ngày', () => {
    const badge = getDebtStatusBadge(
      '2026-08-25T23:30:00+07:00',
      100_000,
      thresholds,
      new Date('2026-09-25T06:00:00+07:00'),
    )
    expect(badge.label).toBe('Nợ đã 31 ngày · Quá hạn 1 ngày')
  })

  it('tách tuổi nợ và số ngày quá hạn: nợ 46 ngày, ngưỡng 30 thì quá hạn 16 ngày', () => {
    const badge = getDebtStatusBadge(
      '2026-08-10T09:00:00+07:00',
      100_000,
      thresholds,
      new Date('2026-09-25T10:00:00+07:00'),
    )
    expect(badge.label).toBe('Nợ đã 46 ngày · Quá hạn 16 ngày')
  })

  it('trong ngưỡng thì Trong hạn', () => {
    const badge = getDebtStatusBadge(
      '2026-09-20T09:00:00+07:00',
      100_000,
      thresholds,
      new Date('2026-09-25T10:00:00+07:00'),
    )
    expect(badge.label).toBe('Trong hạn')
  })
})

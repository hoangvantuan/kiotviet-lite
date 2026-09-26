import { describe, expect, it } from 'vitest'

import { calendarDateKey, calendarDaysBetween } from './calendar.js'

describe('calendarDaysBetween (TIEN-112)', () => {
  it('đếm theo ngày lịch Việt Nam, không theo số lần 24 giờ', () => {
    const from = new Date('2026-08-25T23:30:00+07:00')
    const to = new Date('2026-09-25T06:00:00+07:00')
    expect(calendarDaysBetween(from, to)).toBe(31)
  })

  it('cùng ngày lịch là 0 dù khác ngày UTC', () => {
    expect(
      calendarDaysBetween(
        new Date('2026-09-26T00:10:00+07:00'),
        new Date('2026-09-26T23:50:00+07:00'),
      ),
    ).toBe(0)
  })

  it('khóa ngày theo múi giờ cửa hàng', () => {
    expect(calendarDateKey(new Date('2026-09-25T17:30:00Z'))).toBe('2026-09-26')
  })
})

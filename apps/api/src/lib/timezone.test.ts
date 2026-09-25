import { afterEach, describe, expect, it } from 'vitest'

import {
  assertStoreTimezoneConfig,
  daysBetweenDateKeys,
  formatLocalTime,
  getTimezoneOffset,
  lastLocalDays,
  localDateKey,
  parseDateRangeBoundary,
  sameMomentPreviousPeriod,
  startOfLocalPeriod,
} from './timezone.js'

describe('lastLocalDays: ngày theo lịch múi giờ cửa hàng', () => {
  afterEach(() => {
    delete process.env.STORE_TIMEZONE
    delete process.env.STORE_TIMEZONE_OFFSET
  })

  it('sau 17:00 UTC, hôm nay là ngày hôm sau theo giờ Việt Nam', () => {
    const { start, days } = lastLocalDays(7, new Date('2026-09-25T17:09:00Z'))
    expect(days.map((d) => d.key)).toEqual([
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
    ])
    // 2026-09-26 là thứ Bảy
    expect(days.at(-1)!.dayOfWeek).toBe(6)
    expect(start.toISOString()).toBe('2026-09-19T17:00:00.000Z')
  })

  it('trước 17:00 UTC, hôm nay trùng ngày UTC', () => {
    const { days } = lastLocalDays(1, new Date('2026-09-25T16:59:59Z'))
    expect(days).toEqual([{ key: '2026-09-25', dayOfWeek: 5 }])
  })

  it('qua ranh giới tháng', () => {
    const { days } = lastLocalDays(3, new Date('2026-10-01T02:00:00Z'))
    expect(days.map((d) => d.key)).toEqual(['2026-09-29', '2026-09-30', '2026-10-01'])
  })
})

describe('mốc kỳ theo lịch cửa hàng (R7)', () => {
  // 07:30 sáng thứ Bảy 26/09 giờ VN, tức 00:30 UTC
  const now = new Date('2026-09-26T00:30:00Z')

  it('khóa ngày và giờ hiển thị theo giờ cửa hàng', () => {
    expect(localDateKey(now)).toBe('2026-09-26')
    expect(localDateKey(new Date('2026-09-25T16:59:59Z'))).toBe('2026-09-25')
    expect(formatLocalTime(now)).toBe('07:30')
    expect(formatLocalTime(new Date('2026-09-25T17:05:00Z'))).toBe('00:05')
  })

  it('đầu kỳ hôm nay, tuần (thứ Hai), tháng, năm là 00:00 giờ VN', () => {
    expect(startOfLocalPeriod('today', now).toISOString()).toBe('2026-09-25T17:00:00.000Z')
    expect(startOfLocalPeriod('week', now).toISOString()).toBe('2026-09-20T17:00:00.000Z')
    expect(startOfLocalPeriod('month', now).toISOString()).toBe('2026-08-31T17:00:00.000Z')
    expect(startOfLocalPeriod('year', now).toISOString()).toBe('2025-12-31T17:00:00.000Z')
  })

  it('chủ nhật thuộc tuần bắt đầu thứ Hai trước đó', () => {
    const sunday = new Date('2026-09-27T10:00:00+07:00')
    expect(startOfLocalPeriod('week', sunday).toISOString()).toBe('2026-09-20T17:00:00.000Z')
  })

  it('cùng thời điểm kỳ trước, kẹp về cuối tháng khi tháng trước ngắn hơn', () => {
    expect(sameMomentPreviousPeriod('today', now).toISOString()).toBe('2026-09-25T00:30:00.000Z')
    expect(sameMomentPreviousPeriod('week', now).toISOString()).toBe('2026-09-19T00:30:00.000Z')
    expect(sameMomentPreviousPeriod('month', now).toISOString()).toBe('2026-08-26T00:30:00.000Z')
    const mar31 = new Date('2026-03-31T09:00:00+07:00')
    expect(localDateKey(sameMomentPreviousPeriod('month', mar31))).toBe('2026-02-28')
  })

  it('số ngày giữa hai khóa ngày', () => {
    expect(daysBetweenDateKeys('2026-08-27', '2026-09-26')).toBe(30)
    expect(daysBetweenDateKeys('2026-09-26', '2026-09-26')).toBe(0)
  })
})

describe('offset suy từ STORE_TIMEZONE (review #55)', () => {
  afterEach(() => {
    delete process.env.STORE_TIMEZONE
    delete process.env.STORE_TIMEZONE_OFFSET
  })

  it('đổi STORE_TIMEZONE thì mốc ngày đổi theo, không cần biến offset riêng', () => {
    process.env.STORE_TIMEZONE = 'Asia/Tokyo'
    expect(getTimezoneOffset()).toBe('+09:00')
    expect(parseDateRangeBoundary('2026-09-26', 'start')?.toISOString()).toBe(
      '2026-09-25T15:00:00.000Z',
    )
    expect(startOfLocalPeriod('today', new Date('2026-09-26T01:00:00Z')).toISOString()).toBe(
      '2026-09-25T15:00:00.000Z',
    )
  })

  it('múi giờ có giờ mùa hè dùng offset đúng của từng ngày', () => {
    process.env.STORE_TIMEZONE = 'Europe/Berlin'
    expect(parseDateRangeBoundary('2026-07-01', 'start')?.toISOString()).toBe(
      '2026-06-30T22:00:00.000Z',
    )
    expect(parseDateRangeBoundary('2026-12-01', 'end')?.toISOString()).toBe(
      '2026-12-01T22:59:59.999Z',
    )
  })

  it('mặc định Asia/Ho_Chi_Minh là +07:00', () => {
    expect(getTimezoneOffset()).toBe('+07:00')
    expect(() => assertStoreTimezoneConfig()).not.toThrow()
  })

  it('báo lỗi rõ khi STORE_TIMEZONE sai hoặc STORE_TIMEZONE_OFFSET cũ lệch', () => {
    process.env.STORE_TIMEZONE = 'Asia/Khong_Co'
    expect(() => assertStoreTimezoneConfig()).toThrow(/STORE_TIMEZONE không hợp lệ/)
    process.env.STORE_TIMEZONE = 'Asia/Tokyo'
    process.env.STORE_TIMEZONE_OFFSET = '+07:00'
    expect(() => assertStoreTimezoneConfig()).toThrow(/lệch/)
  })
})

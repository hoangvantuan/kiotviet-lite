import { afterEach, describe, expect, it } from 'vitest'

import { lastLocalDays } from './timezone.js'

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

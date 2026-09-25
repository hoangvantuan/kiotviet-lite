import { describe, expect, it } from 'vitest'

import { REPORT_DATE_PRESETS } from './date-presets'

describe('REPORT_DATE_PRESETS (BC-17)', () => {
  const now = new Date(2026, 8, 26, 10, 0)
  const range = (label: string) => REPORT_DATE_PRESETS.find((p) => p.label === label)!.getRange(now)

  it('"7 ngày" là đúng 7 ngày lịch tính cả hôm nay', () => {
    expect(range('7 ngày')).toEqual({ from: '2026-09-20', to: '2026-09-26' })
  })

  it('"30 ngày" là đúng 30 ngày lịch tính cả hôm nay', () => {
    expect(range('30 ngày')).toEqual({ from: '2026-08-28', to: '2026-09-26' })
  })
})

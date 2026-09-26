import { format, startOfMonth, startOfQuarter, subDays } from 'date-fns'

const key = (d: Date) => format(d, 'yyyy-MM-dd')

// BC-17: "N ngày" gồm cả hôm nay, tức từ (hôm nay - (N - 1)) tới hôm nay
export const REPORT_DATE_PRESETS = [
  { label: 'Hôm nay', getRange: (now = new Date()) => ({ from: key(now), to: key(now) }) },
  {
    label: '7 ngày',
    getRange: (now = new Date()) => ({ from: key(subDays(now, 6)), to: key(now) }),
  },
  {
    label: '30 ngày',
    getRange: (now = new Date()) => ({ from: key(subDays(now, 29)), to: key(now) }),
  },
  {
    label: 'Tháng này',
    getRange: (now = new Date()) => ({ from: key(startOfMonth(now)), to: key(now) }),
  },
  {
    label: 'Quý này',
    getRange: (now = new Date()) => ({ from: key(startOfQuarter(now)), to: key(now) }),
  },
]

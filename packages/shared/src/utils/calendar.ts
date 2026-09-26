/** Múi giờ mặc định của cửa hàng (API đọc STORE_TIMEZONE, mặc định giá trị này) */
export const DEFAULT_STORE_TIMEZONE = 'Asia/Ho_Chi_Minh'

/** Khóa ngày YYYY-MM-DD theo lịch của múi giờ cho trước, không phụ thuộc giờ máy */
export function calendarDateKey(date: Date, timeZone: string = DEFAULT_STORE_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/**
 * Số ngày lịch từ `from` tới `to` theo múi giờ cửa hàng (TIEN-112). Nợ phát sinh 23:30 ngày
 * 25/08 xem lúc 06:00 ngày 25/09 là 31 ngày, dù mới trôi qua 30 lần 24 giờ.
 */
export function calendarDaysBetween(
  from: Date,
  to: Date,
  timeZone: string = DEFAULT_STORE_TIMEZONE,
): number {
  const a = Date.parse(`${calendarDateKey(from, timeZone)}T00:00:00Z`)
  const b = Date.parse(`${calendarDateKey(to, timeZone)}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

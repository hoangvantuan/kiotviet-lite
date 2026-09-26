/**
 * Cấu hình múi giờ tập trung cho toàn bộ API.
 *
 * H11: Báo cáo lệch 7 giờ do hardcode 'Z' (UTC) thay vì múi giờ Việt Nam.
 * File này cung cấp hằng số và helper parse ngày dùng chung, đọc múi giờ
 * từ biến môi trường STORE_TIMEZONE (mặc định Asia/Ho_Chi_Minh).
 */
import { type AnyColumn, type SQL, sql } from 'drizzle-orm'

import { DEFAULT_STORE_TIMEZONE, orders } from '@kiotviet-lite/shared'

/**
 * Múi giờ mặc định. Đọc từ biến môi trường STORE_TIMEZONE,
 * mặc định 'Asia/Ho_Chi_Minh' (UTC+7).
 */
export function getStoreTimezone(): string {
  return process.env.STORE_TIMEZONE ?? DEFAULT_STORE_TIMEZONE
}

/**
 * Kiểm cấu hình múi giờ lúc khởi động: STORE_TIMEZONE phải là tên IANA hợp lệ. Biến cũ
 * STORE_TIMEZONE_OFFSET không còn được đọc (offset suy từ STORE_TIMEZONE), nếu còn đặt mà lệch
 * thì báo lỗi rõ thay vì âm thầm cắt ngày sai.
 */
export function assertStoreTimezoneConfig(now: Date = new Date()): void {
  const tz = getStoreTimezone()
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz })
  } catch {
    throw new Error(`STORE_TIMEZONE không hợp lệ: "${tz}" (cần tên IANA, ví dụ Asia/Ho_Chi_Minh)`)
  }
  const legacy = process.env.STORE_TIMEZONE_OFFSET
  if (legacy && legacy !== getTimezoneOffset(now)) {
    throw new Error(
      `STORE_TIMEZONE_OFFSET=${legacy} lệch với STORE_TIMEZONE=${tz} (${getTimezoneOffset(now)}). ` +
        'Bỏ STORE_TIMEZONE_OFFSET, offset được suy từ STORE_TIMEZONE.',
    )
  }
}

/** Offset (phút) của múi giờ cửa hàng tại một thời điểm, suy từ STORE_TIMEZONE bằng Intl. */
function offsetMinutesAt(at: Date): number {
  const p = localParts(at)
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((wallAsUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000)
}

/** Offset dạng "+07:00" của múi giờ cửa hàng tại thời điểm `at` (mặc định bây giờ). */
export function getTimezoneOffset(at: Date = new Date()): string {
  const minutes = offsetMinutesAt(at)
  const abs = Math.abs(minutes)
  const hh = String(Math.floor(abs / 60)).padStart(2, '0')
  const mm = String(abs % 60).padStart(2, '0')
  return `${minutes < 0 ? '-' : '+'}${hh}:${mm}`
}

/**
 * Giờ đồng hồ tại cửa hàng (ngày YYYY-MM-DD + "THH:mm:ss.SSS") thành thời điểm UTC.
 * Offset lấy đúng tại thời điểm đó nên múi giờ có giờ mùa hè cũng đúng.
 */
function localWallTimeToDate(dateKey: string, time: string): Date {
  const wall = Date.parse(`${dateKey}${time}Z`)
  const guess = wall - offsetMinutesAt(new Date(wall)) * 60_000
  return new Date(wall - offsetMinutesAt(new Date(guess)) * 60_000)
}

/**
 * Parse khoảng ngày từ chuỗi YYYY-MM-DD theo múi giờ cửa hàng.
 * Thay thế các hàm parseDateRange hardcode 'Z' rải rác.
 */
export function parseDateRangeLocal(from?: string, to?: string, defaultRangeDays = 30) {
  const now = new Date()
  return {
    start: from
      ? localWallTimeToDate(from, 'T00:00:00.000')
      : new Date(now.getTime() - defaultRangeDays * 86_400_000),
    end: to ? localWallTimeToDate(to, 'T23:59:59.999') : now,
  }
}

/**
 * Chuyển đổi chuỗi ngày/thời gian sang Date theo múi giờ cửa hàng (mặc định +07:00).
 * - Nếu là YYYY-MM-DD:
 *   - 'start' -> 00:00:00.000 + offset (đầu ngày)
 *   - 'end'   -> 23:59:59.999 + offset (cuối ngày)
 * - Nếu đã có giờ/offset đầy đủ: giữ nguyên.
 */
export function parseDateRangeBoundary(
  value: string | undefined,
  boundary: 'start' | 'end',
): Date | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return localWallTimeToDate(trimmed, boundary === 'start' ? 'T00:00:00.000' : 'T23:59:59.999')
  }
  return new Date(trimmed)
}

/**
 * Biểu thức SQL date_trunc theo múi giờ cửa hàng.
 * Dùng cho groupBy trong báo cáo doanh thu/lợi nhuận.
 */
export function dateTruncLocal(
  unit: 'day' | 'week' | 'month',
  column: typeof orders.createdAt = orders.createdAt,
): SQL {
  const tz = getStoreTimezone()
  return sql`date_trunc(${sql.raw(`'${unit}'`)}, ${column} AT TIME ZONE ${sql.raw(`'${tz}'`)})::date`
}

/**
 * n ngày gần nhất tính theo lịch của múi giờ cửa hàng, kết thúc ở hôm nay.
 * Khóa `key` (YYYY-MM-DD) khớp với `dateTruncLocal('day')`, nên dùng được làm khóa gộp.
 * Không dùng startOfDay của date-fns vì hàm đó theo múi giờ của tiến trình (UTC trên máy chủ),
 * từ 17:00 UTC trở đi "hôm nay" của tiến trình sẽ trễ một ngày so với giờ Việt Nam.
 */
export function lastLocalDays(
  n: number,
  now: Date = new Date(),
): { start: Date; days: Array<{ key: string; dayOfWeek: number }> } {
  const todayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: getStoreTimezone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  const [y, m, d] = todayKey.split('-').map(Number) as [number, number, number]
  const todayUtc = Date.UTC(y, m - 1, d)
  const days = Array.from({ length: n }, (_, i) => {
    const day = new Date(todayUtc - (n - 1 - i) * 86_400_000)
    return { key: day.toISOString().slice(0, 10), dayOfWeek: day.getUTCDay() }
  })
  return { start: localWallTimeToDate(days[0]!.key, 'T00:00:00.000'), days }
}

// ---------------------------------------------------------------------------
// R7: mọi mốc ngày và kỳ tính theo lịch của cửa hàng, không theo giờ tiến trình.
// Máy chủ chạy TZ=UTC nên startOfDay, getHours, toISOString().slice(0, 10) đều lệch 7 giờ
// với giờ Việt Nam. Các service chỉ được lấy mốc ngày qua các helper dưới đây.
// ---------------------------------------------------------------------------

interface LocalParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  ms: number
}

function localParts(d: Date): LocalParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: getStoreTimezone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
    ms: d.getUTCMilliseconds(),
  }
}

/** Ghép giờ địa phương thành Date, tháng và ngày tràn tự chuẩn hóa (tháng 13, ngày 0...). */
function fromLocal(year: number, month: number, day: number, time = 'T00:00:00.000'): Date {
  const key = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10)
  return localWallTimeToDate(key, time)
}

/** Ngày lịch YYYY-MM-DD theo múi giờ cửa hàng. */
export function localDateKey(d: Date = new Date()): string {
  const { year, month, day } = localParts(d)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Giờ:phút theo múi giờ cửa hàng, ví dụ "17:44" (thông báo khóa PIN, POS-10). */
export function formatLocalTime(d: Date): string {
  const { hour, minute } = localParts(d)
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export type LocalPeriod = 'today' | 'week' | 'month' | 'year'

/** Đầu kỳ theo lịch cửa hàng: 00:00 hôm nay, thứ Hai tuần này, ngày 1 tháng này, 1/1 năm nay. */
export function startOfLocalPeriod(period: LocalPeriod, now: Date = new Date()): Date {
  const { year, month, day } = localParts(now)
  switch (period) {
    case 'today':
      return fromLocal(year, month, day)
    case 'week': {
      const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
      return fromLocal(year, month, day - ((weekday + 6) % 7))
    }
    case 'month':
      return fromLocal(year, month, 1)
    case 'year':
      return fromLocal(year, 1, 1)
  }
}

/**
 * Cùng thời điểm này của kỳ trước theo lịch cửa hàng (hôm qua, tuần trước, tháng trước, năm trước).
 * Tháng trước không có ngày tương ứng thì lấy ngày cuối tháng (31/03 → 28/02), như subMonths.
 */
export function sameMomentPreviousPeriod(period: LocalPeriod, now: Date = new Date()): Date {
  if (period === 'today') return new Date(now.getTime() - 86_400_000)
  if (period === 'week') return new Date(now.getTime() - 7 * 86_400_000)
  const p = localParts(now)
  const year = period === 'year' ? p.year - 1 : p.year
  const month = period === 'month' ? p.month - 1 : p.month
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const time = `T${[p.hour, p.minute, p.second].map((n) => String(n).padStart(2, '0')).join(':')}.${String(p.ms).padStart(3, '0')}`
  return fromLocal(year, month, Math.min(p.day, daysInMonth), time)
}

/** Ngày lịch của một cột timestamptz theo múi giờ cửa hàng. */
export function localDateSql(column: AnyColumn | SQL): SQL {
  return sql`(${column} AT TIME ZONE ${sql.raw(`'${getStoreTimezone()}'`)})::date`
}

/**
 * Số ngày lịch từ một thời điểm tới hôm nay theo múi giờ cửa hàng (TIEN-112). Nợ phát sinh 23:30
 * ngày 25/08, xem lúc 06:00 ngày 25/09 là 31 ngày, không phải 30 ngày tròn 24 giờ.
 */
export function localDaysSinceSql(column: AnyColumn | SQL): SQL<number> {
  return sql<number>`(${localDateSql(sql`now()`)} - ${localDateSql(column)})`
}

/** Số ngày lịch giữa hai ngày YYYY-MM-DD (b trừ a). */
export function daysBetweenDateKeys(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

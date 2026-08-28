/**
 * Cấu hình múi giờ tập trung cho toàn bộ API.
 *
 * H11: Báo cáo lệch 7 giờ do hardcode 'Z' (UTC) thay vì múi giờ Việt Nam.
 * File này cung cấp hằng số và helper parse ngày dùng chung, đọc múi giờ
 * từ biến môi trường STORE_TIMEZONE (mặc định Asia/Ho_Chi_Minh).
 */
import { type SQL, sql } from 'drizzle-orm'

import { orders } from '@kiotviet-lite/shared'

/**
 * Múi giờ mặc định. Đọc từ biến môi trường STORE_TIMEZONE,
 * mặc định 'Asia/Ho_Chi_Minh' (UTC+7).
 */
export function getStoreTimezone(): string {
  return process.env.STORE_TIMEZONE ?? 'Asia/Ho_Chi_Minh'
}

/**
 * Offset chuỗi ISO cho múi giờ cửa hàng.
 * Dùng để ghép với chuỗi ngày YYYY-MM-DD khi parse thành Date.
 */
export function getTimezoneOffset(): string {
  return process.env.STORE_TIMEZONE_OFFSET ?? '+07:00'
}

/**
 * Parse khoảng ngày từ chuỗi YYYY-MM-DD theo múi giờ cửa hàng.
 * Thay thế các hàm parseDateRange hardcode 'Z' rải rác.
 */
export function parseDateRangeLocal(from?: string, to?: string, defaultRangeDays = 30) {
  const offset = getTimezoneOffset()
  const now = new Date()
  return {
    start: from
      ? new Date(`${from}T00:00:00${offset}`)
      : new Date(now.getTime() - defaultRangeDays * 86_400_000),
    end: to ? new Date(`${to}T23:59:59.999${offset}`) : now,
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
    const offset = getTimezoneOffset()
    const timeSuffix = boundary === 'start' ? `T00:00:00.000${offset}` : `T23:59:59.999${offset}`
    return new Date(`${trimmed}${timeSuffix}`)
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

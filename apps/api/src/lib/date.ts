/**
 * Chuẩn hóa ngày lịch YYYY-MM-DD theo múi giờ cửa hàng (mặc định Asia/Ho_Chi_Minh, UTC+7).
 * Đảm bảo tính nhất quán trên toàn bộ máy chủ (pos.routes, pricing.service, orders.service)
 * tránh lệch ngày do múi giờ UTC.
 */
export function toIsoDate(d: Date = new Date()): string {
  const tz = process.env.STORE_TIMEZONE ?? 'Asia/Ho_Chi_Minh'
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

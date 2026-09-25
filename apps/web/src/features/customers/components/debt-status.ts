import { calendarDaysBetween } from '@kiotviet-lite/shared'

// TIEN-112: tuổi nợ là số ngày lịch (giờ cửa hàng) kể từ ngày phát sinh; quá hạn là phần vượt
// ngưỡng đầu tiên của cửa hàng. Hai con số khác nhau nên hiện riêng, không gọi tuổi nợ là quá hạn.
export function getDebtStatusBadge(
  dateIso: string,
  remaining: number,
  overdueDays: number[],
  now: Date = new Date(),
) {
  if (remaining < 0) {
    return { label: 'Còn tiền trả trước', className: 'border-blue-200 bg-blue-50 text-blue-700' }
  }
  if (remaining === 0) {
    return { label: 'Đã tất toán', className: 'border-gray-200 bg-gray-50 text-gray-600' }
  }
  const daysSince = calendarDaysBetween(new Date(dateIso), now)
  const firstThreshold = overdueDays[0] ?? 30
  if (daysSince <= firstThreshold) {
    return { label: 'Trong hạn', className: 'border-green-200 bg-green-50 text-green-700' }
  }
  const label = `Nợ đã ${daysSince} ngày · Quá hạn ${daysSince - firstThreshold} ngày`
  if (daysSince <= (overdueDays[1] ?? 60)) {
    return { label, className: 'border-yellow-200 bg-yellow-50 text-yellow-700' }
  }
  if (daysSince <= (overdueDays[2] ?? 90)) {
    return { label, className: 'border-orange-200 bg-orange-50 text-orange-700' }
  }
  return { label, className: 'border-red-200 bg-red-50 text-red-700' }
}

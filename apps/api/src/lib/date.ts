import { localDateKey } from './timezone.js'

/**
 * Chuẩn hóa ngày lịch YYYY-MM-DD theo múi giờ cửa hàng (mặc định Asia/Ho_Chi_Minh, UTC+7).
 * Đảm bảo tính nhất quán trên toàn bộ máy chủ (pos.routes, pricing.service, orders.service)
 * tránh lệch ngày do múi giờ UTC. Dùng chung helper của lib/timezone.ts (R7).
 */
export function toIsoDate(d: Date = new Date()): string {
  return localDateKey(d)
}

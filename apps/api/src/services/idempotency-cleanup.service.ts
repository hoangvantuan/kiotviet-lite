import { lt } from 'drizzle-orm'

import { idempotencyKeys } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { isShuttingDown } from '../lib/lifecycle.js'
import { logger } from '../lib/logger.js'

/**
 * R4: khóa chống trùng chỉ cần sống qua các lần bấm lưu lại của một lần thao tác (web bỏ khóa sau
 * 30 phút, hàng chờ ngoại tuyến chống trùng bằng clientId). Giữ 7 ngày là dư, rồi xóa cho bảng
 * không phình mãi.
 */
export const IDEMPOTENCY_KEY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000

/** Xóa khóa tạo trước `now - retentionMs`. Trả về số dòng đã xóa. */
export async function purgeExpiredIdempotencyKeys({
  db,
  now = new Date(),
  retentionMs = IDEMPOTENCY_KEY_RETENTION_MS,
}: {
  db: Db
  now?: Date
  retentionMs?: number
}): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionMs)
  const deleted = await db
    .delete(idempotencyKeys)
    .where(lt(idempotencyKeys.createdAt, cutoff))
    .returning({ key: idempotencyKeys.key })
  return deleted.length
}

/**
 * Dọn một lần lúc khởi động rồi định kỳ. Chạy song song nhiều instance vẫn an toàn (DELETE theo
 * mốc thời gian). Lỗi chỉ ghi log, lần sau dọn tiếp.
 */
export function startIdempotencyKeyCleanup(args: { db: Db; intervalMs?: number }): {
  firstRun: Promise<void>
  stop: () => void
} {
  const tick = async () => {
    if (isShuttingDown()) return
    try {
      const deleted = await purgeExpiredIdempotencyKeys({ db: args.db })
      if (deleted > 0) logger.info({ deleted }, 'idempotency keys purged')
    } catch (err) {
      logger.warn({ err }, 'idempotency key cleanup failed')
    }
  }
  const firstRun = tick()
  const timer = setInterval(() => void tick(), args.intervalMs ?? CLEANUP_INTERVAL_MS)
  timer.unref()
  return { firstRun, stop: () => clearInterval(timer) }
}

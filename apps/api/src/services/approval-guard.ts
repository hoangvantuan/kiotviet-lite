import { ApiError } from '../lib/errors.js'

/**
 * Chống dò PIN người duyệt (ADR-0009). Người bán chọn người duyệt rồi nhập PIN của người đó, nên
 * một nhân viên có thể thử PIN của chủ cho tới khi PIN chủ bị khoá, hoặc tệ hơn là đoán trúng.
 * Mỗi lần nhập sai PIN của NGƯỜI KHÁC được đếm theo người bán và theo IP. Đủ số lần sai trong một
 * vòng thì nguồn đó bị chặn, thời gian chặn tăng dần qua mỗi vòng.
 *
 * Bộ đếm nằm trong bộ nhớ tiến trình: khởi động lại máy chủ thì mất, và mỗi tiến trình đếm riêng.
 * Bộ đếm khoá PIN trên bảng users (5 lần sai) vẫn chạy song song nên vẫn còn lớp chặn cuối.
 */

/** Số lần sai của một người bán trong một vòng trước khi bị chặn */
export const SELLER_FAILURES_PER_ROUND = 3
/** Cả cửa hàng dùng chung một IP nên ngưỡng theo IP cao hơn, tránh chặn oan người khác */
export const IP_FAILURES_PER_ROUND = 10
/** Thời gian chặn theo vòng: 1, 5, 15 phút rồi 60 phút cho mọi vòng sau */
export const BLOCK_SCHEDULE_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000]
/** Không sai thêm lần nào trong khoảng này thì quên hết số vòng đã bị chặn */
const FORGET_AFTER_MS = 24 * 60 * 60_000
const MAX_ENTRIES = 10_000

interface GuardEntry {
  failures: number
  rounds: number
  blockedUntil: number
  lastFailureAt: number
}

const entries = new Map<string, GuardEntry>()

export interface ApprovalRequester {
  /** Người đang nhập PIN của người duyệt (người bán) */
  userId: string
  ipAddress?: string | null
}

function keysOf(requester: ApprovalRequester): Array<{ key: string; limit: number }> {
  const keys = [{ key: `seller:${requester.userId}`, limit: SELLER_FAILURES_PER_ROUND }]
  if (requester.ipAddress)
    keys.push({ key: `ip:${requester.ipAddress}`, limit: IP_FAILURES_PER_ROUND })
  return keys
}

function read(key: string, now: number): GuardEntry | null {
  const entry = entries.get(key)
  if (!entry) return null
  if (now - entry.lastFailureAt > FORGET_AFTER_MS && entry.blockedUntil <= now) {
    entries.delete(key)
    return null
  }
  return entry
}

function prune(now: number) {
  if (entries.size < MAX_ENTRIES) return
  for (const [key, entry] of entries) {
    if (entry.blockedUntil <= now) entries.delete(key)
  }
}

function formatWait(ms: number): string {
  const minutes = Math.ceil(ms / 60_000)
  return `${minutes} phút`
}

/** Ném RATE_LIMITED nếu người bán hay IP đang bị chặn nhập PIN người duyệt. */
export function assertApprovalAllowed(requester: ApprovalRequester, now = Date.now()): void {
  for (const { key } of keysOf(requester)) {
    const entry = read(key, now)
    if (entry && entry.blockedUntil > now) {
      throw new ApiError(
        'RATE_LIMITED',
        `Nhập sai mã PIN người duyệt quá nhiều lần. Thử lại sau ${formatWait(entry.blockedUntil - now)}`,
        { retryAfter: new Date(entry.blockedUntil).toISOString() },
      )
    }
  }
}

/** Ghi một lần nhập sai PIN người duyệt; đủ ngưỡng thì chặn với thời gian tăng dần. */
export function recordApprovalFailure(requester: ApprovalRequester, now = Date.now()): void {
  prune(now)
  for (const { key, limit } of keysOf(requester)) {
    const entry = read(key, now) ?? { failures: 0, rounds: 0, blockedUntil: 0, lastFailureAt: now }
    entry.failures += 1
    entry.lastFailureAt = now
    if (entry.failures >= limit) {
      const duration = BLOCK_SCHEDULE_MS[Math.min(entry.rounds, BLOCK_SCHEDULE_MS.length - 1)]!
      entry.rounds += 1
      entry.failures = 0
      entry.blockedUntil = now + duration
    }
    entries.set(key, entry)
  }
}

/**
 * PIN đúng: xoá số lần sai trong vòng hiện tại của người bán. Số vòng đã bị chặn vẫn giữ để lần
 * dò sau bị chặn lâu hơn; bộ đếm theo IP giữ nguyên vì IP có thể là của cả cửa hàng.
 */
export function recordApprovalSuccess(requester: ApprovalRequester, now = Date.now()): void {
  const entry = read(`seller:${requester.userId}`, now)
  if (entry) entry.failures = 0
}

/** Chỉ dùng trong kiểm thử */
export function resetApprovalGuard(): void {
  entries.clear()
}

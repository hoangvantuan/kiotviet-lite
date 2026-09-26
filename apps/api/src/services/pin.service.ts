import { and, eq } from 'drizzle-orm'

import { PIN_INVALID_REASON, users } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { verifyPassword } from '../lib/password.js'
import { formatLocalTime } from '../lib/timezone.js'
import { logAction, type RequestMeta } from './audit.service.js'
import { emitEvent } from './notification-emitter.js'

export const MAX_PIN_ATTEMPTS = 5
export const PIN_LOCK_DURATION_MS = 15 * 60 * 1000

const DUMMY_HASH = '$2a$12$000000000000000000000uGByljMxEOUaVBPH0m37.LMTsGVEqXSq'

// Giờ mở khóa theo múi giờ cửa hàng: máy chủ chạy TZ=UTC nên getHours() lệch 7 giờ (POS-10)
function formatLockTime(d: Date): string {
  return formatLocalTime(d)
}

export interface VerifyPinDeps {
  db: Db
  userId: string
  storeId: string
  pin: string
  meta?: RequestMeta
  /**
   * false: PIN sai không cộng vào số lần sai và không khoá. Dùng cho PIN duyệt nằm sẵn trong đơn
   * ngoại tuyến: mỗi lần đồng bộ lại cùng một đơn không được làm khoá PIN người duyệt (ADR-0009).
   */
  recordFailure?: boolean
}

export interface VerifyPinResult {
  ok: true
}

type PinOutcome =
  | { ok: true }
  | { error: 'NOT_FOUND'; message: string }
  | { error: 'FORBIDDEN'; message: string }
  | { error: 'LOCKED'; message: string; details: { lockedUntil: string } }
  // POS-10: PIN sai vẫn là 401 (outbox ngoại tuyến và các đường gọi cũ dựa vào mã này), kèm `reason`
  // riêng để máy khách không coi là phiên hết hạn
  | {
      error: 'UNAUTHORIZED'
      message: string
      details: { remaining: number; reason: typeof PIN_INVALID_REASON }
    }

export async function verifyPin({
  db,
  userId,
  storeId,
  pin,
  meta,
  recordFailure = true,
}: VerifyPinDeps): Promise<VerifyPinResult> {
  const outcome: PinOutcome = await db.transaction(async (tx) => {
    // PIN của người dùng cửa hàng khác không bao giờ được kiểm (người duyệt do máy khách chỉ định)
    const rows = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.storeId, storeId)))
      .for('update')
    const user = rows[0]

    if (!user || !user.pinHash) {
      await verifyPassword(pin, DUMMY_HASH)
      return { error: 'NOT_FOUND', message: 'Người dùng chưa thiết lập mã PIN' }
    }

    if (!user.isActive) {
      return { error: 'FORBIDDEN', message: 'Tài khoản đã bị khoá' }
    }

    const now = new Date()

    if (user.pinLockedUntil && user.pinLockedUntil > now) {
      return {
        error: 'LOCKED',
        message: `Bạn đã nhập sai PIN quá ${MAX_PIN_ATTEMPTS} lần. Tài khoản bị khoá PIN đến ${formatLockTime(user.pinLockedUntil)}`,
        details: { lockedUntil: user.pinLockedUntil.toISOString() },
      }
    }

    const baseAttempts =
      user.pinLockedUntil && user.pinLockedUntil <= now ? 0 : (user.failedPinAttempts ?? 0)

    const ok = await verifyPassword(pin, user.pinHash)

    if (!ok && !recordFailure) {
      return {
        error: 'UNAUTHORIZED',
        message: 'Mã PIN không đúng',
        details: { remaining: MAX_PIN_ATTEMPTS - baseAttempts, reason: PIN_INVALID_REASON },
      }
    }

    if (!ok) {
      const next = baseAttempts + 1
      if (next >= MAX_PIN_ATTEMPTS) {
        const lockedUntil = new Date(now.getTime() + PIN_LOCK_DURATION_MS)
        await tx
          .update(users)
          .set({ failedPinAttempts: next, pinLockedUntil: lockedUntil })
          .where(eq(users.id, userId))

        await logAction({
          db: tx as unknown as Db,
          storeId,
          actorId: userId,
          actorRole: user.role,
          action: 'auth.pin_locked',
          targetType: 'user',
          targetId: userId,
          changes: { lockedUntil: lockedUntil.toISOString() },
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
        })

        emitEvent(db, {
          storeId,
          type: 'auth.pin.locked',
          severity: 'warn',
          title: 'PIN bị khoá',
          body: `Tài khoản nhập sai PIN ${MAX_PIN_ATTEMPTS} lần. Khoá đến ${formatLockTime(lockedUntil)}`,
          context: { userId, lockedUntil: lockedUntil.toISOString() },
        })

        return {
          error: 'LOCKED',
          message: `Bạn đã nhập sai PIN quá ${MAX_PIN_ATTEMPTS} lần. Tài khoản bị khoá PIN đến ${formatLockTime(lockedUntil)}`,
          details: { lockedUntil: lockedUntil.toISOString() },
        }
      }

      await tx.update(users).set({ failedPinAttempts: next }).where(eq(users.id, userId))

      await logAction({
        db: tx as unknown as Db,
        storeId,
        actorId: userId,
        actorRole: user.role,
        action: 'auth.pin_failed',
        targetType: 'user',
        targetId: userId,
        changes: { attempt: next },
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      })

      return {
        error: 'UNAUTHORIZED',
        message: 'Mã PIN không đúng',
        details: { remaining: MAX_PIN_ATTEMPTS - next, reason: PIN_INVALID_REASON },
      }
    }

    await tx
      .update(users)
      .set({ failedPinAttempts: 0, pinLockedUntil: null })
      .where(eq(users.id, userId))

    return { ok: true }
  })

  if ('error' in outcome) {
    throw new ApiError(
      outcome.error,
      outcome.message,
      'details' in outcome ? outcome.details : undefined,
    )
  }

  return outcome
}

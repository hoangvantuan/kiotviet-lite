import { eq } from 'drizzle-orm'

import { users } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { verifyPassword } from '../lib/password.js'
import { logAction, type RequestMeta } from './audit.service.js'

export const MAX_PIN_ATTEMPTS = 5
export const PIN_LOCK_DURATION_MS = 15 * 60 * 1000

const DUMMY_HASH = '$2a$12$000000000000000000000uGByljMxEOUaVBPH0m37.LMTsGVEqXSq'

function formatLockTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export interface VerifyPinDeps {
  db: Db
  userId: string
  storeId: string
  pin: string
  meta?: RequestMeta
}

export interface VerifyPinResult {
  ok: true
}

type PinOutcome =
  | { ok: true }
  | { error: 'NOT_FOUND'; message: string }
  | { error: 'FORBIDDEN'; message: string }
  | { error: 'LOCKED'; message: string; details: { lockedUntil: string } }
  | { error: 'UNAUTHORIZED'; message: string; details: { remaining: number } }

export async function verifyPin({
  db,
  userId,
  storeId,
  pin,
  meta,
}: VerifyPinDeps): Promise<VerifyPinResult> {
  const outcome: PinOutcome = await db.transaction(async (tx) => {
    const rows = await tx.select().from(users).where(eq(users.id, userId)).for('update')
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
        details: { remaining: MAX_PIN_ATTEMPTS - next },
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

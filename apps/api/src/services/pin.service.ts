import { eq } from 'drizzle-orm'

import { users } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { verifyPassword } from '../lib/password.js'
import { logAction, type RequestMeta } from './audit.service.js'

export const MAX_PIN_ATTEMPTS = 5
export const PIN_LOCK_DURATION_MS = 15 * 60 * 1000

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

export async function verifyPin({
  db,
  userId,
  storeId,
  pin,
  meta,
}: VerifyPinDeps): Promise<VerifyPinResult> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
  if (!user || !user.pinHash) {
    throw new ApiError('NOT_FOUND', 'Người dùng chưa thiết lập mã PIN')
  }

  const now = new Date()
  const isLocked = user.pinLockedUntil && user.pinLockedUntil > now

  if (isLocked && user.pinLockedUntil) {
    throw new ApiError(
      'BUSINESS_RULE_VIOLATION',
      `Bạn đã nhập sai PIN quá ${MAX_PIN_ATTEMPTS} lần. Tài khoản bị khoá PIN đến ${formatLockTime(user.pinLockedUntil)}`,
      { lockedUntil: user.pinLockedUntil.toISOString() },
    )
  }

  // Lazy reset: lock đã hết hạn → coi như attempts = 0
  const baseAttempts =
    user.pinLockedUntil && user.pinLockedUntil <= now ? 0 : (user.failedPinAttempts ?? 0)

  const ok = await verifyPassword(pin, user.pinHash)

  if (!ok) {
    const next = baseAttempts + 1
    if (next >= MAX_PIN_ATTEMPTS) {
      const lockedUntil = new Date(now.getTime() + PIN_LOCK_DURATION_MS)
      await db
        .update(users)
        .set({ failedPinAttempts: next, pinLockedUntil: lockedUntil })
        .where(eq(users.id, userId))

      await logAction({
        db,
        storeId,
        actorId: userId,
        action: 'auth.pin_locked',
        targetType: 'user',
        targetId: userId,
        changes: { lockedUntil: lockedUntil.toISOString() },
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      })

      throw new ApiError(
        'BUSINESS_RULE_VIOLATION',
        `Bạn đã nhập sai PIN quá ${MAX_PIN_ATTEMPTS} lần. Tài khoản bị khoá PIN đến ${formatLockTime(lockedUntil)}`,
        { lockedUntil: lockedUntil.toISOString() },
      )
    }

    await db.update(users).set({ failedPinAttempts: next }).where(eq(users.id, userId))

    await logAction({
      db,
      storeId,
      actorId: userId,
      action: 'auth.pin_failed',
      targetType: 'user',
      targetId: userId,
      changes: { attempt: next },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    throw new ApiError('UNAUTHORIZED', 'Mã PIN không đúng', {
      remaining: MAX_PIN_ATTEMPTS - next,
    })
  }

  await db
    .update(users)
    .set({ failedPinAttempts: 0, pinLockedUntil: null })
    .where(eq(users.id, userId))

  return { ok: true }
}

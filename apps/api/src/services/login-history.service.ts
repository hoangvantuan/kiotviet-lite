import { desc, eq } from 'drizzle-orm'

import { loginHistory } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'

export interface RecordLoginInput {
  userId: string
  storeId: string
  ip?: string
  userAgent?: string
}

export async function recordLogin(db: Db, input: RecordLoginInput): Promise<void> {
  await db.insert(loginHistory).values({
    userId: input.userId,
    storeId: input.storeId,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  })
}

export interface IsLoginSuspiciousInput {
  userId: string
  ip?: string
  userAgent?: string
}

/**
 * Returns true if BOTH ip AND userAgent are not found in the last 5 logins.
 * If ip or userAgent is missing, returns false (cannot determine suspicion).
 */
export async function isLoginSuspicious(db: Db, input: IsLoginSuspiciousInput): Promise<boolean> {
  if (!input.ip || !input.userAgent) return false

  const recentLogins = await db
    .select({ ip: loginHistory.ip, userAgent: loginHistory.userAgent })
    .from(loginHistory)
    .where(eq(loginHistory.userId, input.userId))
    .orderBy(desc(loginHistory.loginAt))
    .limit(5)

  if (recentLogins.length === 0) return false

  const knownIps = new Set(recentLogins.map((r) => r.ip))
  const knownUserAgents = new Set(recentLogins.map((r) => r.userAgent))

  const ipIsNew = !knownIps.has(input.ip)
  const uaIsNew = !knownUserAgents.has(input.userAgent)

  return ipIsNew && uaIsNew
}

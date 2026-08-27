import { and, eq, isNull } from 'drizzle-orm'

import {
  auditLogs,
  type AuthResponse,
  type AuthUser,
  type LoginInput,
  type RefreshResponse,
  refreshTokens,
  type RegisterInput,
  stores,
  users,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { env } from '../lib/env.js'
import { ApiError } from '../lib/errors.js'
import { hashToken, signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt.js'
import { logger } from '../lib/logger.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { isLoginSuspicious, recordLogin } from './login-history.service.js'
import { emitEvent } from './notification-emitter.js'
import { seedDefaultRules } from './notification-seed.service.js'

export interface IssuedTokens extends AuthResponse {
  refreshToken: string
}

interface RegisterDeps {
  db: Db
  input: RegisterInput
}

export async function registerStoreOwner({ db, input }: RegisterDeps): Promise<IssuedTokens> {
  const existing = await db.query.users.findFirst({
    where: eq(users.phone, input.phone),
  })
  if (existing) {
    throw new ApiError('CONFLICT', 'Số điện thoại đã được sử dụng', { field: 'phone' })
  }

  const passwordHash = await hashPassword(input.password)

  const created = await db.transaction(async (tx) => {
    const [store] = await tx
      .insert(stores)
      .values({ name: input.storeName, phone: input.phone })
      .returning()
    if (!store) {
      throw new ApiError('INTERNAL_ERROR', 'Không tạo được cửa hàng')
    }

    const [user] = await tx
      .insert(users)
      .values({
        storeId: store.id,
        name: input.ownerName,
        phone: input.phone,
        passwordHash,
        role: 'owner',
      })
      .returning()
    if (!user) {
      throw new ApiError('INTERNAL_ERROR', 'Không tạo được tài khoản')
    }

    // Seed default notification rules for new store
    await seedDefaultRules(tx as unknown as Db, store.id)

    const refresh = signRefreshToken(user.id)
    await tx.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: refresh.tokenHash,
      expiresAt: refresh.expiresAt,
    })

    return { user, refresh }
  })

  const authUser = toAuthUser(created.user)
  const accessToken = signAccessToken({
    userId: authUser.id,
    storeId: authUser.storeId,
    role: authUser.role,
  })

  return {
    user: authUser,
    accessToken,
    expiresIn: env.accessTokenTtlSeconds,
    refreshToken: created.refresh.token,
  }
}

interface LoginDeps {
  db: Db
  input: LoginInput
  ip?: string
  userAgent?: string
}

const DUMMY_HASH = '$2a$12$x/Y5Y5Y5Y5Y5Y5Y5Y5Y5Y.x/Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y'

export async function loginUser({ db, input, ip, userAgent }: LoginDeps): Promise<IssuedTokens> {
  const user = await db.query.users.findFirst({
    where: eq(users.phone, input.phone),
  })
  if (!user || !user.isActive) {
    await verifyPassword(input.password, DUMMY_HASH)
    throw new ApiError('UNAUTHORIZED', 'Số điện thoại hoặc mật khẩu không đúng')
  }

  const ok = await verifyPassword(input.password, user.passwordHash)
  if (!ok) {
    throw new ApiError('UNAUTHORIZED', 'Số điện thoại hoặc mật khẩu không đúng')
  }

  const authUser = toAuthUser(user)
  const refresh = signRefreshToken(user.id)
  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: refresh.tokenHash,
    expiresAt: refresh.expiresAt,
  })

  const accessToken = signAccessToken({
    userId: authUser.id,
    storeId: authUser.storeId,
    role: authUser.role,
  })

  // Audit log for login
  await db.insert(auditLogs).values({
    storeId: user.storeId,
    actorId: user.id,
    actorRole: user.role,
    action: 'login',
    targetType: 'user',
    targetId: user.id,
    ipAddress: ip,
    userAgent,
  })

  // Suspicious login detection (fire-and-forget)
  void (async () => {
    try {
      const suspicious = await isLoginSuspicious(db, {
        userId: user.id,
        ip,
        userAgent,
      })
      if (suspicious) {
        emitEvent(db, {
          storeId: authUser.storeId,
          type: 'auth.login.suspicious',
          severity: 'warn',
          title: 'Đăng nhập bất thường',
          body: `Phát hiện đăng nhập từ thiết bị/IP lạ cho tài khoản ${authUser.name}`,
          context: { userId: user.id, ip, userAgent },
        })
      }
      await recordLogin(db, {
        userId: user.id,
        storeId: authUser.storeId,
        ip,
        userAgent,
      })
    } catch (err) {
      logger.error({ err, userId: user.id }, 'login history check failed')
    }
  })()

  return {
    user: authUser,
    accessToken,
    expiresIn: env.accessTokenTtlSeconds,
    refreshToken: refresh.token,
  }
}

interface RefreshDeps {
  db: Db
  token: string
}

export async function rotateRefreshToken({
  db,
  token,
}: RefreshDeps): Promise<RefreshResponse & { refreshToken: string }> {
  const payload = verifyRefreshToken(token)
  const tokenHash = hashToken(token)

  // Tìm token trong DB (bao gồm cả token đã revoke, để phát hiện tái sử dụng)
  const existing = await db.query.refreshTokens.findFirst({
    where: and(eq(refreshTokens.tokenHash, tokenHash), eq(refreshTokens.userId, payload.sub)),
  })

  if (!existing) {
    throw new ApiError('UNAUTHORIZED', 'Phiên đăng nhập đã hết hạn', { reason: 'invalid' })
  }

  // Token đã bị thu hồi → tái sử dụng (replay attack) → thu hồi toàn bộ token family
  if (existing.revokedAt) {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, payload.sub), isNull(refreshTokens.revokedAt)))
    logger.error({ userId: payload.sub }, 'Refresh token reuse detected, all sessions revoked')
    throw new ApiError('UNAUTHORIZED', 'Token reuse detected, all sessions revoked', {
      reason: 'reuse',
    })
  }

  // Token hết hạn
  if (existing.expiresAt <= new Date()) {
    throw new ApiError('UNAUTHORIZED', 'Phiên đăng nhập đã hết hạn', { reason: 'invalid' })
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, payload.sub) })
  if (!user || !user.isActive) {
    throw new ApiError('UNAUTHORIZED', 'Tài khoản không khả dụng')
  }

  const next = signRefreshToken(user.id)

  let isReused = false
  await db.transaction(async (tx) => {
    // Cập nhật nguyên tử: chỉ revoke nếu token CHƯA bị revoke (revokedAt IS NULL).
    // Nếu affected=0 → request đồng thời khác đã revoke trước → token đã dùng rồi.
    const revoked = await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date(), replacedByTokenHash: next.tokenHash })
      .where(and(eq(refreshTokens.id, existing.id), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id })

    if (revoked.length === 0) {
      isReused = true
      return
    }

    // Insert token mới trong cùng transaction
    await tx.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: next.tokenHash,
      expiresAt: next.expiresAt,
    })
  })

  if (isReused) {
    // Race condition: request khác đã revoke token này trước.
    // Thu hồi toàn bộ token family của user vì đây là dấu hiệu tái sử dụng.
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, payload.sub), isNull(refreshTokens.revokedAt)))
    logger.error(
      { userId: payload.sub },
      'Refresh token concurrent reuse detected, all sessions revoked',
    )
    throw new ApiError('UNAUTHORIZED', 'Token reuse detected, all sessions revoked', {
      reason: 'reuse',
    })
  }

  const accessToken = signAccessToken({
    userId: user.id,
    storeId: user.storeId,
    role: user.role,
  })

  return {
    accessToken,
    expiresIn: env.accessTokenTtlSeconds,
    refreshToken: next.token,
  }
}

interface LogoutDeps {
  db: Db
  token: string | null | undefined
  userId?: string
  storeId?: string
  ip?: string
  userAgent?: string
}

export async function logoutUser({
  db,
  token,
  userId,
  storeId,
  ip,
  userAgent,
}: LogoutDeps): Promise<void> {
  if (!token) return
  let payload: { sub: string }
  let tokenHash: string
  try {
    payload = verifyRefreshToken(token)
    tokenHash = hashToken(token)
  } catch {
    return
  }
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)))

  const actorId = userId ?? payload.sub
  let resolvedStoreId = storeId
  if (!resolvedStoreId) {
    const user = await db.query.users.findFirst({ where: eq(users.id, actorId) })
    resolvedStoreId = user?.storeId
  }
  if (actorId && resolvedStoreId) {
    await db.insert(auditLogs).values({
      storeId: resolvedStoreId,
      actorId,
      action: 'logout',
      targetType: 'user',
      targetId: actorId,
      ipAddress: ip,
      userAgent,
    })
  }
}

function toAuthUser(user: typeof users.$inferSelect): AuthUser {
  return {
    id: user.id,
    storeId: user.storeId,
    name: user.name,
    phone: user.phone,
    role: user.role,
  }
}

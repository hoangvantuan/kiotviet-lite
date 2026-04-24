import { and, eq, gt, isNull } from 'drizzle-orm'

import {
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
import { hashPassword, verifyPassword } from '../lib/password.js'

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
}

export async function loginUser({ db, input }: LoginDeps): Promise<IssuedTokens> {
  const user = await db.query.users.findFirst({
    where: eq(users.phone, input.phone),
  })
  if (!user || !user.isActive) {
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

export async function rotateRefreshToken({ db, token }: RefreshDeps): Promise<RefreshResponse & { refreshToken: string }> {
  const payload = verifyRefreshToken(token)
  const tokenHash = hashToken(token)

  const stored = await db.query.refreshTokens.findFirst({
    where: and(
      eq(refreshTokens.tokenHash, tokenHash),
      isNull(refreshTokens.revokedAt),
      gt(refreshTokens.expiresAt, new Date()),
    ),
  })
  if (!stored) {
    throw new ApiError('UNAUTHORIZED', 'Phiên đăng nhập đã hết hạn', { reason: 'invalid' })
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, payload.sub) })
  if (!user || !user.isActive) {
    throw new ApiError('UNAUTHORIZED', 'Tài khoản không khả dụng')
  }

  const next = signRefreshToken(user.id)
  await db.transaction(async (tx) => {
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date(), replacedByTokenHash: next.tokenHash })
      .where(eq(refreshTokens.id, stored.id))
    await tx.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: next.tokenHash,
      expiresAt: next.expiresAt,
    })
  })

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
}

export async function logoutUser({ db, token }: LogoutDeps): Promise<void> {
  if (!token) return
  let tokenHash: string
  try {
    verifyRefreshToken(token)
    tokenHash = hashToken(token)
  } catch {
    return
  }
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)))
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

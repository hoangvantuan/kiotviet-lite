import jwt, { type JwtPayload } from 'jsonwebtoken'
import { createHash, randomUUID } from 'node:crypto'

import {
  type AccessTokenPayload,
  accessTokenPayloadSchema,
  type RefreshTokenPayload,
  refreshTokenPayloadSchema,
  type UserRole,
} from '@kiotviet-lite/shared'

import { env } from './env.js'
import { ApiError } from './errors.js'

export interface SignedRefreshToken {
  token: string
  jti: string
  tokenHash: string
  expiresAt: Date
}

export function signAccessToken(input: { userId: string; storeId: string; role: UserRole }): string {
  const payload: AccessTokenPayload = {
    sub: input.userId,
    storeId: input.storeId,
    role: input.role,
    type: 'access',
  }
  return jwt.sign(payload, env.jwtAccessSecret, {
    expiresIn: env.accessTokenTtlSeconds,
  })
}

export function signRefreshToken(userId: string): SignedRefreshToken {
  const jti = randomUUID()
  const payload: RefreshTokenPayload = { sub: userId, jti, type: 'refresh' }
  const token = jwt.sign(payload, env.jwtRefreshSecret, {
    expiresIn: env.refreshTokenTtlSeconds,
  })
  return {
    token,
    jti,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + env.refreshTokenTtlSeconds * 1000),
  }
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return verify(token, env.jwtAccessSecret, accessTokenPayloadSchema.parse)
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return verify(token, env.jwtRefreshSecret, refreshTokenPayloadSchema.parse)
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function verify<T>(token: string, secret: string, parse: (raw: unknown) => T): T {
  try {
    const decoded = jwt.verify(token, secret) as JwtPayload | string
    return parse(decoded)
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new ApiError('UNAUTHORIZED', 'Token đã hết hạn', { reason: 'expired' })
    }
    throw new ApiError('UNAUTHORIZED', 'Token không hợp lệ', { reason: 'invalid' })
  }
}

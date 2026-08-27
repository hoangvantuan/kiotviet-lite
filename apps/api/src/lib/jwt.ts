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
import { logger } from './logger.js'

export interface SignedRefreshToken {
  token: string
  jti: string
  tokenHash: string
  expiresAt: Date
}

const JWT_ISSUER = 'kiotviet-lite'
const JWT_AUDIENCE = 'kiotviet-lite-web'

export function signAccessToken(input: {
  userId: string
  storeId: string
  role: UserRole
}): string {
  const payload: AccessTokenPayload = {
    sub: input.userId,
    storeId: input.storeId,
    role: input.role,
    type: 'access',
  }
  return jwt.sign(payload, env.jwtAccessSecret, {
    expiresIn: env.accessTokenTtlSeconds,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  })
}

export function signRefreshToken(userId: string): SignedRefreshToken {
  const jti = randomUUID()
  const payload: RefreshTokenPayload = { sub: userId, jti, type: 'refresh' }
  const token = jwt.sign(payload, env.jwtRefreshSecret, {
    expiresIn: env.refreshTokenTtlSeconds,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  })
  return {
    token,
    jti,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + env.refreshTokenTtlSeconds * 1000),
  }
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return verifyWithGrace(token, env.jwtAccessSecret, accessTokenPayloadSchema.parse)
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return verifyWithGrace(token, env.jwtRefreshSecret, refreshTokenPayloadSchema.parse)
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Verify JWT với grace period: thử verify bình thường (có iss/aud) trước.
 * Nếu lỗi do iss/aud không khớp và đang trong grace period, thử lại
 * không kiểm tra iss/aud. Log cảnh báo khi dùng đường grace.
 */
function verifyWithGrace<T>(token: string, secret: string, parse: (raw: unknown) => T): T {
  try {
    const decoded = jwt.verify(token, secret, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as JwtPayload | string
    return parse(decoded)
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new ApiError('UNAUTHORIZED', 'Token đã hết hạn', { reason: 'expired' })
    }

    // Grace period: token cũ thiếu iss/aud vẫn được chấp nhận tạm thời
    const graceDays = env.jwtGracePeriodDays
    if (graceDays > 0 && isIssuerAudienceError(err)) {
      try {
        const decoded = jwt.verify(token, secret) as JwtPayload | string
        const parsed = parse(decoded)
        logger.warn(
          { graceDaysRemaining: graceDays },
          'Token thiếu iss/aud được chấp nhận qua grace period. Vui lòng đăng nhập lại.',
        )
        return parsed
      } catch (graceErr) {
        if (graceErr instanceof jwt.TokenExpiredError) {
          throw new ApiError('UNAUTHORIZED', 'Token đã hết hạn', { reason: 'expired' })
        }
        throw new ApiError('UNAUTHORIZED', 'Token không hợp lệ', { reason: 'invalid' })
      }
    }

    throw new ApiError('UNAUTHORIZED', 'Token không hợp lệ', { reason: 'invalid' })
  }
}

function isIssuerAudienceError(err: unknown): boolean {
  if (err instanceof jwt.JsonWebTokenError) {
    const msg = err.message.toLowerCase()
    return msg.includes('issuer') || msg.includes('audience')
  }
  return false
}

import type { Context } from 'hono'
import { rateLimiter } from 'hono-rate-limiter'

/**
 * Extract client IP from request headers.
 * Assumption: In production, this service runs behind a reverse proxy (nginx/Cloudflare)
 * that always sets x-forwarded-for or cf-connecting-ip. The 'unknown' fallback only
 * applies in development or misconfigured environments.
 */
const getClientIp = (c: Context): string => {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    c.req.header('cf-connecting-ip') ||
    'unknown'
  )
}

/**
 * Rate limit cho endpoint login: 5 requests / phút / IP
 */
export const authRateLimit = rateLimiter({
  windowMs: 60_000,
  limit: 5,
  keyGenerator: (c) => getClientIp(c),
  message: { error: { code: 'RATE_LIMITED', message: 'Quá nhiều yêu cầu, vui lòng thử lại sau' } },
})

/**
 * Rate limit cho endpoint register: 3 requests / giờ / IP
 */
export const registerRateLimit = rateLimiter({
  windowMs: 3_600_000,
  limit: 3,
  keyGenerator: (c) => getClientIp(c),
  message: {
    error: { code: 'RATE_LIMITED', message: 'Quá nhiều yêu cầu đăng ký, vui lòng thử lại sau' },
  },
})

/**
 * Rate limit cho endpoint refresh token: 30 requests / phút / IP
 */
export const refreshRateLimit = rateLimiter({
  windowMs: 60_000,
  limit: 30,
  keyGenerator: (c) => getClientIp(c),
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Quá nhiều yêu cầu làm mới token, vui lòng thử lại sau',
    },
  },
})

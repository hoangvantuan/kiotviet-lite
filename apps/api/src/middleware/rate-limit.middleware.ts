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
 * Chỉ cho phép tắt giới hạn tần suất ở môi trường kiểm thử.
 * Trên production, mọi cờ tắt đều bị bỏ qua để không thủng lớp chống dò mật khẩu.
 */
const isRateLimitDisabled = () => {
  if (process.env.NODE_ENV === 'production') return false
  return (
    process.env.NODE_ENV === 'test' ||
    process.env.RATE_LIMIT_DISABLED === 'true' ||
    process.env.E2E_TEST === '1'
  )
}

/**
 * Rate limit cho endpoint login: 5 requests / phút / IP (bỏ qua khi chạy kiểm thử E2E/test)
 */
export const authRateLimit = rateLimiter({
  windowMs: 60_000,
  limit: 5,
  keyGenerator: (c) => getClientIp(c),
  skip: isRateLimitDisabled,
  message: { error: { code: 'RATE_LIMITED', message: 'Quá nhiều yêu cầu, vui lòng thử lại sau' } },
})

/**
 * Rate limit cho endpoint register: 3 requests / giờ / IP (bỏ qua khi chạy kiểm thử E2E/test)
 */
export const registerRateLimit = rateLimiter({
  windowMs: 3_600_000,
  limit: 3,
  keyGenerator: (c) => getClientIp(c),
  skip: isRateLimitDisabled,
  message: {
    error: { code: 'RATE_LIMITED', message: 'Quá nhiều yêu cầu đăng ký, vui lòng thử lại sau' },
  },
})

/**
 * Rate limit cho endpoint refresh token: 30 requests / phút / IP (bỏ qua khi chạy kiểm thử E2E/test)
 */
export const refreshRateLimit = rateLimiter({
  windowMs: 60_000,
  limit: 30,
  keyGenerator: (c) => getClientIp(c),
  skip: isRateLimitDisabled,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Quá nhiều yêu cầu làm mới token, vui lòng thử lại sau',
    },
  },
})

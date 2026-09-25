import type { Context } from 'hono'
import { rateLimiter } from 'hono-rate-limiter'

import { getClientIp } from '../lib/client-ip.js'

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
 * Lấy số điện thoại trong body đăng nhập làm khóa giới hạn. Hono đệm body nên
 * handler phía sau vẫn đọc lại được. Body lỗi dùng chung một khóa, handler sẽ trả 400.
 */
const getLoginPhoneKey = async (c: Context): Promise<string> => {
  try {
    const body = (await c.req.json()) as { phone?: unknown }
    if (typeof body.phone === 'string' && body.phone.trim().length > 0) {
      return `phone:${body.phone.trim()}`
    }
  } catch {
    // body không phải JSON
  }
  return 'phone:invalid'
}

/**
 * Rate limit đăng nhập theo tài khoản: 10 lần SAI / 15 phút / số điện thoại, bất kể IP.
 * Chặn dò mật khẩu phân tán qua nhiều IP. Đăng nhập thành công không bị tính.
 * Đánh đổi: kẻ xấu biết số điện thoại có thể làm chủ tài khoản chờ tối đa 15 phút.
 */
export const authPhoneRateLimit = rateLimiter({
  windowMs: 15 * 60_000,
  limit: 10,
  keyGenerator: getLoginPhoneKey,
  skipSuccessfulRequests: true,
  skip: isRateLimitDisabled,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Đăng nhập sai quá nhiều lần, vui lòng thử lại sau 15 phút',
    },
  },
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

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
const getLoginPhone = async (c: Context): Promise<string> => {
  try {
    const body = (await c.req.json()) as { phone?: unknown }
    if (typeof body.phone === 'string' && body.phone.trim().length > 0) {
      return body.phone.trim()
    }
  } catch {
    // body không phải JSON
  }
  return 'invalid'
}

const LOGIN_PHONE_WINDOW_MS = 15 * 60_000

/**
 * Rate limit đăng nhập theo cặp (số điện thoại, IP): 10 lần SAI / 15 phút.
 * Chặn một nguồn dò mật khẩu một tài khoản mà không làm vạ lây chủ tài khoản ở IP khác.
 * Đăng nhập thành công không bị tính. Nguồn bị chặn chờ tối đa 15 phút kể từ lần sai đầu của cửa sổ.
 */
export const authPhoneIpRateLimit = rateLimiter({
  windowMs: LOGIN_PHONE_WINDOW_MS,
  limit: 10,
  keyGenerator: async (c) => `phone-ip:${await getLoginPhone(c)}|${getClientIp(c)}`,
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
 * Rate limit đăng nhập tổng theo số điện thoại: 50 lần SAI / 15 phút, bất kể IP.
 * Chặn dò mật khẩu phân tán qua nhiều IP, cao hơn nhiều ngưỡng theo cặp để một IP không khóa được
 * tài khoản người khác. Phải đặt SAU `authPhoneIpRateLimit` để request đã bị chặn theo cặp không cộng vào đây.
 * Đánh đổi: kẻ xấu có từ 5 IP trở lên vẫn giữ được khóa bằng cách gửi đủ 50 lần sai mỗi 15 phút;
 * khi đó chủ tài khoản bị 429 chừng nào đợt tấn công còn tiếp diễn.
 */
export const authPhoneRateLimit = rateLimiter({
  windowMs: LOGIN_PHONE_WINDOW_MS,
  limit: 50,
  keyGenerator: async (c) => `phone:${await getLoginPhone(c)}`,
  skipSuccessfulRequests: true,
  skip: isRateLimitDisabled,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Tài khoản đang bị đăng nhập sai nhiều lần, vui lòng thử lại sau',
    },
  },
})

/**
 * Rate limit tạo nhân viên: 20 lần / giờ / người dùng. Số điện thoại là duy nhất toàn hệ thống nên
 * POST /users buộc phải trả 409 khi trùng; giới hạn này làm chậm việc dùng 409 để dò số đã đăng ký.
 * Phải đặt sau `requireAuth` để có `auth.userId`.
 */
export const createUserRateLimit = rateLimiter({
  windowMs: 3_600_000,
  limit: 20,
  keyGenerator: (c) => `create-user:${c.get('auth').userId}`,
  skip: isRateLimitDisabled,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Tạo nhân viên quá nhiều lần, vui lòng thử lại sau',
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

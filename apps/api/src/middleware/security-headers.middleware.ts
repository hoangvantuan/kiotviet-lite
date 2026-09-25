import { createMiddleware } from 'hono/factory'

export const securityHeaders = createMiddleware(async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('X-XSS-Protection', '0')
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  // C-01: phản hồi API gắn với người đang đăng nhập, không tầng cache nào (trình duyệt,
  // service worker, proxy) được giữ lại để trả cho người khác hay cho lần tải sau.
  // Ghi đè cả giá trị route tự đặt để không route nào lọt.
  if (c.req.path.startsWith('/api/')) {
    c.header('Cache-Control', 'private, no-store')
  }
})

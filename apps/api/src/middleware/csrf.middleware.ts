import type { MiddlewareHandler } from 'hono'

import { ApiError } from '../lib/errors.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * nginx chuyển `Host: $host`, vốn bỏ cổng (web chạy ở :8080 thì API nhận `Host: localhost`),
 * nên khi Host không kèm cổng thì so theo tên máy của Origin, kèm scheme (`X-Forwarded-Proto`
 * do nginx đặt, không có thì scheme của chính request) để http://tên-máy không mạo danh https.
 */
function isSameHost(origin: string, host: string | undefined, scheme: string): boolean {
  if (!host) return false
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return false
  }
  const hostHasPort = /:\d+$/.test(host) && !host.endsWith(']')
  if (hostHasPort) return url.host === host
  return url.hostname === host && url.protocol === `${scheme}:`
}

/**
 * Chống CSRF phòng thủ chiều sâu (BM-104), bổ sung cho SameSite=Strict của cookie refresh.
 * Request đổi trạng thái (POST/PUT/PATCH/DELETE) chỉ được đi qua khi:
 * - có `Origin` nằm trong danh sách cho phép (web dev 5173 gọi API 3000), hoặc cùng host với
 *   request (web và API cùng tên miền sau nginx);
 * - hoặc không có `Origin` và trình duyệt không báo request đến từ trang khác qua
 *   `Sec-Fetch-Site`: đó là client không phải trình duyệt (script, tích hợp máy chủ), vốn
 *   không mang cookie của người dùng.
 * Trang lạ không giả được hai header này vì trình duyệt tự đặt, script không ghi đè được.
 */
export function csrfProtection({
  allowedOrigins,
}: {
  allowedOrigins: readonly string[]
}): MiddlewareHandler {
  const allowed = new Set(allowedOrigins)
  return async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) return next()

    const origin = c.req.header('origin')
    const fetchSite = c.req.header('sec-fetch-site')

    if (origin !== undefined) {
      const scheme =
        c.req.header('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase() ||
        new URL(c.req.url).protocol.replace(':', '')
      if (allowed.has(origin) || isSameHost(origin, c.req.header('host'), scheme)) return next()
    } else if (fetchSite !== 'cross-site' && fetchSite !== 'same-site') {
      return next()
    }

    c.get('logger')?.warn(
      {
        method: c.req.method,
        path: c.req.path,
        origin: origin ?? null,
        fetchSite: fetchSite ?? null,
      },
      'csrf rejected',
    )
    throw new ApiError('FORBIDDEN', 'Yêu cầu bị từ chối vì không đến từ trang của cửa hàng', {
      code: 'CSRF_ORIGIN_REJECTED',
    })
  }
}

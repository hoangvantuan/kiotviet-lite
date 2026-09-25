import type { Context } from 'hono'
import type { IncomingMessage } from 'node:http'

import { env } from './env.js'

/**
 * Địa chỉ TCP của bên vừa kết nối tới API (proxy hoặc client trực tiếp).
 * Chạy qua `@hono/node-server` thì request gốc nằm ở `c.env.incoming`.
 */
function getSocketAddress(c: Context): string | undefined {
  const bindings = c.env as { incoming?: IncomingMessage } | undefined
  return bindings?.incoming?.socket?.remoteAddress ?? undefined
}

/**
 * Lấy IP client để giới hạn tần suất và ghi audit.
 *
 * Header `X-Forwarded-For` do client tự khai được, proxy chỉ NỐI thêm địa chỉ nó thấy vào cuối.
 * Vì vậy chỉ tin XFF khi đã cấu hình `TRUSTED_PROXY_HOPS` (số proxy tin cậy đứng trước API),
 * và chỉ lấy phần tử thứ N tính từ CUỐI, là địa chỉ mà proxy tin cậy ngoài cùng đã thấy.
 * Mặc định (0 hop) dùng địa chỉ socket, bỏ qua mọi header.
 */
export function getClientIp(c: Context): string {
  const hops = env.trustedProxyHops
  if (hops > 0) {
    const chain = (c.req.header('x-forwarded-for') ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
    // Chuỗi ngắn hơn số hop nghĩa là request không đi qua đủ proxy tin cậy: không tin phần nào.
    const trusted = chain.length >= hops ? chain[chain.length - hops] : undefined
    if (trusted) return trusted
  }
  return getSocketAddress(c) ?? 'unknown'
}

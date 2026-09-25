export const DEFAULT_DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:5174'] as const

function isLocalOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin)
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  } catch {
    return false
  }
}

/**
 * Danh sách origin được CORS và lớp chống CSRF (BM-104) tin. Phần tử rỗng bị bỏ để dấu phẩy thừa
 * không sinh origin "". Production mà chỉ có origin localhost thì trả cảnh báo: trình duyệt của
 * người dùng thật sẽ bị chặn trừ khi truy cập đúng host của API.
 */
export function parseAllowedOrigins(
  raw: string | undefined,
  nodeEnv: string | undefined,
): { origins: string[]; warning?: string } {
  const parsed = (raw ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0)
  const origins = parsed.length > 0 ? parsed : [...DEFAULT_DEV_ORIGINS]
  if (nodeEnv === 'production' && origins.every(isLocalOrigin)) {
    return {
      origins,
      warning:
        parsed.length > 0
          ? 'ALLOWED_ORIGINS only lists localhost origins in production, set the real site origin'
          : 'ALLOWED_ORIGINS is not set in production, falling back to localhost dev origins',
    }
  }
  return { origins }
}

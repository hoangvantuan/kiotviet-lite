import 'dotenv/config'

function required(name: string): string {
  const value = process.env[name]
  if (!value || value.length === 0) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

function optional(name: string, fallback: string): string {
  const value = process.env[name]
  return value && value.length > 0 ? value : fallback
}

/**
 * Dấu hiệu của secret mẫu hoặc secret dùng cho dev/test, không được phép lên production.
 * `.env.production.example` công khai trong repo nên ai cũng biết các giá trị `change-me-*`.
 */
const PLACEHOLDER_SECRET_PATTERN =
  /change-?me|please-?change|example|placeholder|min-32-chars|^test-/i
/** Secret ngẫu nhiên 32 ký tự trở lên luôn có nhiều ký tự khác nhau; ít hơn là chuỗi lặp dễ đoán. */
const MIN_DISTINCT_SECRET_CHARS = 10

function assertStrongSecret(name: string, value: string): void {
  if (PLACEHOLDER_SECRET_PATTERN.test(value)) {
    throw new Error(`${name} is a public placeholder value, generate a random secret`)
  }
  if (new Set(value).size < MIN_DISTINCT_SECRET_CHARS) {
    throw new Error(`${name} is too weak, generate a random secret`)
  }
}

export function validateSecrets(source: NodeJS.ProcessEnv = process.env): void {
  const accessSecret = source.JWT_ACCESS_SECRET
  const refreshSecret = source.JWT_REFRESH_SECRET

  if (!accessSecret || accessSecret.length < 32) {
    throw new Error('JWT_ACCESS_SECRET must be at least 32 characters')
  }
  if (!refreshSecret || refreshSecret.length < 32) {
    throw new Error('JWT_REFRESH_SECRET must be at least 32 characters')
  }

  // GL-05: production từ chối khởi động với secret mẫu công khai hoặc secret yếu
  if (source.NODE_ENV === 'production') {
    assertStrongSecret('JWT_ACCESS_SECRET', accessSecret)
    assertStrongSecret('JWT_REFRESH_SECRET', refreshSecret)
    if (accessSecret === refreshSecret) {
      throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different')
    }
    const notificationKey = source.NOTIFICATION_CONFIG_KEY
    if (notificationKey) {
      assertStrongSecret('NOTIFICATION_CONFIG_KEY', notificationKey)
    }
  }

  const ttl = source.ACCESS_TOKEN_TTL_SECONDS
  if (ttl && isNaN(Number(ttl))) {
    throw new Error('ACCESS_TOKEN_TTL_SECONDS must be a valid number')
  }

  const refreshTtl = source.REFRESH_TOKEN_TTL_SECONDS
  if (refreshTtl && isNaN(Number(refreshTtl))) {
    throw new Error('REFRESH_TOKEN_TTL_SECONDS must be a valid number')
  }

  const hops = source.TRUSTED_PROXY_HOPS
  if (hops && !/^\d+$/.test(hops)) {
    throw new Error('TRUSTED_PROXY_HOPS must be a non-negative integer')
  }
}

validateSecrets()

export const env = {
  get jwtAccessSecret(): string {
    return required('JWT_ACCESS_SECRET')
  },
  get jwtRefreshSecret(): string {
    return required('JWT_REFRESH_SECRET')
  },
  get accessTokenTtlSeconds(): number {
    return Number.parseInt(optional('ACCESS_TOKEN_TTL_SECONDS', '900'), 10)
  },
  get refreshTokenTtlSeconds(): number {
    return Number.parseInt(optional('REFRESH_TOKEN_TTL_SECONDS', String(60 * 60 * 24 * 7)), 10)
  },
  get cookieSecure(): boolean {
    return optional('COOKIE_SECURE', 'false') === 'true'
  },
  get cookieDomain(): string | undefined {
    return process.env.COOKIE_DOMAIN
  },
  get bcryptRounds(): number {
    return Number.parseInt(optional('BCRYPT_ROUNDS', '12'), 10)
  },
  get logLevel(): string {
    return optional('LOG_LEVEL', 'info')
  },
  get logDir(): string {
    return optional('LOG_DIR', './logs')
  },
  get notificationConfigKey(): string {
    return optional('NOTIFICATION_CONFIG_KEY', '')
  },
  get highValueOrderThreshold(): number {
    return Number.parseInt(optional('HIGH_VALUE_ORDER_THRESHOLD', '5000000'), 10)
  },
  /** Số reverse proxy tin cậy đứng trước API (nginx = 1). 0 = không tin `X-Forwarded-For`. */
  get trustedProxyHops(): number {
    return Number.parseInt(optional('TRUSTED_PROXY_HOPS', '0'), 10)
  },
  get jwtGracePeriodDays(): number {
    return Number.parseInt(optional('JWT_GRACE_PERIOD_DAYS', '0'), 10)
  },
} as const

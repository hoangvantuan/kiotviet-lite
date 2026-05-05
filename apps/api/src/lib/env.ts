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

function validateSecrets(): void {
  const accessSecret = process.env.JWT_ACCESS_SECRET
  const refreshSecret = process.env.JWT_REFRESH_SECRET

  if (!accessSecret || accessSecret.length < 32) {
    throw new Error('JWT_ACCESS_SECRET must be at least 32 characters')
  }
  if (!refreshSecret || refreshSecret.length < 32) {
    throw new Error('JWT_REFRESH_SECRET must be at least 32 characters')
  }

  const ttl = process.env.ACCESS_TOKEN_TTL_SECONDS
  if (ttl && isNaN(Number(ttl))) {
    throw new Error('ACCESS_TOKEN_TTL_SECONDS must be a valid number')
  }

  const refreshTtl = process.env.REFRESH_TOKEN_TTL_SECONDS
  if (refreshTtl && isNaN(Number(refreshTtl))) {
    throw new Error('REFRESH_TOKEN_TTL_SECONDS must be a valid number')
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
} as const

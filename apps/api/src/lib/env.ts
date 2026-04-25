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
} as const

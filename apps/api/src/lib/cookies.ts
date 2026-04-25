import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'

import { env } from './env.js'

export const REFRESH_COOKIE_NAME = 'kvl_refresh'

export function setRefreshCookie(c: Context, token: string): void {
  setCookie(c, REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'Lax',
    path: '/api/v1/auth',
    maxAge: env.refreshTokenTtlSeconds,
    domain: env.cookieDomain,
  })
}

export function clearRefreshCookie(c: Context): void {
  deleteCookie(c, REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'Lax',
    path: '/api/v1/auth',
    domain: env.cookieDomain,
  })
}

export function getRefreshCookie(c: Context): string | undefined {
  return getCookie(c, REFRESH_COOKIE_NAME)
}

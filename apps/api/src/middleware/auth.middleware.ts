import type { MiddlewareHandler } from 'hono'

import type { UserRole } from '@kiotviet-lite/shared'

import { ApiError } from '../lib/errors.js'
import { verifyAccessToken } from '../lib/jwt.js'

export interface AuthContext {
  userId: string
  storeId: string
  role: UserRole
}

declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthContext
  }
}

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const header = c.req.header('Authorization')
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    throw new ApiError('UNAUTHORIZED', 'Yêu cầu đăng nhập')
  }
  const token = header.slice(7).trim()
  if (!token) {
    throw new ApiError('UNAUTHORIZED', 'Yêu cầu đăng nhập')
  }
  const payload = verifyAccessToken(token)
  c.set('auth', {
    userId: payload.sub,
    storeId: payload.storeId,
    role: payload.role,
  })
  await next()
}

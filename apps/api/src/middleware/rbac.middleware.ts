import type { MiddlewareHandler } from 'hono'

import { hasPermission, type Permission } from '@kiotviet-lite/shared'

import { ApiError } from '../lib/errors.js'

export function requirePermission(perm: Permission): MiddlewareHandler {
  return async (c, next) => {
    const auth = c.get('auth')
    if (!auth) {
      throw new ApiError('UNAUTHORIZED', 'Yêu cầu đăng nhập')
    }
    if (!hasPermission(auth.role, perm)) {
      throw new ApiError('FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này')
    }
    await next()
  }
}

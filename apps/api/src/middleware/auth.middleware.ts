import { eq } from 'drizzle-orm'
import type { MiddlewareHandler } from 'hono'

import { type UserRole, users } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { verifyAccessToken } from '../lib/jwt.js'
import { setRequestLogActor } from '../lib/logger.js'

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

/**
 * Xác thực access token rồi đối chiếu tài khoản HIỆN HÀNH trong DB ở mỗi request.
 *
 * Token chỉ chứng minh danh tính; trạng thái và vai trò lấy từ DB, nên khóa tài khoản
 * hoặc hạ quyền có hiệu lực ngay thay vì chờ token hết hạn (BM-03).
 * Đánh đổi: thêm một truy vấn theo khóa chính `users.id` cho mỗi request. Không cache
 * để không có khoảng trễ sau khi khóa, và API chạy một instance nên không cần cơ chế
 * vô hiệu cache giữa nhiều tiến trình.
 */
export function requireAuth(db: Db): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header('Authorization')
    if (!header || !header.toLowerCase().startsWith('bearer ')) {
      throw new ApiError('UNAUTHORIZED', 'Yêu cầu đăng nhập')
    }
    const token = header.slice(7).trim()
    if (!token) {
      throw new ApiError('UNAUTHORIZED', 'Yêu cầu đăng nhập')
    }
    const payload = verifyAccessToken(token)
    const [user] = await db
      .select({ storeId: users.storeId, role: users.role, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1)
    if (!user || !user.isActive || user.storeId !== payload.storeId) {
      throw new ApiError('UNAUTHORIZED', 'Tài khoản không khả dụng', { reason: 'inactive' })
    }
    c.set('auth', {
      userId: payload.sub,
      storeId: user.storeId,
      role: user.role,
    })
    setRequestLogActor(user.storeId, payload.sub)
    await next()
  }
}

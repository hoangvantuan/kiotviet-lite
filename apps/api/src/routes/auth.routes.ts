import { Hono } from 'hono'

import {
  type AuthResponse,
  loginSchema,
  type RefreshResponse,
  registerSchema,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { clearRefreshCookie, getRefreshCookie, setRefreshCookie } from '../lib/cookies.js'
import { ApiError } from '../lib/errors.js'
import { parseJson } from '../lib/http.js'
import { errorHandler } from '../middleware/error-handler.js'
import {
  loginUser,
  logoutUser,
  registerStoreOwner,
  rotateRefreshToken,
} from '../services/auth.service.js'

export interface AuthRoutesDeps {
  db: Db
}

export function createAuthRoutes(deps: AuthRoutesDeps) {
  const { db } = deps
  const app = new Hono()
  app.onError(errorHandler)

  app.post('/register', async (c) => {
    const input = await parseJson(c, registerSchema)
    const result = await registerStoreOwner({ db, input })
    setRefreshCookie(c, result.refreshToken)
    const body: { data: AuthResponse } = {
      data: {
        user: result.user,
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
      },
    }
    return c.json(body, 201)
  })

  app.post('/login', async (c) => {
    const input = await parseJson(c, loginSchema)
    const result = await loginUser({ db, input })
    setRefreshCookie(c, result.refreshToken)
    const body: { data: AuthResponse } = {
      data: {
        user: result.user,
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
      },
    }
    return c.json(body)
  })

  app.post('/refresh', async (c) => {
    const token = getRefreshCookie(c)
    if (!token) {
      throw new ApiError('UNAUTHORIZED', 'Thiếu refresh token')
    }
    const result = await rotateRefreshToken({ db, token })
    setRefreshCookie(c, result.refreshToken)
    const body: { data: RefreshResponse } = {
      data: { accessToken: result.accessToken, expiresIn: result.expiresIn },
    }
    return c.json(body)
  })

  app.post('/logout', async (c) => {
    const token = getRefreshCookie(c)
    await logoutUser({ db, token })
    clearRefreshCookie(c)
    return c.body(null, 204)
  })

  return app
}

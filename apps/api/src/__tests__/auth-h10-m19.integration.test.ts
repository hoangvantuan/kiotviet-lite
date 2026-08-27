import { and, eq, isNull } from 'drizzle-orm'
import jwt from 'jsonwebtoken'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { refreshTokens } from '@kiotviet-lite/shared'

import { hashToken } from '../lib/jwt.js'
import { rotateRefreshToken } from '../services/auth.service.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.ACCESS_TOKEN_TTL_SECONDS = '900'
  process.env.REFRESH_TOKEN_TTL_SECONDS = '604800'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

describe('H10 — Refresh token rotation race condition', () => {
  let env: TestEnv

  beforeEach(async () => {
    env = await createTestEnv()
  })

  afterEach(async () => {
    await env.close()
  })

  it('hai request refresh đồng thời cùng token: đúng một thành công, một 401', async () => {
    const { token } = await env.issueRefreshToken(env.owner.id)

    // Chạy hai request refresh song song cùng một token
    const results = await Promise.allSettled([
      rotateRefreshToken({ db: env.db, token }),
      rotateRefreshToken({ db: env.db, token }),
    ])

    const successes = results.filter((r) => r.status === 'fulfilled')
    const failures = results.filter((r) => r.status === 'rejected')

    expect(successes).toHaveLength(1)
    expect(failures).toHaveLength(1)

    // Request thất bại phải trả lỗi UNAUTHORIZED
    const rejectedReason = (failures[0] as PromiseRejectedResult).reason as {
      code?: string
      details?: { reason?: string }
    }
    expect(rejectedReason.code).toBe('UNAUTHORIZED')
    expect(rejectedReason.details?.reason).toBe('reuse')
  })

  it('sau race condition, toàn bộ token family của user bị thu hồi', async () => {
    // Tạo hai refresh token cho cùng user
    const { token: token1 } = await env.issueRefreshToken(env.owner.id)
    const { token: token2 } = await env.issueRefreshToken(env.owner.id)

    // Kích hoạt race condition trên token1
    await Promise.allSettled([
      rotateRefreshToken({ db: env.db, token: token1 }),
      rotateRefreshToken({ db: env.db, token: token1 }),
    ])

    // Token2 phải cũng bị thu hồi (toàn bộ family của user)
    await expect(rotateRefreshToken({ db: env.db, token: token2 })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })

  it('refresh tuần tự hoạt động bình thường', async () => {
    const { token } = await env.issueRefreshToken(env.owner.id)

    // Rotate lần 1
    const result1 = await rotateRefreshToken({ db: env.db, token })
    expect(result1.accessToken).toBeTruthy()
    expect(result1.refreshToken).toBeTruthy()

    // Rotate lần 2 bằng token mới
    const result2 = await rotateRefreshToken({ db: env.db, token: result1.refreshToken })
    expect(result2.accessToken).toBeTruthy()

    // Token cũ đã bị thu hồi → phát hiện tái sử dụng
    await expect(rotateRefreshToken({ db: env.db, token })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      details: { reason: 'reuse' },
    })
  })

  it('token đã dùng rồi bị phát hiện tái sử dụng và thu hồi cả family', async () => {
    const { token } = await env.issueRefreshToken(env.owner.id)

    // Dùng token lần đầu → thành công
    const result = await rotateRefreshToken({ db: env.db, token })
    expect(result.refreshToken).toBeTruthy()

    // Dùng lại token cũ → phát hiện reuse, thu hồi cả family
    await expect(rotateRefreshToken({ db: env.db, token })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      details: { reason: 'reuse' },
    })

    // Token mới cũng bị thu hồi
    await expect(
      rotateRefreshToken({ db: env.db, token: result.refreshToken }),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })

    // Xác minh trong DB: không còn token nào chưa revoke cho user này
    const activeTokens = await env.db.query.refreshTokens.findMany({
      where: and(eq(refreshTokens.userId, env.owner.id), isNull(refreshTokens.revokedAt)),
    })
    expect(activeTokens).toHaveLength(0)
  })
})

describe('M19 — JWT grace period cho iss/aud', () => {
  let env: TestEnv

  beforeEach(async () => {
    env = await createTestEnv()
  })

  afterEach(async () => {
    process.env.JWT_GRACE_PERIOD_DAYS = '0'
    await env.close()
  })

  /**
   * Helper: tạo refresh token KHÔNG có iss/aud (mô phỏng token cũ trước khi deploy),
   * rồi insert vào DB.
   */
  async function issueTokenWithoutIssAud(userId: string) {
    const secret = process.env.JWT_REFRESH_SECRET!
    const payload = { sub: userId, jti: crypto.randomUUID(), type: 'refresh' }
    const token = jwt.sign(payload, secret, { expiresIn: 604800 })
    const tokenHash = hashToken(token)
    await env.db.insert(refreshTokens).values({
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + 604800 * 1000),
    })
    return { token, tokenHash }
  }

  it('grace period bật: token cũ thiếu iss/aud vẫn refresh được', async () => {
    process.env.JWT_GRACE_PERIOD_DAYS = '7'

    const { token } = await issueTokenWithoutIssAud(env.owner.id)
    const result = await rotateRefreshToken({ db: env.db, token })

    expect(result.accessToken).toBeTruthy()
    expect(result.refreshToken).toBeTruthy()
  })

  it('grace period tắt (0): token cũ thiếu iss/aud bị từ chối 401', async () => {
    process.env.JWT_GRACE_PERIOD_DAYS = '0'

    const { token } = await issueTokenWithoutIssAud(env.owner.id)

    await expect(rotateRefreshToken({ db: env.db, token })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })

  it('token có iss/aud đầy đủ luôn hoạt động bất kể grace period', async () => {
    process.env.JWT_GRACE_PERIOD_DAYS = '0'

    const { token } = await env.issueRefreshToken(env.owner.id)
    const result = await rotateRefreshToken({ db: env.db, token })

    expect(result.accessToken).toBeTruthy()
    expect(result.refreshToken).toBeTruthy()
  })
})

import { beforeAll, describe, expect, it } from 'vitest'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.ACCESS_TOKEN_TTL_SECONDS = '900'
  process.env.REFRESH_TOKEN_TTL_SECONDS = '604800'
})

describe('JWT utils', () => {
  it('signAccessToken + verifyAccessToken trả về payload đúng', async () => {
    const { signAccessToken, verifyAccessToken } = await import('./jwt.js')
    const token = signAccessToken({
      userId: '01923000-0000-7000-8000-000000000001',
      storeId: '01923000-0000-7000-8000-000000000002',
      role: 'owner',
    })
    const payload = verifyAccessToken(token)
    expect(payload.sub).toBe('01923000-0000-7000-8000-000000000001')
    expect(payload.storeId).toBe('01923000-0000-7000-8000-000000000002')
    expect(payload.role).toBe('owner')
    expect(payload.type).toBe('access')
  })

  it('signRefreshToken sinh jti unique và verify được', async () => {
    const { signRefreshToken, verifyRefreshToken } = await import('./jwt.js')
    const a = signRefreshToken('01923000-0000-7000-8000-000000000001')
    const b = signRefreshToken('01923000-0000-7000-8000-000000000001')
    expect(a.jti).not.toBe(b.jti)
    const payload = verifyRefreshToken(a.token)
    expect(payload.jti).toBe(a.jti)
    expect(payload.type).toBe('refresh')
  })

  it('verifyAccessToken ném ApiError UNAUTHORIZED khi token sai', async () => {
    const { verifyAccessToken } = await import('./jwt.js')
    const { ApiError } = await import('./errors.js')
    expect(() => verifyAccessToken('not-a-token')).toThrow(ApiError)
  })
})

describe('password utils', () => {
  it('hash + verify đúng', async () => {
    process.env.BCRYPT_ROUNDS = '4'
    const { hashPassword, verifyPassword } = await import('./password.js')
    const hash = await hashPassword('matkhau123')
    expect(await verifyPassword('matkhau123', hash)).toBe(true)
    expect(await verifyPassword('saimk', hash)).toBe(false)
  })
})

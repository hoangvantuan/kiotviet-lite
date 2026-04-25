import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createNotificationRoutes } from '../routes/notifications.routes.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.BCRYPT_ROUNDS = '4'
})

const validEmitBody = {
  type: 'stock.negative',
  severity: 'error',
  title: 'Tồn kho âm',
  body: 'Sản phẩm ABC giảm xuống -5',
}

describe('POST /emit', () => {
  let env: TestEnv
  let app: ReturnType<typeof createNotificationRoutes>

  beforeEach(async () => {
    env = await createTestEnv()
    app = createNotificationRoutes({ db: env.db })
  })

  afterEach(async () => {
    await env.close()
  })

  it('401 khi không có token', async () => {
    const res = await app.request('/emit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validEmitBody),
    })
    expect(res.status).toBe(401)
  })

  it('happy path: POST event hợp lệ, trả 200 + accepted', async () => {
    const res = await app.request('/emit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...env.owner.authHeader,
      },
      body: JSON.stringify(validEmitBody),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { accepted: boolean; results: unknown[] } }
    expect(body.data.accepted).toBe(true)
    expect(Array.isArray(body.data.results)).toBe(true)
  })

  it('invalid event type: 400 validation error', async () => {
    const res = await app.request('/emit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...env.owner.authHeader,
      },
      body: JSON.stringify({
        ...validEmitBody,
        type: 'invalid.event.type',
      }),
    })
    expect(res.status).toBe(400)
  })

  it('client không được gửi field storeId, id: bị reject', async () => {
    const res = await app.request('/emit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...env.owner.authHeader,
      },
      body: JSON.stringify({
        ...validEmitBody,
        storeId: 'injected-store-id',
        id: 'injected-id',
      }),
    })
    expect(res.status).toBe(400)
  })
})

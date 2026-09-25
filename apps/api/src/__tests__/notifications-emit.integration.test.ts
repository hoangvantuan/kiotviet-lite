import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { notificationChannels, notificationRules } from '@kiotviet-lite/shared'

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
    const [channel] = await env.db
      .insert(notificationChannels)
      .values({ storeId: env.storeId, transport: 'console', name: 'Diagnostic console' })
      .returning()
    await env.db.insert(notificationRules).values({
      storeId: env.storeId,
      eventType: 'stock.negative',
      channelId: channel!.id,
      minSeverity: 'error',
      throttleSeconds: 0,
    })
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

  it('reports delivery rejection without exposing transport details', async () => {
    const [channel] = await env.db
      .insert(notificationChannels)
      .values({ storeId: env.storeId, transport: 'webhook', name: 'Broken webhook' })
      .returning()
    await env.db.insert(notificationRules).values({
      storeId: env.storeId,
      eventType: 'stock.negative',
      channelId: channel!.id,
      minSeverity: 'error',
      throttleSeconds: 0,
    })
    const res = await app.request('/emit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...env.owner.authHeader },
      body: JSON.stringify(validEmitBody),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: { accepted: boolean; results: Array<{ ok: boolean; status: string; attempts: number }> }
    }
    expect(body.data).toEqual({
      accepted: false,
      results: [{ ok: false, status: 'dead', attempts: 1 }],
    })
  })

  it('reports an event with no enabled route as not delivered', async () => {
    await env.db.update(notificationRules).set({ enabled: false })
    const res = await app.request('/emit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...env.owner.authHeader },
      body: JSON.stringify(validEmitBody),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { accepted: false, results: [] } })
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

  it('403 Forbidden khi staff gọi POST /emit', async () => {
    const res = await app.request('/emit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...env.staff.authHeader,
      },
      body: JSON.stringify(validEmitBody),
    })
    expect(res.status).toBe(403)
  })
})

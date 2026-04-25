import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import { errorHandler } from '../middleware/error-handler.js'
import { requestLoggerMiddleware } from '../middleware/request-logger.middleware.js'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function createTestApp() {
  const app = new Hono()
  app.use('*', requestLoggerMiddleware)
  app.onError(errorHandler)
  app.get('/api/v1/health', (c) => c.json({ status: 'ok' }))
  app.get('/api/v1/error-test', () => {
    throw new Error('test error')
  })
  return app
}

describe('request logging middleware', () => {
  it('GET /api/v1/health trả về X-Request-Id header dạng UUID', async () => {
    const app = createTestApp()
    const res = await app.request('/api/v1/health')
    expect(res.status).toBe(200)

    const requestId = res.headers.get('X-Request-Id')
    expect(requestId).toBeTruthy()
    expect(requestId).toMatch(UUID_REGEX)
  })

  it('mỗi request có requestId khác nhau', async () => {
    const app = createTestApp()
    const res1 = await app.request('/api/v1/health')
    const res2 = await app.request('/api/v1/health')

    const id1 = res1.headers.get('X-Request-Id')
    const id2 = res2.headers.get('X-Request-Id')

    expect(id1).toBeTruthy()
    expect(id2).toBeTruthy()
    expect(id1).not.toBe(id2)
  })

  it('request tới endpoint không tồn tại vẫn có X-Request-Id', async () => {
    const app = createTestApp()
    const res = await app.request('/api/v1/nonexistent-endpoint-xyz')
    const requestId = res.headers.get('X-Request-Id')
    expect(requestId).toBeTruthy()
    expect(requestId).toMatch(UUID_REGEX)
  })

  it('error handler vẫn trả X-Request-Id khi exception xảy ra', async () => {
    const app = createTestApp()
    const res = await app.request('/api/v1/error-test')
    expect(res.status).toBe(500)

    const requestId = res.headers.get('X-Request-Id')
    expect(requestId).toBeTruthy()
    expect(requestId).toMatch(UUID_REGEX)

    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('INTERNAL_ERROR')
  })
})

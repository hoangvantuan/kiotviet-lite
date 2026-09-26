import { afterEach, describe, expect, it } from 'vitest'

import type { Db } from '../db/index.js'
import { markShuttingDown, resetLifecycleForTest } from '../lib/lifecycle.js'
import { createHealthRoutes } from '../routes/health.routes.js'
import { createTestEnv } from './helpers/test-env.js'

type HealthBody = { status: string; checks: { db: string; migrations: string } }
const body = async (response: Response) => (await response.json()) as HealthBody

// GL-10: healthcheck cũ luôn trả 200 dù DB không tới được, Docker không bao giờ phát hiện sự cố.
describe('healthcheck phản ánh DB thật', () => {
  afterEach(() => resetLifecycleForTest())

  it('DB đã migrate đủ: readiness 200, liveness 200', async () => {
    const env = await createTestEnv()
    try {
      const app = createHealthRoutes({ db: env.db })
      const ready = await app.request('/')
      expect(ready.status).toBe(200)
      expect(await body(ready)).toEqual({
        status: 'ok',
        checks: { db: 'ok', migrations: 'ok' },
      })
      expect(ready.headers.get('Cache-Control')).toBe('no-store')
      expect((await app.request('/live')).status).toBe(200)
    } finally {
      await env.close()
    }
  })

  it('DB không tới được: readiness 503, liveness vẫn 200', async () => {
    // Không truy vấn PGlite đã close: WASM có lúc kẹt đồng bộ, chặn event loop nên cả
    // testTimeout cũng không cứu được (CI #54 treo 20 phút). Giả lập lỗi kết nối như postgres-js.
    const refused = {
      execute: () =>
        Promise.reject(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })),
    } as unknown as Db
    const app = createHealthRoutes({ db: refused })
    const ready = await app.request('/')
    expect(ready.status).toBe(503)
    expect(await body(ready)).toEqual({
      status: 'unavailable',
      checks: { db: 'down', migrations: 'down' },
    })
    expect((await app.request('/live')).status).toBe(200)
  })

  it('DB treo quá hạn: readiness 503 thay vì chờ mãi', async () => {
    const hanging = { execute: () => new Promise(() => {}) } as unknown as Db
    const app = createHealthRoutes({ db: hanging, timeoutMs: 50 })
    const ready = await app.request('/')
    expect(ready.status).toBe(503)
    expect((await body(ready)).checks.db).toBe('down')
  })

  // Không dựng PGlite trần rồi truy vấn schema chưa có: CI treo 20 đến 45 phút đúng ở ca này
  // (WASM kẹt đồng bộ nên testTimeout không cắt được). Giả lập đúng mã lỗi Postgres trả về:
  // postgres-js đặt code ở lỗi, drizzle bọc lỗi gốc vào cause.
  it.each([
    ['schema drizzle chưa có (3F000)', { code: '3F000' }],
    ['bảng migration chưa có, lỗi bọc trong cause (42P01)', { cause: { code: '42P01' } }],
  ])('DB tới được nhưng chưa migrate: readiness 503 migrations pending, %s', async (_, shape) => {
    const unmigrated = {
      execute: () => Promise.reject(Object.assign(new Error('relation does not exist'), shape)),
    } as unknown as Db
    const app = createHealthRoutes({ db: unmigrated })
    const ready = await app.request('/')
    expect(ready.status).toBe(503)
    expect((await body(ready)).checks).toEqual({ db: 'ok', migrations: 'pending' })
  })

  it('thiếu migration mới hơn bản build: readiness 503', async () => {
    const env = await createTestEnv()
    try {
      const app = createHealthRoutes({ db: env.db, expectedMigrations: 10_000 })
      const ready = await app.request('/')
      expect(ready.status).toBe(503)
      expect((await body(ready)).checks).toEqual({ db: 'ok', migrations: 'pending' })
    } finally {
      await env.close()
    }
  })

  it('đang tắt êm: readiness 503 để proxy ngừng gửi việc mới', async () => {
    const env = await createTestEnv()
    try {
      const app = createHealthRoutes({ db: env.db })
      markShuttingDown()
      const ready = await app.request('/')
      expect(ready.status).toBe(503)
      expect((await body(ready)).checks.db).toBe('shutting_down')
    } finally {
      await env.close()
    }
  })
})

import type { OpsAlert, OpsAlerter } from '@kiotviet-lite/notifications'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { serverErrorSpikeAlert, watchReadiness } from '../lib/ops-monitor.js'
import { createTestEnv } from './helpers/test-env.js'

function recordingAlerter() {
  const sent: OpsAlert[] = []
  const alerter: OpsAlerter = {
    enabled: true,
    send: vi.fn(async (alert: OpsAlert) => {
      sent.push(alert)
      return { status: 'sent' as const, deliveries: [] }
    }),
  }
  return { sent, alerter }
}

// GL-13: không có gì báo cho người vận hành khi API lỗi hàng loạt hoặc mất DB.
describe('giám sát trong API', () => {
  it('cảnh báo khi 5xx chạm ngưỡng trong cửa sổ, bỏ qua 4xx và 5xx rải rác', async () => {
    const { sent, alerter } = recordingAlerter()
    let clock = 0
    const app = new Hono()
    app.use(
      '*',
      serverErrorSpikeAlert({ alerter, threshold: 3, windowMs: 60_000, now: () => clock }),
    )
    app.get('/boom', () => {
      throw new Error('boom')
    })
    app.get('/bad', (c) => c.json({}, 400))

    for (let i = 0; i < 5; i++) await app.request('/bad')
    await app.request('/boom')
    clock = 61_000
    await app.request('/boom')
    await app.request('/boom')
    expect(sent).toHaveLength(0)
    await app.request('/boom')
    await Promise.resolve()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ key: 'http.5xx_spike', severity: 'error' })
  })

  it('DB mất kết nối: cảnh báo critical sau 3 lần lỗi liên tiếp, báo phục hồi một lần', async () => {
    const env = await createTestEnv()
    const { sent, alerter } = recordingAlerter()
    const healthy = watchReadiness({ db: env.db, alerter, intervalMs: 3_600_000 })
    await healthy.tick()
    healthy.stop()
    expect(sent).toHaveLength(0)

    let down = true
    const db = new Proxy(env.db, {
      get(target, property, receiver) {
        if (property === 'execute' && down) return () => Promise.reject(new Error('ECONNREFUSED'))
        return Reflect.get(target, property, receiver)
      },
    })
    const watcher = watchReadiness({ db, alerter, intervalMs: 3_600_000 })
    try {
      await watcher.tick()
      await watcher.tick()
      expect(sent).toHaveLength(0)
      await watcher.tick()
      await watcher.tick()
      expect(sent).toHaveLength(1)
      expect(sent[0]).toMatchObject({ key: 'health.readiness', severity: 'critical' })
      expect(sent[0]!.body).toContain('db=down')

      down = false
      await watcher.tick()
      await watcher.tick()
      expect(sent).toHaveLength(2)
      expect(sent[1]).toMatchObject({ key: 'health.readiness', severity: 'info' })
    } finally {
      watcher.stop()
      await env.close()
    }
  })
})

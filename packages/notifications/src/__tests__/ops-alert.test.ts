import { describe, expect, it, vi } from 'vitest'

import { createOpsAlerter, opsAlertConfigFromEnv } from '../ops-alert.js'
import { verifyWebhookSignature } from '../transports/webhook.js'

type Call = { url: string; init: RequestInit }

function mockHttp(status = 200) {
  const calls: Call[] = []
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response('{}', { status })
  }) as unknown as typeof fetch
  return { calls, fetchFn }
}

const alert = {
  key: 'health.db',
  severity: 'critical' as const,
  title: 'API mất kết nối DB',
  body: 'Readiness 503 liên tiếp 3 lần',
}

describe('opsAlertConfigFromEnv', () => {
  it('không cấu hình đích nào hoặc OPS_ALERT_ENABLED=false thì tắt', () => {
    expect(opsAlertConfigFromEnv({}).config).toBeNull()
    expect(
      opsAlertConfigFromEnv({
        OPS_ALERT_ENABLED: 'false',
        OPS_ALERT_TELEGRAM_BOT_TOKEN: 't',
        OPS_ALERT_TELEGRAM_CHAT_ID: '1',
      }).config,
    ).toBeNull()
  })

  it('đọc Telegram và webhook, mặc định throttle 900 s', () => {
    const { config, warnings } = opsAlertConfigFromEnv({
      OPS_ALERT_SOURCE: 'cua-hang-a',
      OPS_ALERT_TELEGRAM_BOT_TOKEN: '123:abc',
      OPS_ALERT_TELEGRAM_CHAT_ID: '-100',
      OPS_ALERT_WEBHOOK_URL: 'https://hooks.example.com/x',
      OPS_ALERT_WEBHOOK_SECRET: 's3cret',
    })
    expect(warnings).toEqual([])
    expect(config).toEqual({
      source: 'cua-hang-a',
      throttleSeconds: 900,
      telegram: { botToken: '123:abc', chatId: '-100' },
      webhook: { url: 'https://hooks.example.com/x', hmacSecret: 's3cret' },
    })
  })

  it('cấu hình dở hoặc webhook http bị bỏ qua kèm cảnh báo', () => {
    const { config, warnings } = opsAlertConfigFromEnv({
      OPS_ALERT_TELEGRAM_BOT_TOKEN: '123:abc',
      OPS_ALERT_WEBHOOK_URL: 'http://hooks.example.com/x',
    })
    expect(config).toBeNull()
    expect(warnings).toHaveLength(2)
  })
})

describe('createOpsAlerter', () => {
  it('gửi Telegram sendMessage dạng văn bản thuần', async () => {
    const http = mockHttp()
    const alerter = createOpsAlerter(
      { source: 'kvl', throttleSeconds: 900, telegram: { botToken: '123:abc', chatId: '-100' } },
      { fetch: http.fetchFn, now: () => Date.parse('2026-09-25T10:00:00Z') },
    )
    const result = await alerter.send(alert)
    expect(result).toEqual({ status: 'sent', deliveries: [{ destination: 'telegram', ok: true }] })
    expect(http.calls).toHaveLength(1)
    expect(http.calls[0]!.url).toBe('https://api.telegram.org/bot123:abc/sendMessage')
    expect(JSON.parse(String(http.calls[0]!.init.body))).toEqual({
      chat_id: '-100',
      text: '[CRITICAL] kvl: API mất kết nối DB\nReadiness 503 liên tiếp 3 lần\n\n2026-09-25T10:00:00.000Z',
      disable_web_page_preview: true,
    })
  })

  it('webhook ký HMAC kiểm được bằng verifyWebhookSignature', async () => {
    const http = mockHttp()
    const alerter = createOpsAlerter(
      {
        source: 'kvl',
        throttleSeconds: 900,
        webhook: { url: 'https://hooks.example.com/x', hmacSecret: 's3cret' },
      },
      { fetch: http.fetchFn },
    )
    await alerter.send(alert)
    const { init } = http.calls[0]!
    const headers = init.headers as Record<string, string>
    const body = String(init.body)
    expect(JSON.parse(body)).toMatchObject({
      key: 'health.db',
      severity: 'critical',
      source: 'kvl',
    })
    expect(
      verifyWebhookSignature({
        signature: headers['X-KVL-Signature']!,
        timestamp: headers['X-KVL-Timestamp']!,
        nonce: headers['X-KVL-Nonce']!,
        body,
        secret: 's3cret',
      }),
    ).toEqual({ valid: true })
  })

  it('chặn spam theo khóa trong khoảng throttle; force bỏ qua throttle', async () => {
    const http = mockHttp()
    let clock = 0
    const alerter = createOpsAlerter(
      { source: 'kvl', throttleSeconds: 60, telegram: { botToken: 't', chatId: '1' } },
      { fetch: http.fetchFn, now: () => clock },
    )
    expect((await alerter.send(alert)).status).toBe('sent')
    clock = 30_000
    expect((await alerter.send(alert)).status).toBe('throttled')
    expect((await alerter.send({ ...alert, key: 'backup' })).status).toBe('sent')
    expect((await alerter.send({ ...alert, force: true })).status).toBe('sent')
    clock = 200_000
    expect((await alerter.send(alert)).status).toBe('sent')
    expect(http.calls).toHaveLength(4)
  })

  it('đích lỗi trả failed, không ném lỗi, không lộ token; lần sau được thử lại', async () => {
    const failing = vi.fn(async () => {
      throw new TypeError('fetch failed https://api.telegram.org/bot123:abc/sendMessage')
    }) as unknown as typeof fetch
    const alerter = createOpsAlerter(
      { source: 'kvl', throttleSeconds: 900, telegram: { botToken: '123:abc', chatId: '1' } },
      { fetch: failing },
    )
    const result = await alerter.send(alert)
    expect(result).toEqual({
      status: 'failed',
      deliveries: [{ destination: 'telegram', ok: false, error: 'NETWORK_ERROR' }],
    })
    expect(JSON.stringify(result)).not.toContain('123:abc')
    expect((await alerter.send(alert)).status).toBe('failed')
  })

  it('HTTP 500 là failed; tắt thì không gọi mạng', async () => {
    const http = mockHttp(500)
    const alerter = createOpsAlerter(
      { source: 'kvl', throttleSeconds: 900, webhook: { url: 'https://hooks.example.com/x' } },
      { fetch: http.fetchFn },
    )
    expect(await alerter.send(alert)).toEqual({
      status: 'failed',
      deliveries: [{ destination: 'webhook', ok: false, error: 'HTTP 500' }],
    })
    const off = createOpsAlerter(null, { fetch: http.fetchFn })
    expect(off.enabled).toBe(false)
    expect(await off.send(alert)).toEqual({ status: 'disabled', deliveries: [] })
    expect(http.calls).toHaveLength(1)
  })
})

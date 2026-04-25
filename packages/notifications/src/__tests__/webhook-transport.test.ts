import { createHmac } from 'node:crypto'
import { uuidv7 } from 'uuidv7'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { NotificationEvent } from '@kiotviet-lite/shared'

import { WebhookTransport } from '../transports/webhook.js'

const mockFetch = vi.fn()

function makeEvent(overrides: Partial<NotificationEvent> = {}): NotificationEvent {
  return {
    id: uuidv7(),
    storeId: uuidv7(),
    type: 'stock.negative',
    severity: 'error',
    title: 'Tồn kho âm',
    body: 'Sản phẩm ABC giảm xuống -5',
    occurredAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('WebhookTransport', () => {
  const transport = new WebhookTransport()

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('gửi thành công 200, trả ok: true', async () => {
    mockFetch.mockResolvedValueOnce(new Response('OK', { status: 200, statusText: 'OK' }))

    const result = await transport.send(makeEvent(), { url: 'https://example.com/hook' })

    expect(result).toEqual({ ok: true, attempts: 1 })
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/hook',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    )
  })

  it('verify header X-KVL-Signature = HMAC-SHA256 đúng', async () => {
    mockFetch.mockResolvedValueOnce(new Response('OK', { status: 200, statusText: 'OK' }))

    const event = makeEvent()
    const secret = 'my-webhook-secret'
    const expectedBody = JSON.stringify(event)
    const expectedSig = createHmac('sha256', secret).update(expectedBody, 'utf8').digest('hex')

    await transport.send(event, { url: 'https://example.com/hook', hmacSecret: secret })

    const callHeaders = mockFetch.mock.calls[0]?.[1]?.headers as Record<string, string>
    expect(callHeaders['X-KVL-Signature']).toBe(expectedSig)
  })

  it('webhook không có hmacSecret: gửi không có header X-KVL-Signature', async () => {
    mockFetch.mockResolvedValueOnce(new Response('OK', { status: 200, statusText: 'OK' }))

    await transport.send(makeEvent(), { url: 'https://example.com/hook' })

    const callHeaders = mockFetch.mock.calls[0]?.[1]?.headers as Record<string, string>
    expect(callHeaders['X-KVL-Signature']).toBeUndefined()
  })

  it('response 401: trả retriable false', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }),
    )

    const result = await transport.send(makeEvent(), { url: 'https://example.com/hook' })

    expect(result).toEqual({
      ok: false,
      error: 'HTTP 401 Unauthorized',
      attempts: 1,
      retriable: false,
    })
  })

  it('response 403: trả retriable false', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Forbidden', { status: 403, statusText: 'Forbidden' }),
    )

    const result = await transport.send(makeEvent(), { url: 'https://example.com/hook' })

    expect(result).toEqual({
      ok: false,
      error: 'HTTP 403 Forbidden',
      attempts: 1,
      retriable: false,
    })
  })

  it('response 500: trả retriable true', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Error', { status: 500, statusText: 'Internal Server Error' }),
    )

    const result = await transport.send(makeEvent(), { url: 'https://example.com/hook' })

    expect(result).toEqual({
      ok: false,
      error: 'HTTP 500 Internal Server Error',
      attempts: 1,
      retriable: true,
    })
  })

  it('response 429: trả retriable true', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Rate Limited', { status: 429, statusText: 'Too Many Requests' }),
    )

    const result = await transport.send(makeEvent(), { url: 'https://example.com/hook' })

    expect(result).toEqual({
      ok: false,
      error: 'HTTP 429 Too Many Requests',
      attempts: 1,
      retriable: true,
    })
  })

  it('network error (TypeError): trả retriable true', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'))

    const result = await transport.send(makeEvent(), { url: 'https://example.com/hook' })

    expect(result).toEqual({
      ok: false,
      error: 'fetch failed',
      attempts: 1,
      retriable: true,
    })
  })

  it('thiếu URL: trả error không retriable', async () => {
    const result = await transport.send(makeEvent(), {})

    expect(result).toEqual({
      ok: false,
      error: 'Missing webhook URL',
      attempts: 1,
      retriable: false,
    })
  })

  it('URL không hợp lệ: trả error', async () => {
    const result = await transport.send(makeEvent(), { url: 'not-a-url' })

    expect(result).toEqual({
      ok: false,
      error: 'Invalid webhook URL',
      attempts: 1,
      retriable: false,
    })
  })

  it('URL protocol không phải HTTP(S): trả error', async () => {
    const result = await transport.send(makeEvent(), { url: 'ftp://example.com/hook' })

    expect(result).toEqual({
      ok: false,
      error: 'Webhook URL must use HTTP(S)',
      attempts: 1,
      retriable: false,
    })
  })

  it('URL trỏ về private network: trả error', async () => {
    const privateUrls = [
      'http://127.0.0.1/hook',
      'http://10.0.0.1/hook',
      'http://192.168.1.1/hook',
      'http://172.16.0.1/hook',
      'http://169.254.169.254/latest/meta-data/',
      'http://localhost/hook',
    ]

    for (const url of privateUrls) {
      const result = await transport.send(makeEvent(), { url })
      expect(result).toEqual({
        ok: false,
        error: 'Webhook URL must not target private network',
        attempts: 1,
        retriable: false,
      })
    }
  })
})

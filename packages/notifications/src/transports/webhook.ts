import { createHmac } from 'node:crypto'

import type { NotificationEvent } from '@kiotviet-lite/shared'

import type { SendResult, Transport } from './base.js'

function isPrivateHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '::1' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  if (parts.length !== 4 || parts.some((p) => !/^\d+$/.test(p))) return false
  const a = Number(parts[0])
  const b = Number(parts[1])
  if (a === 127 || a === 10 || a === 0) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 169 && b === 254) return true
  return false
}

export class WebhookTransport implements Transport {
  readonly name = 'webhook'

  async send(event: NotificationEvent, config: Record<string, unknown>): Promise<SendResult> {
    const url = config.url as string | undefined
    const hmacSecret = config.hmacSecret as string | undefined

    if (!url) {
      return { ok: false, error: 'Missing webhook URL', attempts: 1, retriable: false }
    }

    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return { ok: false, error: 'Invalid webhook URL', attempts: 1, retriable: false }
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { ok: false, error: 'Webhook URL must use HTTP(S)', attempts: 1, retriable: false }
    }

    if (isPrivateHost(parsed.hostname)) {
      return {
        ok: false,
        error: 'Webhook URL must not target private network',
        attempts: 1,
        retriable: false,
      }
    }

    const body = JSON.stringify(event)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (hmacSecret) {
      headers['X-KVL-Signature'] = createHmac('sha256', hmacSecret)
        .update(body, 'utf8')
        .digest('hex')
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10_000),
      })

      if (response.ok) {
        await response.body?.cancel()
        return { ok: true, attempts: 1 }
      }

      await response.body?.cancel()
      const retriable = response.status >= 500 || response.status === 429
      return {
        ok: false,
        error: `HTTP ${response.status} ${response.statusText}`,
        attempts: 1,
        retriable,
      }
    } catch (err) {
      if (err instanceof TypeError) {
        return { ok: false, error: err.message, attempts: 1, retriable: true }
      }
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        return { ok: false, error: 'Request timeout', attempts: 1, retriable: true }
      }
      return { ok: false, error: String(err), attempts: 1, retriable: false }
    }
  }
}

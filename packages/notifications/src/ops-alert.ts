import { webhookHeaders } from './transports/webhook.js'

// Cảnh báo vận hành cấp hệ thống (không gắn cửa hàng): healthcheck lỗi, lỗi 5xx tăng đột biến,
// sao lưu lỗi, bất biến dữ liệu lệch. Đích cấu hình qua biến môi trường của người vận hành,
// khác với kênh thông báo của từng cửa hàng (bảng notification_channels).
// Script shell trong deploy/scripts/lib/alert.sh gửi cùng định dạng bằng curl.

export type OpsAlertSeverity = 'info' | 'warn' | 'error' | 'critical'

export interface OpsAlert {
  /** Khóa chống spam: cùng khóa chỉ gửi một lần trong khoảng throttle. */
  key: string
  severity: OpsAlertSeverity
  title: string
  body: string
  /** Bỏ qua throttle (vd thông báo đã phục hồi). */
  force?: boolean
}

export interface OpsAlertConfig {
  source: string
  throttleSeconds: number
  telegram?: { botToken: string; chatId: string }
  webhook?: { url: string; hmacSecret?: string }
}

export interface OpsAlertDelivery {
  destination: 'telegram' | 'webhook'
  ok: boolean
  error?: string
}

export type OpsAlertResult =
  | { status: 'disabled' | 'throttled'; deliveries: [] }
  | { status: 'sent' | 'failed'; deliveries: OpsAlertDelivery[] }

export interface OpsAlerter {
  readonly enabled: boolean
  send(alert: OpsAlert): Promise<OpsAlertResult>
}

const SEVERITY_BADGE: Record<OpsAlertSeverity, string> = {
  info: '[INFO]',
  warn: '[WARN]',
  error: '[ERROR]',
  critical: '[CRITICAL]',
}
const TIMEOUT_MS = 10_000
const MAX_BODY_LENGTH = 3_000

/**
 * Đọc cấu hình từ env. Trả `config: null` khi tắt (OPS_ALERT_ENABLED=false) hoặc chưa cấu hình
 * đích nào; `warnings` liệt kê đích cấu hình dở (bị bỏ qua) để API ghi log lúc khởi động.
 */
export function opsAlertConfigFromEnv(env: Record<string, string | undefined> = process.env): {
  config: OpsAlertConfig | null
  warnings: string[]
} {
  const warnings: string[] = []
  if (env.OPS_ALERT_ENABLED?.trim().toLowerCase() === 'false') return { config: null, warnings }

  const botToken = env.OPS_ALERT_TELEGRAM_BOT_TOKEN?.trim()
  const chatId = env.OPS_ALERT_TELEGRAM_CHAT_ID?.trim()
  let telegram: OpsAlertConfig['telegram']
  if (botToken && chatId) telegram = { botToken, chatId }
  else if (botToken || chatId) {
    warnings.push('OPS_ALERT_TELEGRAM_BOT_TOKEN và OPS_ALERT_TELEGRAM_CHAT_ID phải đặt cùng nhau')
  }

  const url = env.OPS_ALERT_WEBHOOK_URL?.trim()
  let webhook: OpsAlertConfig['webhook']
  if (url) {
    let protocol = ''
    try {
      protocol = new URL(url).protocol
    } catch {
      warnings.push('OPS_ALERT_WEBHOOK_URL không phải URL hợp lệ')
    }
    if (protocol === 'https:') {
      webhook = { url, hmacSecret: env.OPS_ALERT_WEBHOOK_SECRET?.trim() || undefined }
    } else if (protocol) {
      warnings.push('OPS_ALERT_WEBHOOK_URL phải dùng https')
    }
  }

  if (!telegram && !webhook) return { config: null, warnings }
  const throttle = Number(env.OPS_ALERT_THROTTLE_SECONDS)
  return {
    config: {
      source: env.OPS_ALERT_SOURCE?.trim() || 'kiotviet-lite',
      throttleSeconds: Number.isFinite(throttle) && throttle >= 0 ? throttle : 900,
      telegram,
      webhook,
    },
    warnings,
  }
}

export function formatOpsAlertText(source: string, alert: OpsAlert, occurredAt: Date): string {
  const body =
    alert.body.length > MAX_BODY_LENGTH ? alert.body.slice(0, MAX_BODY_LENGTH) + '...' : alert.body
  return `${SEVERITY_BADGE[alert.severity]} ${source}: ${alert.title}\n${body}\n\n${occurredAt.toISOString()}`
}

async function post(
  fetchFn: typeof fetch,
  url: string,
  init: { headers: Record<string, string>; body: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetchFn(url, {
      method: 'POST',
      headers: init.headers,
      body: init.body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    await response.body?.cancel()
    return response.ok ? { ok: true } : { ok: false, error: `HTTP ${response.status}` }
  } catch (err) {
    // Không đưa URL vào lỗi: URL Telegram chứa bot token.
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      return { ok: false, error: 'TIMEOUT' }
    }
    return { ok: false, error: 'NETWORK_ERROR' }
  }
}

export function createOpsAlerter(
  config: OpsAlertConfig | null,
  deps: { fetch?: typeof fetch; now?: () => number } = {},
): OpsAlerter {
  const fetchFn = deps.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const now = deps.now ?? Date.now
  const lastSent = new Map<string, number>()

  return {
    enabled: config !== null,
    async send(alert) {
      if (!config) return { status: 'disabled', deliveries: [] }
      const at = now()
      const previous = lastSent.get(alert.key)
      if (!alert.force && previous !== undefined && at - previous < config.throttleSeconds * 1000) {
        return { status: 'throttled', deliveries: [] }
      }
      lastSent.set(alert.key, at)

      const occurredAt = new Date(at)
      const text = formatOpsAlertText(config.source, alert, occurredAt)
      const jobs: Promise<OpsAlertDelivery>[] = []
      if (config.telegram) {
        const { botToken, chatId } = config.telegram
        jobs.push(
          post(fetchFn, `https://api.telegram.org/bot${botToken}/sendMessage`, {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
          }).then((result) => ({ destination: 'telegram', ...result })),
        )
      }
      if (config.webhook) {
        // `text` để dùng thẳng được với Slack, Mattermost, Google Chat; các trường còn lại cho
        // hệ thống tự xử lý. Có secret thì ký HMAC như webhook của kênh cửa hàng.
        const body = JSON.stringify({
          source: config.source,
          key: alert.key,
          severity: alert.severity,
          title: alert.title,
          body: alert.body,
          text,
          occurredAt: occurredAt.toISOString(),
        })
        jobs.push(
          post(fetchFn, config.webhook.url, {
            headers: webhookHeaders(body, config.webhook.hmacSecret),
            body,
          }).then((result) => ({ destination: 'webhook', ...result })),
        )
      }
      const deliveries = await Promise.all(jobs)
      const ok = deliveries.some((delivery) => delivery.ok)
      // Gửi hỏng hết thì cho phép thử lại ở lần sau thay vì im lặng cả khoảng throttle.
      if (!ok) lastSent.delete(alert.key)
      return { status: ok ? 'sent' : 'failed', deliveries }
    },
  }
}

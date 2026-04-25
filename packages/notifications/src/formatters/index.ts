import type { NotificationEvent } from '@kiotviet-lite/shared'

const SEVERITY_BADGE: Record<string, string> = {
  info: '[INFO]',
  warn: '[WARN]',
  error: '[ERROR]',
  critical: '[CRITICAL]',
}

export function formatEvent(event: NotificationEvent): string {
  const badge = SEVERITY_BADGE[event.severity] ?? `[${event.severity.toUpperCase()}]`
  return `${badge} ${event.title}\n${event.body}`
}

const MAX_BODY_LENGTH = 2000

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function formatTelegramMessage(event: NotificationEvent): string {
  const badge = SEVERITY_BADGE[event.severity] ?? `[${event.severity.toUpperCase()}]`
  const rawBody =
    event.body.length > MAX_BODY_LENGTH ? event.body.slice(0, MAX_BODY_LENGTH) + '...' : event.body
  const time = new Date(event.occurredAt).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  return `<b>${badge} ${escapeHtml(event.title)}</b>\n${escapeHtml(rawBody)}\n\n<i>${time}</i>`
}

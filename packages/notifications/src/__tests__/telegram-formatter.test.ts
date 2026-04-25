import { uuidv7 } from 'uuidv7'
import { describe, expect, it } from 'vitest'

import type { NotificationEvent } from '@kiotviet-lite/shared'

import { formatTelegramMessage } from '../formatters/index.js'

function makeEvent(overrides: Partial<NotificationEvent> = {}): NotificationEvent {
  return {
    id: uuidv7(),
    storeId: uuidv7(),
    type: 'stock.negative',
    severity: 'error',
    title: 'Tồn kho âm',
    body: 'Sản phẩm ABC giảm xuống -5',
    occurredAt: '2026-04-25T03:30:00.000Z',
    ...overrides,
  }
}

describe('formatTelegramMessage', () => {
  it('output chứa <b> tag với severity badge', () => {
    const msg = formatTelegramMessage(makeEvent())
    expect(msg).toContain('<b>[ERROR]')
    expect(msg).toContain('</b>')
  })

  it('output chứa title, body, time', () => {
    const msg = formatTelegramMessage(makeEvent())
    expect(msg).toContain('Tồn kho âm')
    expect(msg).toContain('Sản phẩm ABC giảm xuống -5')
    expect(msg).toContain('<i>')
  })

  it('severity badge đúng cho mỗi level', () => {
    expect(formatTelegramMessage(makeEvent({ severity: 'info' }))).toContain('[INFO]')
    expect(formatTelegramMessage(makeEvent({ severity: 'warn' }))).toContain('[WARN]')
    expect(formatTelegramMessage(makeEvent({ severity: 'error' }))).toContain('[ERROR]')
    expect(formatTelegramMessage(makeEvent({ severity: 'critical' }))).toContain('[CRITICAL]')
  })

  it('escape HTML trong title và body', () => {
    const msg = formatTelegramMessage(
      makeEvent({
        title: 'Alert <script>xss</script>',
        body: 'Value & "data"',
      }),
    )
    expect(msg).toContain('&lt;script&gt;')
    expect(msg).toContain('&amp;')
    expect(msg).not.toContain('<script>')
  })

  it('truncate body > 2000 chars', () => {
    const longBody = 'x'.repeat(2500)
    const msg = formatTelegramMessage(makeEvent({ body: longBody }))
    expect(msg).toContain('...')
    expect(msg.length).toBeLessThan(2500 + 200)
  })
})

import { uuidv7 } from 'uuidv7'
import { describe, expect, it, vi } from 'vitest'

import type { NotificationEvent } from '@kiotviet-lite/shared'

import { ConsoleTransport } from '../transports/console.js'

function makeEvent(overrides: Partial<NotificationEvent> = {}): NotificationEvent {
  return {
    id: uuidv7(),
    storeId: uuidv7(),
    type: 'stock.negative',
    severity: 'error',
    title: 'Tồn kho âm',
    body: 'Chi tiết sự kiện',
    occurredAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('ConsoleTransport', () => {
  it('writes event identifiers without business content to stdout', async () => {
    const transport = new ConsoleTransport()
    const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    const event = makeEvent({ title: 'Tên khách hàng bí mật', body: 'PIN 123456' })

    await transport.send(event, {})

    const output = writeSpy.mock.calls[0]?.[0] as string
    const diagnostic = JSON.parse(output)
    expect(diagnostic).toMatchObject({
      eventId: event.id,
      storeId: event.storeId,
      eventType: event.type,
      severity: event.severity,
    })
    expect(output).not.toContain('Tên khách hàng bí mật')
    expect(output).not.toContain('123456')
    writeSpy.mockRestore()
  })

  it('always returns ok: true', async () => {
    const transport = new ConsoleTransport()
    vi.spyOn(process.stdout, 'write').mockReturnValue(true)

    const result = await transport.send(makeEvent(), {})
    expect(result).toEqual({ ok: true, attempts: 1 })

    vi.restoreAllMocks()
  })
})

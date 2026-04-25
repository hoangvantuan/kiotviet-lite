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
  it('writes formatted output to stdout', async () => {
    const transport = new ConsoleTransport()
    const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true)

    await transport.send(makeEvent(), {})

    expect(writeSpy).toHaveBeenCalled()
    const output = writeSpy.mock.calls[0]?.[0] as string
    expect(output).toContain('[ERROR]')
    expect(output).toContain('Tồn kho âm')

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

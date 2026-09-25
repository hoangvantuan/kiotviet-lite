import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { uuidv7 } from 'uuidv7'
import { expect, it } from 'vitest'

import type { NotificationEvent } from '@kiotviet-lite/shared'

import { FileTransport } from '../transports/file.js'

it('records notification IDs without customer content in a file channel', async () => {
  const dir = await mkdtemp('/tmp/kiotviet-notification-')
  const path = join(dir, 'events.log')
  const event: NotificationEvent = {
    id: uuidv7(),
    storeId: uuidv7(),
    type: 'stock.negative',
    severity: 'error',
    title: 'Tên khách hàng bí mật',
    body: 'PIN 123456',
    context: { customerPhone: '0901234567' },
    occurredAt: new Date().toISOString(),
  }
  try {
    expect(await new FileTransport().send(event, { path })).toEqual({ ok: true, attempts: 1 })
    const line = await readFile(path, 'utf8')
    expect(JSON.parse(line)).toMatchObject({ eventId: event.id, storeId: event.storeId })
    expect(line).not.toContain('Tên khách hàng bí mật')
    expect(line).not.toContain('123456')
    expect(line).not.toContain('0901234567')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

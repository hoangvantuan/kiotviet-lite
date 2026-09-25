import type { NotificationEvent } from '@kiotviet-lite/shared'

import type { SendResult, Transport } from './base.js'

export class ConsoleTransport implements Transport {
  readonly name = 'console'

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async send(event: NotificationEvent, config: Record<string, unknown>): Promise<SendResult> {
    const diagnostic = {
      eventId: event.id,
      storeId: event.storeId,
      eventType: event.type,
      severity: event.severity,
      correlationId: event.correlationId,
      occurredAt: event.occurredAt,
    }
    try {
      process.stdout.write(JSON.stringify(diagnostic) + '\n')
    } catch {
      return { ok: false, error: 'STDOUT_WRITE_FAILED', attempts: 1, retriable: false }
    }
    return { ok: true, attempts: 1 }
  }
}

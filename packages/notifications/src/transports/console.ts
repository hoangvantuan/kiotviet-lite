import type { NotificationEvent } from '@kiotviet-lite/shared'

import { formatEvent } from '../formatters/index.js'
import type { SendResult, Transport } from './base.js'

export class ConsoleTransport implements Transport {
  readonly name = 'console'

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async send(event: NotificationEvent, config: Record<string, unknown>): Promise<SendResult> {
    const text = formatEvent(event)
    try {
      process.stdout.write(text + '\n')
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'stdout write failed', attempts: 1, retriable: false }
    }
    return { ok: true, attempts: 1 }
  }
}

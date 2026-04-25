import type { NotificationEvent } from '@kiotviet-lite/shared'

import { formatEvent } from '../formatters/index.js'
import type { SendResult, Transport } from './base.js'

export class ConsoleTransport implements Transport {
  readonly name = 'console'

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async send(event: NotificationEvent, config: Record<string, unknown>): Promise<SendResult> {
    const text = formatEvent(event)
    process.stdout.write(text + '\n')
    return { ok: true, attempts: 1 }
  }
}

import type { Transport } from './base.js'
import { ConsoleTransport } from './console.js'
import { FileTransport } from './file.js'
import { TelegramTransport } from './telegram.js'
import { WebhookTransport } from './webhook.js'

const transports: Record<string, Transport> = {
  console: new ConsoleTransport(),
  file: new FileTransport(),
  webhook: new WebhookTransport(),
  telegram: new TelegramTransport(),
}

export function getTransport(name: string): Transport | undefined {
  return transports[name]
}

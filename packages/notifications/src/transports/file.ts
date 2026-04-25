import { appendFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { NotificationEvent } from '@kiotviet-lite/shared'

import type { SendResult, Transport } from './base.js'

const ALLOWED_BASE_DIRS = ['/tmp', '/var/log']

function isPathAllowed(filePath: string): boolean {
  const resolved = resolve(filePath)
  return ALLOWED_BASE_DIRS.some((base) => resolved.startsWith(base + '/') || resolved === base)
}

export class FileTransport implements Transport {
  readonly name = 'file'

  async send(event: NotificationEvent, config: Record<string, unknown>): Promise<SendResult> {
    const filePath = config.path as string | undefined
    if (!filePath) {
      return { ok: false, error: 'Missing file path in config', attempts: 1, retriable: false }
    }

    if (!isPathAllowed(filePath)) {
      return {
        ok: false,
        error: 'File path outside allowed directory',
        attempts: 1,
        retriable: false,
      }
    }

    try {
      const line = JSON.stringify(event) + '\n'
      await appendFile(resolve(filePath), line, 'utf8')
      return { ok: true, attempts: 1 }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, error: message, attempts: 1, retriable: true }
    }
  }
}

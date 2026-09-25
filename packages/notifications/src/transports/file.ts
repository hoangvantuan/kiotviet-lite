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
      const diagnostic = {
        eventId: event.id,
        storeId: event.storeId,
        eventType: event.type,
        severity: event.severity,
        correlationId: event.correlationId,
        occurredAt: event.occurredAt,
      }
      await appendFile(resolve(filePath), JSON.stringify(diagnostic) + '\n', 'utf8')
      return { ok: true, attempts: 1 }
    } catch {
      return { ok: false, error: 'FILE_WRITE_FAILED', attempts: 1, retriable: true }
    }
  }
}

import {
  notificationDeliveries,
  type NotificationEvent,
  notificationEventSchema,
} from '@kiotviet-lite/shared'

import { decrypt } from './crypto.js'
import { withRetry } from './retry.js'
import { findMatchingRules } from './router.js'
import { isThrottled } from './throttle.js'
import type { SendResult, Transport } from './transports/base.js'
import { ConsoleTransport } from './transports/console.js'
import { FileTransport } from './transports/file.js'
import { TelegramTransport } from './transports/telegram.js'
import { WebhookTransport } from './transports/webhook.js'
import type { NotificationDb } from './types.js'

const transports: Record<string, Transport> = {
  console: new ConsoleTransport(),
  file: new FileTransport(),
  webhook: new WebhookTransport(),
  telegram: new TelegramTransport(),
}

export interface NotifyOptions {
  configKey?: string
}

export async function notify(
  db: NotificationDb,
  event: NotificationEvent,
  options: NotifyOptions = {},
): Promise<SendResult[]> {
  const validated = notificationEventSchema.parse(event)

  const matchedRules = await findMatchingRules(
    db,
    validated.storeId,
    validated.type,
    validated.severity,
  )

  const results: SendResult[] = []

  for (const rule of matchedRules) {
    const throttled = await isThrottled(
      db,
      validated.storeId,
      validated.type,
      rule.channelId,
      rule.throttleSeconds,
    )

    if (throttled) {
      try {
        await db.insert(notificationDeliveries).values({
          eventId: validated.id,
          channelId: rule.channelId,
          storeId: validated.storeId,
          eventType: validated.type,
          status: 'throttled',
          attempts: 0,
          retriable: null,
        })
      } catch {
        /* delivery log failure is non-fatal */
      }
      results.push({ ok: true, attempts: 0 })
      continue
    }

    const transport = transports[rule.transport]
    if (!transport) {
      try {
        await db.insert(notificationDeliveries).values({
          eventId: validated.id,
          channelId: rule.channelId,
          storeId: validated.storeId,
          eventType: validated.type,
          status: 'dead',
          attempts: 0,
          retriable: false,
          error: `Unknown transport: ${rule.transport}`,
        })
      } catch {
        /* delivery log failure is non-fatal */
      }
      results.push({
        ok: false,
        error: `Unknown transport: ${rule.transport}`,
        attempts: 0,
        retriable: false,
      })
      continue
    }

    let config: Record<string, unknown> = {}
    if (rule.configEncrypted) {
      if (!options.configKey) {
        try {
          await db.insert(notificationDeliveries).values({
            eventId: validated.id,
            channelId: rule.channelId,
            storeId: validated.storeId,
            eventType: validated.type,
            status: 'dead',
            attempts: 0,
            retriable: false,
            error: 'Config key required but not provided',
          })
        } catch {
          /* delivery log failure is non-fatal */
        }
        results.push({
          ok: false,
          error: 'Config key required but not provided',
          attempts: 0,
          retriable: false,
        })
        continue
      }
      try {
        config = decrypt(rule.configEncrypted, options.configKey)
      } catch {
        try {
          await db.insert(notificationDeliveries).values({
            eventId: validated.id,
            channelId: rule.channelId,
            storeId: validated.storeId,
            eventType: validated.type,
            status: 'dead',
            attempts: 1,
            retriable: false,
            error: 'Failed to decrypt channel config',
          })
        } catch {
          /* delivery log failure is non-fatal */
        }
        results.push({
          ok: false,
          error: 'Failed to decrypt channel config',
          attempts: 1,
          retriable: false,
        })
        continue
      }
    }

    const result = await withRetry(() => transport.send(validated, config))

    try {
      await db.insert(notificationDeliveries).values({
        eventId: validated.id,
        channelId: rule.channelId,
        storeId: validated.storeId,
        eventType: validated.type,
        status: result.ok ? 'sent' : 'dead',
        attempts: result.attempts,
        retriable: result.ok ? null : result.retriable,
        error: result.ok ? null : result.error,
      })
    } catch {
      /* delivery log failure is non-fatal */
    }

    results.push(result)
  }

  return results
}

export type { NotificationDb, SendResult, Transport }
export { notificationEventSchema }
export type { NotificationEvent } from '@kiotviet-lite/shared'

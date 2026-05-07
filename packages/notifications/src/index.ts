import { ZodError } from 'zod'

import {
  notificationDeliveries,
  type NotificationEvent,
  notificationEventSchema,
} from '@kiotviet-lite/shared'

import { decrypt } from './crypto.js'
import { withRetry } from './retry.js'
import { findMatchingRules, type MatchedRule } from './router.js'
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
  let validated: NotificationEvent
  try {
    validated = notificationEventSchema.parse(event)
  } catch (err) {
    const message =
      err instanceof ZodError
        ? `Invalid notification event: ${err.issues.map((i) => i.path.join('.')).join(', ')}`
        : 'Invalid notification event'
    return [{ ok: false, error: message, attempts: 0, retriable: false }]
  }

  const matchedRules = await findMatchingRules(
    db,
    validated.storeId,
    validated.type,
    validated.severity,
  )

  async function deliverRule(rule: MatchedRule): Promise<SendResult> {
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
      } catch (err) {
        console.error('[notifications] delivery log insert failed', err)
      }
      return { ok: true, attempts: 0 }
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
      } catch (err) {
        console.error('[notifications] delivery log insert failed', err)
      }
      return {
        ok: false,
        error: `Unknown transport: ${rule.transport}`,
        attempts: 0,
        retriable: false,
      }
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
        } catch (err) {
          console.error('[notifications] delivery log insert failed', err)
        }
        return {
          ok: false,
          error: 'Config key required but not provided',
          attempts: 0,
          retriable: false,
        }
      }
      try {
        config = decrypt(rule.configEncrypted, options.configKey)
      } catch (err) {
        console.error('[notifications] config decrypt failed', { channelId: rule.channelId, err })
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
        } catch (err2) {
          console.error('[notifications] delivery log insert failed', err2)
        }
        return {
          ok: false,
          error: 'Failed to decrypt channel config',
          attempts: 1,
          retriable: false,
        }
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
    } catch (err) {
      console.error('[notifications] delivery log insert failed', err)
    }

    return result
  }

  const settled = await Promise.allSettled(matchedRules.map(deliverRule))

  return settled.map((outcome) =>
    outcome.status === 'fulfilled'
      ? outcome.value
      : { ok: false, error: outcome.reason instanceof Error ? outcome.reason.message : 'Delivery failed', attempts: 0, retriable: true },
  )
}

export type { NotificationDb, SendResult, Transport }
export { notificationEventSchema }
export { purgeOldDeliveries } from './purge.js'
export { verifyWebhookSignature } from './transports/webhook.js'
export type { NotificationEvent } from '@kiotviet-lite/shared'

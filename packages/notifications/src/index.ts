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
import { getTransport } from './transports/registry.js'
import type { NotificationDb } from './types.js'

export { type ChannelSendResult, sendToChannel } from './channel-send.js'
export { decrypt, encrypt } from './crypto.js'
export { checkWebhookTarget, checkWebhookUrl, type WebhookUrlRejectReason } from './url-guard.js'

export interface NotifyOptions {
  configKey?: string
}

export type DeliveryResult = SendResult & {
  channelId: string
  status: 'sent' | 'dead' | 'throttled' | 'unrecorded'
  errorCode?: string
}

export async function notify(
  db: NotificationDb,
  event: NotificationEvent,
  options: NotifyOptions = {},
): Promise<DeliveryResult[]> {
  let validated: NotificationEvent
  try {
    validated = notificationEventSchema.parse(event)
  } catch (err) {
    throw new Error('Invalid notification event', { cause: err })
  }

  const matchedRules = await findMatchingRules(
    db,
    validated.storeId,
    validated.type,
    validated.severity,
  )

  async function deliverRule(rule: MatchedRule): Promise<DeliveryResult> {
    async function record(
      result: SendResult,
      status: 'sent' | 'dead' | 'throttled',
      errorCode?: string,
    ): Promise<DeliveryResult> {
      try {
        await db.insert(notificationDeliveries).values({
          eventId: validated.id,
          channelId: rule.channelId,
          storeId: validated.storeId,
          eventType: validated.type,
          status,
          attempts: result.attempts,
          retriable: result.ok ? null : result.retriable,
          error: errorCode ?? null,
        })
        return { ...result, channelId: rule.channelId, status, errorCode }
      } catch {
        // A delivery may already have been sent; never retry it just because recording failed.
        return {
          ok: false,
          error: 'Delivery log failed',
          attempts: result.attempts,
          retriable: false,
          channelId: rule.channelId,
          status: 'unrecorded',
          errorCode: 'DELIVERY_LOG_FAILED',
        }
      }
    }
    const throttled = await isThrottled(
      db,
      validated.storeId,
      validated.type,
      rule.channelId,
      rule.throttleSeconds,
    )

    if (throttled) {
      return record({ ok: true, attempts: 0 }, 'throttled')
    }

    const transport = getTransport(rule.transport)
    if (!transport) {
      return record(
        { ok: false, error: 'Unknown transport', attempts: 0, retriable: false },
        'dead',
        'UNKNOWN_TRANSPORT',
      )
    }

    let config: Record<string, unknown> = {}
    if (rule.configEncrypted) {
      if (!options.configKey) {
        return record(
          { ok: false, error: 'Config key required', attempts: 0, retriable: false },
          'dead',
          'CONFIG_KEY_MISSING',
        )
      }
      try {
        config = decrypt(rule.configEncrypted, options.configKey)
      } catch {
        return record(
          { ok: false, error: 'Failed to decrypt channel config', attempts: 1, retriable: false },
          'dead',
          'CONFIG_DECRYPT_FAILED',
        )
      }
    }

    let attempts = 0
    try {
      const result = await withRetry(() => {
        attempts++
        return transport.send(validated, config)
      })
      if (result.ok) return record(result, 'sent')
      return record(
        {
          ok: false,
          error: 'Transport failed',
          attempts: result.attempts,
          retriable: result.retriable,
        },
        'dead',
        'TRANSPORT_FAILED',
      )
    } catch {
      return record(
        { ok: false, error: 'Transport failed', attempts, retriable: false },
        'dead',
        'TRANSPORT_THROWN',
      )
    }
  }

  const settled = await Promise.allSettled(matchedRules.map(deliverRule))

  return settled.map(
    (outcome, index): DeliveryResult =>
      outcome.status === 'fulfilled'
        ? outcome.value
        : {
            ok: false,
            error: 'Delivery failed',
            attempts: 0,
            retriable: true,
            channelId: matchedRules[index]!.channelId,
            status: 'unrecorded',
            errorCode: 'DELIVERY_FAILED',
          },
  )
}

export type { NotificationDb, SendResult, Transport }
export { notificationEventSchema }
export {
  createOpsAlerter,
  formatOpsAlertText,
  type OpsAlert,
  type OpsAlertConfig,
  opsAlertConfigFromEnv,
  type OpsAlerter,
  type OpsAlertResult,
  type OpsAlertSeverity,
} from './ops-alert.js'
export { purgeOldDeliveries } from './purge.js'
export { verifyWebhookSignature } from './transports/webhook.js'
export type { NotificationEvent } from '@kiotviet-lite/shared'

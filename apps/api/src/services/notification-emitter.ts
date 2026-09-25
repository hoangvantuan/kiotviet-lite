import { type NotificationEvent, notify } from '@kiotviet-lite/notifications'
import { uuidv7 } from 'uuidv7'

import type { Db } from '../db/index.js'
import { env } from '../lib/env.js'
import { logger } from '../lib/logger.js'

type EmitEventInput = Omit<NotificationEvent, 'id' | 'occurredAt'> & {
  id?: string
  occurredAt?: string
  correlationId?: string
}

/**
 * Fire-and-forget notification emitter.
 * Auto-fills id (uuidv7) and occurredAt. Never blocks business logic.
 */
const MAX_BODY_LENGTH = 2000
const MAX_TITLE_LENGTH = 200

export function emitEvent(db: Db, event: EmitEventInput): void {
  const fullEvent: NotificationEvent = {
    id: event.id ?? uuidv7(),
    occurredAt: event.occurredAt ?? new Date().toISOString(),
    ...event,
    title:
      event.title.length > MAX_TITLE_LENGTH
        ? event.title.slice(0, MAX_TITLE_LENGTH - 1) + '…'
        : event.title,
    body:
      event.body.length > MAX_BODY_LENGTH
        ? event.body.slice(0, MAX_BODY_LENGTH - 1) + '…'
        : event.body,
  }

  void notify(db, fullEvent, { configKey: env.notificationConfigKey || undefined })
    .then((results) => {
      if (results.length === 0) {
        logger.warn(
          { eventId: fullEvent.id, storeId: fullEvent.storeId, eventType: fullEvent.type },
          'Notification had no matching rules',
        )
      }
      for (const result of results) {
        const fields = {
          eventId: fullEvent.id,
          storeId: fullEvent.storeId,
          eventType: fullEvent.type,
          channelId: result.channelId,
          status: result.status,
          attempts: result.attempts,
          ...(result.errorCode ? { errorCode: result.errorCode } : {}),
        }
        if (result.ok) logger.info(fields, 'Notification delivery outcome')
        else logger.error(fields, 'Notification delivery outcome')
      }
    })
    .catch(() => {
      logger.error(
        {
          eventId: fullEvent.id,
          storeId: fullEvent.storeId,
          eventType: fullEvent.type,
          status: 'failed',
          errorCode: 'ROUTING_FAILED',
        },
        'Notification emit failed',
      )
    })
}

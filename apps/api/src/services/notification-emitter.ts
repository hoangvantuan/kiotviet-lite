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
export function emitEvent(db: Db, event: EmitEventInput): void {
  const fullEvent: NotificationEvent = {
    id: event.id ?? uuidv7(),
    occurredAt: event.occurredAt ?? new Date().toISOString(),
    ...event,
  }

  void notify(db, fullEvent, { configKey: env.notificationConfigKey || undefined }).catch((err) => {
    logger.error({ err, eventType: fullEvent.type, storeId: fullEvent.storeId }, 'notify failed')
  })
}

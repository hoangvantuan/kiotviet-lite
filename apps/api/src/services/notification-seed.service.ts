import {
  notificationChannels,
  notificationRules,
  notificationTypeValues,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { logger } from '../lib/logger.js'

/**
 * Seed default notification rules for a new store.
 * Creates 1 console channel + 7 rules (one per event type, all enabled).
 */
export async function seedDefaultRules(db: Db, storeId: string): Promise<void> {
  try {
    const [channel] = await db
      .insert(notificationChannels)
      .values({
        storeId,
        transport: 'console',
        name: 'Console mặc định',
        enabled: true,
      })
      .returning({ id: notificationChannels.id })

    if (!channel) {
      logger.warn({ storeId }, 'notification seed: failed to create default channel')
      return
    }

    const ruleValues = notificationTypeValues.map((eventType) => ({
      storeId,
      eventType,
      minSeverity: 'info' as const,
      channelId: channel.id,
      enabled: true,
      throttleSeconds: 0,
    }))

    await db.insert(notificationRules).values(ruleValues)

    logger.info({ storeId, channelId: channel.id }, 'notification seed: default rules created')
  } catch (err) {
    logger.error({ err, storeId }, 'notification seed failed')
  }
}

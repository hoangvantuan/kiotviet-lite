import { and, eq, gte } from 'drizzle-orm'

import { notificationDeliveries, type NotificationType } from '@kiotviet-lite/shared'

import type { NotificationDb } from './types.js'

export async function isThrottled(
  db: NotificationDb,
  storeId: string,
  eventType: NotificationType,
  channelId: string,
  throttleSeconds: number,
): Promise<boolean> {
  if (throttleSeconds <= 0) return false

  const since = new Date(Date.now() - throttleSeconds * 1000)

  const rows = await db
    .select({ id: notificationDeliveries.id })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.storeId, storeId),
        eq(notificationDeliveries.eventType, eventType),
        eq(notificationDeliveries.channelId, channelId),
        eq(notificationDeliveries.status, 'sent'),
        gte(notificationDeliveries.createdAt, since),
      ),
    )
    .limit(1)

  return rows.length > 0
}

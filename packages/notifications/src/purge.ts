import { lt, sql } from 'drizzle-orm'

import { notificationDeliveries } from '@kiotviet-lite/shared'

import type { NotificationDb } from './types.js'

export async function purgeOldDeliveries(db: NotificationDb, retentionDays = 90): Promise<number> {
  const cutoff = sql`NOW() - INTERVAL '1 day' * ${retentionDays}`
  const deleted = await db
    .delete(notificationDeliveries)
    .where(lt(notificationDeliveries.createdAt, cutoff))
    .returning({ id: notificationDeliveries.id })
  const count = deleted.length
  if (count > 0) {
    console.log(`[notifications] purged ${count} deliveries older than ${retentionDays} days`)
  }
  return count
}

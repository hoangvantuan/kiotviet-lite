import { and, eq } from 'drizzle-orm'

import {
  notificationChannels,
  notificationRules,
  type NotificationSeverity,
  type NotificationType,
} from '@kiotviet-lite/shared'

import type { NotificationDb } from './types.js'

const SEVERITY_ORDER: Record<string, number> = {
  info: 0,
  warn: 1,
  error: 2,
  critical: 3,
}

export function isSeverityGte(eventSeverity: string, minSeverity: string): boolean {
  return (SEVERITY_ORDER[eventSeverity] ?? 0) >= (SEVERITY_ORDER[minSeverity] ?? 0)
}

export interface MatchedRule {
  ruleId: string
  channelId: string
  channelName: string
  transport: string
  configEncrypted: string | null
  throttleSeconds: number
}

export async function findMatchingRules(
  db: NotificationDb,
  storeId: string,
  eventType: NotificationType,
  severity: NotificationSeverity,
): Promise<MatchedRule[]> {
  const rows = await db
    .select({
      ruleId: notificationRules.id,
      channelId: notificationChannels.id,
      channelName: notificationChannels.name,
      transport: notificationChannels.transport,
      configEncrypted: notificationChannels.configEncrypted,
      minSeverity: notificationRules.minSeverity,
      throttleSeconds: notificationRules.throttleSeconds,
    })
    .from(notificationRules)
    .innerJoin(notificationChannels, eq(notificationRules.channelId, notificationChannels.id))
    .where(
      and(
        eq(notificationRules.storeId, storeId),
        eq(notificationRules.eventType, eventType),
        eq(notificationRules.enabled, true),
        eq(notificationChannels.enabled, true),
      ),
    )

  return rows
    .filter((row) => isSeverityGte(severity, row.minSeverity))
    .map((row) => ({
      ruleId: row.ruleId,
      channelId: row.channelId,
      channelName: row.channelName,
      transport: row.transport,
      configEncrypted: row.configEncrypted,
      throttleSeconds: row.throttleSeconds,
    }))
}

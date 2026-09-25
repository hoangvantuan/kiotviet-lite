import {
  checkWebhookTarget,
  decrypt,
  encrypt,
  sendToChannel,
  type WebhookUrlRejectReason,
} from '@kiotviet-lite/notifications'
import { and, asc, count, desc, eq, gte, inArray } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import type { z } from 'zod'

import {
  type createNotificationChannelSchema,
  type NotificationChannelConfigView,
  type NotificationChannelItem,
  notificationChannels,
  type NotificationChannelTestResult,
  notificationChannelTransportInputValues,
  notificationDeliveries,
  notificationRules,
  type NotificationSeverity,
  type NotificationSubscribableType,
  type updateNotificationChannelSchema,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { env } from '../lib/env.js'
import { ApiError } from '../lib/errors.js'

type CreateInput = z.infer<typeof createNotificationChannelSchema>
type UpdateInput = z.infer<typeof updateNotificationChannelSchema>
type ChannelRow = typeof notificationChannels.$inferSelect
type ChannelConfig = Record<string, unknown>

/** Chỉ kênh gửi ra ngoài do chủ cửa hàng tự cấu hình; console/file là kênh nội bộ của hệ thống. */
const MANAGED_TRANSPORTS = notificationChannelTransportInputValues
const CONFIG_FIELDS: Record<(typeof MANAGED_TRANSPORTS)[number], readonly string[]> = {
  telegram: ['botToken', 'chatId'],
  webhook: ['url', 'hmacSecret'],
}
const FAILED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

const WEBHOOK_REJECT_MESSAGES: Record<WebhookUrlRejectReason, string> = {
  INVALID_URL: 'URL webhook không hợp lệ',
  NOT_HTTPS: 'Webhook phải dùng https://',
  HAS_CREDENTIALS: 'URL webhook không được chứa tên đăng nhập hoặc mật khẩu',
  PORT_NOT_ALLOWED: 'URL webhook chỉ được dùng cổng https mặc định (443)',
  PRIVATE_HOST:
    'URL webhook trỏ tới địa chỉ nội bộ, loopback hoặc metadata máy chủ, không được phép',
  DNS_FAILED: 'Không phân giải được tên miền của webhook, kiểm tra lại URL',
}

function requireConfigKey(): string {
  const key = env.notificationConfigKey
  if (!key) {
    throw new ApiError(
      'BUSINESS_RULE_VIOLATION',
      'Máy chủ chưa đặt NOTIFICATION_CONFIG_KEY nên chưa lưu được kênh thông báo, liên hệ người quản trị máy chủ',
      { code: 'CONFIG_KEY_MISSING' },
    )
  }
  return key
}

async function assertSafeWebhookUrl(url: string): Promise<void> {
  const check = await checkWebhookTarget(url)
  if (!check.ok) {
    throw new ApiError('VALIDATION_ERROR', WEBHOOK_REJECT_MESSAGES[check.reason], {
      code: 'WEBHOOK_URL_REJECTED',
      reason: check.reason,
      field: 'config.url',
    })
  }
}

function maskConfig(transport: string, config: ChannelConfig): NotificationChannelConfigView {
  if (transport === 'telegram') {
    const token = typeof config.botToken === 'string' ? config.botToken : ''
    return {
      chatId: typeof config.chatId === 'string' ? config.chatId : undefined,
      botTokenMasked: token ? `••••${token.slice(-4)}` : undefined,
    }
  }
  if (transport === 'webhook') {
    let urlMasked: string | undefined
    try {
      // Đường dẫn và query của webhook thường chứa token, chỉ để lộ origin
      urlMasked = `${new URL(String(config.url)).origin}/••••`
    } catch {
      urlMasked = undefined
    }
    return { urlMasked, hasHmacSecret: typeof config.hmacSecret === 'string' }
  }
  return {}
}

function readConfig(row: ChannelRow): ChannelConfig | null {
  if (!row.configEncrypted) return {}
  const key = env.notificationConfigKey
  if (!key) return null
  try {
    return decrypt(row.configEncrypted, key)
  } catch {
    return null
  }
}

async function findManagedChannel(db: Db, storeId: string, id: string): Promise<ChannelRow> {
  const [row] = await db
    .select()
    .from(notificationChannels)
    .where(
      and(
        eq(notificationChannels.id, id),
        eq(notificationChannels.storeId, storeId),
        inArray(notificationChannels.transport, [...MANAGED_TRANSPORTS]),
      ),
    )
  if (!row) throw new ApiError('NOT_FOUND', 'Không tìm thấy kênh thông báo')
  return row
}

async function toItems(db: Db, rows: ChannelRow[]): Promise<NotificationChannelItem[]> {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const rules = await db
    .select({
      channelId: notificationRules.channelId,
      eventType: notificationRules.eventType,
      minSeverity: notificationRules.minSeverity,
    })
    .from(notificationRules)
    .where(inArray(notificationRules.channelId, ids))
    .orderBy(asc(notificationRules.createdAt))
  const latest = await db
    .selectDistinctOn([notificationDeliveries.channelId], {
      channelId: notificationDeliveries.channelId,
      status: notificationDeliveries.status,
      error: notificationDeliveries.error,
      createdAt: notificationDeliveries.createdAt,
    })
    .from(notificationDeliveries)
    .where(inArray(notificationDeliveries.channelId, ids))
    .orderBy(notificationDeliveries.channelId, desc(notificationDeliveries.createdAt))
  const failed = await db
    .select({ channelId: notificationDeliveries.channelId, n: count() })
    .from(notificationDeliveries)
    .where(
      and(
        inArray(notificationDeliveries.channelId, ids),
        eq(notificationDeliveries.status, 'dead'),
        gte(notificationDeliveries.createdAt, new Date(Date.now() - FAILED_WINDOW_MS)),
      ),
    )
    .groupBy(notificationDeliveries.channelId)

  return rows.map((row) => {
    const channelRules = rules.filter((r) => r.channelId === row.id)
    const last = latest.find((d) => d.channelId === row.id)
    const config = readConfig(row)
    return {
      id: row.id,
      name: row.name,
      transport: row.transport,
      enabled: row.enabled,
      eventTypes: channelRules
        .map((r) => r.eventType)
        .filter((t): t is NotificationSubscribableType => t !== 'notification.test'),
      minSeverity: channelRules[0]?.minSeverity ?? 'info',
      config: config ? maskConfig(row.transport, config) : null,
      lastDelivery: last
        ? { status: last.status, error: last.error, createdAt: last.createdAt.toISOString() }
        : null,
      failedLast7Days: failed.find((f) => f.channelId === row.id)?.n ?? 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  })
}

async function toItem(db: Db, row: ChannelRow): Promise<NotificationChannelItem> {
  const [item] = await toItems(db, [row])
  return item!
}

function ruleValues(
  storeId: string,
  channelId: string,
  eventTypes: readonly NotificationSubscribableType[],
  minSeverity: NotificationSeverity,
) {
  return eventTypes.map((eventType) => ({
    storeId,
    channelId,
    eventType,
    minSeverity,
    enabled: true,
    throttleSeconds: 0,
  }))
}

export async function listNotificationChannels(
  db: Db,
  storeId: string,
): Promise<NotificationChannelItem[]> {
  const rows = await db
    .select()
    .from(notificationChannels)
    .where(
      and(
        eq(notificationChannels.storeId, storeId),
        inArray(notificationChannels.transport, [...MANAGED_TRANSPORTS]),
      ),
    )
    .orderBy(asc(notificationChannels.createdAt))
  return toItems(db, rows)
}

export async function createNotificationChannel(
  db: Db,
  storeId: string,
  input: CreateInput,
): Promise<NotificationChannelItem> {
  if (input.transport === 'webhook') await assertSafeWebhookUrl(input.config.url)
  const key = requireConfigKey()
  const config: ChannelConfig = { ...input.config }
  if (config.hmacSecret === undefined) delete config.hmacSecret

  const row = await db.transaction(async (tx) => {
    const [channel] = await tx
      .insert(notificationChannels)
      .values({
        storeId,
        transport: input.transport,
        name: input.name,
        enabled: input.enabled ?? true,
        configEncrypted: encrypt(JSON.stringify(config), key),
      })
      .returning()
    await tx
      .insert(notificationRules)
      .values(ruleValues(storeId, channel!.id, input.eventTypes, input.minSeverity))
    return channel!
  })
  return toItem(db, row)
}

export async function updateNotificationChannel(
  db: Db,
  storeId: string,
  id: string,
  input: UpdateInput,
): Promise<NotificationChannelItem> {
  const row = await findManagedChannel(db, storeId, id)
  const transport = row.transport as (typeof MANAGED_TRANSPORTS)[number]

  let configEncrypted: string | undefined
  const patch = Object.entries(input.config ?? {}).filter(([, v]) => v !== undefined)
  if (patch.length > 0) {
    const foreign = patch.find(([field]) => !CONFIG_FIELDS[transport].includes(field))
    if (foreign) {
      throw new ApiError('VALIDATION_ERROR', `Kênh ${transport} không có trường ${foreign[0]}`, [
        { path: `config.${foreign[0]}`, message: 'Trường không thuộc loại kênh này' },
      ])
    }
    const key = requireConfigKey()
    const current = readConfig(row)
    if (current === null) {
      throw new ApiError(
        'BUSINESS_RULE_VIOLATION',
        'Không đọc được cấu hình cũ của kênh (khoá mã hoá đã đổi), hãy xoá kênh và tạo lại',
        { code: 'CONFIG_DECRYPT_FAILED' },
      )
    }
    const next: ChannelConfig = { ...current }
    for (const [field, value] of patch) {
      if (value === null) delete next[field]
      else next[field] = value
    }
    if (transport === 'webhook') await assertSafeWebhookUrl(String(next.url ?? ''))
    configEncrypted = encrypt(JSON.stringify(next), key)
  }

  const updated = await db.transaction(async (tx) => {
    const [channel] = await tx
      .update(notificationChannels)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(configEncrypted !== undefined ? { configEncrypted } : {}),
        updatedAt: new Date(),
      })
      .where(eq(notificationChannels.id, row.id))
      .returning()

    if (input.eventTypes !== undefined) {
      const [first] = await tx
        .select({ minSeverity: notificationRules.minSeverity })
        .from(notificationRules)
        .where(eq(notificationRules.channelId, row.id))
        .limit(1)
      const minSeverity = input.minSeverity ?? first?.minSeverity ?? 'info'
      await tx.delete(notificationRules).where(eq(notificationRules.channelId, row.id))
      await tx
        .insert(notificationRules)
        .values(ruleValues(storeId, row.id, input.eventTypes, minSeverity))
    } else if (input.minSeverity !== undefined) {
      await tx
        .update(notificationRules)
        .set({ minSeverity: input.minSeverity })
        .where(eq(notificationRules.channelId, row.id))
    }
    return channel!
  })
  return toItem(db, updated)
}

export async function deleteNotificationChannel(
  db: Db,
  storeId: string,
  id: string,
): Promise<void> {
  const row = await findManagedChannel(db, storeId, id)
  // Quy tắc và lịch sử gửi của kênh xoá theo khoá ngoại ON DELETE CASCADE
  await db.delete(notificationChannels).where(eq(notificationChannels.id, row.id))
}

const TEST_FAILURE_MESSAGES = {
  UNKNOWN_TRANSPORT: 'Loại kênh không được hỗ trợ',
  CONFIG_KEY_MISSING: 'Máy chủ chưa đặt NOTIFICATION_CONFIG_KEY nên không đọc được cấu hình kênh',
  CONFIG_DECRYPT_FAILED:
    'Không đọc được cấu hình kênh (khoá mã hoá đã đổi), hãy nhập lại bí mật của kênh',
} as const

/** Gửi một tin thử tới kênh, trả kết quả ngay cho người dùng. Không ghi lượt gửi. */
export async function testNotificationChannel(
  db: Db,
  storeId: string,
  id: string,
): Promise<NotificationChannelTestResult> {
  const row = await findManagedChannel(db, storeId, id)
  const result = await sendToChannel({
    transport: row.transport,
    configEncrypted: row.configEncrypted,
    configKey: env.notificationConfigKey || undefined,
    event: {
      id: uuidv7(),
      storeId,
      type: 'notification.test',
      severity: 'info',
      title: 'Tin gửi thử từ KiotViet Lite',
      body: `Kênh "${row.name}" đã cấu hình đúng, cửa hàng sẽ nhận cảnh báo qua kênh này.`,
      occurredAt: new Date().toISOString(),
    },
  })
  if (result.ok) {
    return { ok: true, message: 'Đã gửi tin thử, hãy kiểm tra nơi nhận' }
  }
  if (result.errorCode === 'SEND_FAILED') {
    return { ok: false, message: `Gửi thử thất bại: ${result.error}` }
  }
  return { ok: false, message: TEST_FAILURE_MESSAGES[result.errorCode] }
}

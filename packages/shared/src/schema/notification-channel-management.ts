import { z } from 'zod'

import { notificationSeverityValues, notificationSubscribableTypeValues } from './notifications.js'

/**
 * Quản trị kênh thông báo của cửa hàng (GL-15). Bí mật (bot token, HMAC secret, URL webhook)
 * chỉ đi một chiều từ client lên máy chủ; phản hồi chỉ có dạng đã che.
 */
export const notificationChannelTransportInputValues = ['telegram', 'webhook'] as const

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Vui lòng nhập tên kênh')
  .max(100, 'Tên kênh tối đa 100 ký tự')

const eventTypesSchema = z
  .array(z.enum(notificationSubscribableTypeValues))
  .min(1, 'Chọn ít nhất 1 loại sự kiện')
  .max(notificationSubscribableTypeValues.length)
  .transform((types) => [...new Set(types)])

export const telegramBotTokenSchema = z
  .string()
  .trim()
  .regex(/^\d{5,20}:[A-Za-z0-9_-]{30,64}$/, 'Bot token không hợp lệ (dạng 123456789:AA...)')

export const telegramChatIdSchema = z
  .string()
  .trim()
  .regex(
    /^(-?\d{1,20}|@[A-Za-z][A-Za-z0-9_]{4,31})$/,
    'Chat ID là số (vd -1001234567890) hoặc @tenkenh',
  )

export const webhookUrlSchema = z
  .string()
  .trim()
  .max(2000, 'URL tối đa 2000 ký tự')
  .url('URL không hợp lệ')
  .refine((v) => v.toLowerCase().startsWith('https://'), 'Webhook phải dùng https://')

export const webhookHmacSecretSchema = z
  .string()
  .min(16, 'Khoá ký HMAC tối thiểu 16 ký tự')
  .max(256, 'Khoá ký HMAC tối đa 256 ký tự')

const commonFields = {
  name: nameSchema,
  enabled: z.boolean().optional(),
  eventTypes: eventTypesSchema,
  minSeverity: z.enum(notificationSeverityValues).default('info'),
}

export const createNotificationChannelSchema = z.discriminatedUnion('transport', [
  z
    .object({
      transport: z.literal('telegram'),
      ...commonFields,
      config: z.object({ botToken: telegramBotTokenSchema, chatId: telegramChatIdSchema }).strict(),
    })
    .strict(),
  z
    .object({
      transport: z.literal('webhook'),
      ...commonFields,
      config: z
        .object({ url: webhookUrlSchema, hmacSecret: webhookHmacSecretSchema.optional() })
        .strict(),
    })
    .strict(),
])

/**
 * Sửa kênh: trường bí mật bỏ trống nghĩa là giữ nguyên giá trị đang lưu (client không đọc được
 * giá trị cũ). `hmacSecret: null` là gỡ khoá ký.
 */
export const updateNotificationChannelSchema = z
  .object({
    name: nameSchema.optional(),
    enabled: z.boolean().optional(),
    eventTypes: eventTypesSchema.optional(),
    minSeverity: z.enum(notificationSeverityValues).optional(),
    config: z
      .object({
        botToken: telegramBotTokenSchema.optional(),
        chatId: telegramChatIdSchema.optional(),
        url: webhookUrlSchema.optional(),
        hmacSecret: webhookHmacSecretSchema.nullable().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

export const notificationChannelConfigViewSchema = z.object({
  chatId: z.string().optional(),
  botTokenMasked: z.string().optional(),
  urlMasked: z.string().optional(),
  hasHmacSecret: z.boolean().optional(),
})

export const notificationChannelItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  transport: z.enum(['console', 'file', 'webhook', 'telegram']),
  enabled: z.boolean(),
  eventTypes: z.array(z.enum(notificationSubscribableTypeValues)),
  minSeverity: z.enum(notificationSeverityValues),
  config: notificationChannelConfigViewSchema.nullable(),
  lastDelivery: z
    .object({
      status: z.enum(['pending', 'sent', 'throttled', 'dead']),
      error: z.string().nullable(),
      createdAt: z.string(),
    })
    .nullable(),
  failedLast7Days: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const notificationChannelTestResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
})

export type CreateNotificationChannelInput = z.input<typeof createNotificationChannelSchema>
export type UpdateNotificationChannelInput = z.input<typeof updateNotificationChannelSchema>
export type NotificationChannelConfigView = z.infer<typeof notificationChannelConfigViewSchema>
export type NotificationChannelItem = z.infer<typeof notificationChannelItemSchema>
export type NotificationChannelTestResult = z.infer<typeof notificationChannelTestResultSchema>

import type { ZodError } from 'zod'

import {
  type CreateNotificationChannelInput,
  createNotificationChannelSchema,
  type NotificationChannelItem,
  type NotificationSeverity,
  type NotificationSubscribableType,
  type UpdateNotificationChannelInput,
  updateNotificationChannelSchema,
} from '@kiotviet-lite/shared'

export const NOTIFICATION_EVENT_LABELS: Record<NotificationSubscribableType, string> = {
  'auth.login.suspicious': 'Đăng nhập đáng ngờ',
  'auth.pin.locked': 'Khoá PIN do nhập sai nhiều lần',
  'order.high_value': 'Đơn hàng giá trị lớn',
  'order.debt_limit_exceeded': 'Đơn vượt hạn mức công nợ',
  'order.price_mismatch_adjusted': 'Đơn ngoại tuyến bị chỉnh giá khi đồng bộ',
  'stock.negative': 'Tồn kho âm',
  'sync.failed_repeatedly': 'Đồng bộ thất bại nhiều lần',
  'audit.price_override': 'Sửa giá bán tại quầy',
  'system.error.unhandled': 'Lỗi hệ thống',
}

export const NOTIFICATION_SEVERITY_LABELS: Record<NotificationSeverity, string> = {
  info: 'Mọi mức (thông tin trở lên)',
  warn: 'Cảnh báo trở lên',
  error: 'Lỗi trở lên',
  critical: 'Chỉ nghiêm trọng',
}

export const NOTIFICATION_TRANSPORT_LABELS: Record<string, string> = {
  telegram: 'Telegram',
  webhook: 'Webhook',
}

export interface ChannelFormValues {
  transport: 'telegram' | 'webhook'
  name: string
  enabled: boolean
  eventTypes: NotificationSubscribableType[]
  minSeverity: NotificationSeverity
  botToken: string
  chatId: string
  url: string
  hmacSecret: string
  removeHmacSecret: boolean
}

export type ChannelFormField = 'name' | 'eventTypes' | 'botToken' | 'chatId' | 'url' | 'hmacSecret'

export type BuildResult<T> =
  | { ok: true; payload: T }
  | { ok: false; errors: Partial<Record<ChannelFormField, string>> }

export function emptyChannelForm(): ChannelFormValues {
  return {
    transport: 'telegram',
    name: '',
    enabled: true,
    eventTypes: [],
    minSeverity: 'info',
    botToken: '',
    chatId: '',
    url: '',
    hmacSecret: '',
    removeHmacSecret: false,
  }
}

/** Form sửa kênh: bí mật luôn để trống vì máy chủ không bao giờ trả giá trị thật. */
export function formFromChannel(item: NotificationChannelItem): ChannelFormValues {
  return {
    ...emptyChannelForm(),
    transport: item.transport === 'webhook' ? 'webhook' : 'telegram',
    name: item.name,
    enabled: item.enabled,
    eventTypes: [...item.eventTypes],
    minSeverity: item.minSeverity,
    chatId: item.config?.chatId ?? '',
  }
}

function toFieldErrors(error: ZodError): Partial<Record<ChannelFormField, string>> {
  const errors: Partial<Record<ChannelFormField, string>> = {}
  for (const issue of error.issues) {
    const path = issue.path.filter((p) => p !== 'config')
    const field = (path[0] ?? 'name') as ChannelFormField
    errors[field] ??= issue.message
  }
  return errors
}

export function buildCreatePayload(
  values: ChannelFormValues,
): BuildResult<CreateNotificationChannelInput> {
  const common = {
    name: values.name,
    enabled: values.enabled,
    eventTypes: values.eventTypes,
    minSeverity: values.minSeverity,
  }
  const raw =
    values.transport === 'telegram'
      ? {
          transport: 'telegram' as const,
          ...common,
          config: { botToken: values.botToken, chatId: values.chatId },
        }
      : {
          transport: 'webhook' as const,
          ...common,
          config: {
            url: values.url,
            ...(values.hmacSecret ? { hmacSecret: values.hmacSecret } : {}),
          },
        }
  const parsed = createNotificationChannelSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, errors: toFieldErrors(parsed.error) }
  return { ok: true, payload: parsed.data }
}

/** Chỉ gửi trường bí mật người dùng vừa nhập; bỏ trống là giữ nguyên giá trị đang lưu. */
export function buildUpdatePayload(
  values: ChannelFormValues,
  original: NotificationChannelItem,
): BuildResult<UpdateNotificationChannelInput> {
  const config: NonNullable<UpdateNotificationChannelInput['config']> = {}
  if (values.transport === 'telegram') {
    if (values.botToken.trim()) config.botToken = values.botToken
    if (values.chatId.trim() && values.chatId.trim() !== (original.config?.chatId ?? '')) {
      config.chatId = values.chatId
    }
  } else {
    if (values.url.trim()) config.url = values.url
    if (values.removeHmacSecret) config.hmacSecret = null
    else if (values.hmacSecret) config.hmacSecret = values.hmacSecret
  }
  const raw: UpdateNotificationChannelInput = {
    name: values.name,
    enabled: values.enabled,
    eventTypes: values.eventTypes,
    minSeverity: values.minSeverity,
    ...(Object.keys(config).length > 0 ? { config } : {}),
  }
  const parsed = updateNotificationChannelSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, errors: toFieldErrors(parsed.error) }
  return { ok: true, payload: raw }
}

export function describeChannelTarget(item: NotificationChannelItem): string {
  if (!item.config) return 'Không đọc được cấu hình (kiểm tra NOTIFICATION_CONFIG_KEY)'
  if (item.transport === 'telegram') {
    return `Chat ${item.config.chatId ?? '?'} · bot ${item.config.botTokenMasked ?? '?'}`
  }
  const signing = item.config.hasHmacSecret ? 'có khoá ký' : 'không ký'
  return `${item.config.urlMasked ?? '?'} · ${signing}`
}

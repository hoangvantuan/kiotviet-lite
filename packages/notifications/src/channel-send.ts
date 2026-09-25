import type { NotificationEvent } from '@kiotviet-lite/shared'

import { decrypt } from './crypto.js'
import type { SendResult } from './transports/base.js'
import { getTransport } from './transports/registry.js'

export type ChannelSendResult =
  | { ok: true }
  | {
      ok: false
      errorCode:
        | 'UNKNOWN_TRANSPORT'
        | 'CONFIG_KEY_MISSING'
        | 'CONFIG_DECRYPT_FAILED'
        | 'SEND_FAILED'
      error: string
    }

function redact(message: string, config: Record<string, unknown>): string {
  let out = message
  for (const value of Object.values(config)) {
    if (typeof value === 'string' && value.length >= 8) out = out.split(value).join('***')
  }
  return out.slice(0, 300)
}

/**
 * Gửi một sự kiện tới đúng một kênh, một lần, không thử lại và không ghi lượt gửi.
 * Dùng cho nút "Gửi thử" (GL-15): người dùng cần kết quả ngay, lỗi đã che bí mật của kênh.
 */
export async function sendToChannel(params: {
  transport: string
  configEncrypted: string | null
  configKey?: string
  event: NotificationEvent
}): Promise<ChannelSendResult> {
  const transport = getTransport(params.transport)
  if (!transport) return { ok: false, errorCode: 'UNKNOWN_TRANSPORT', error: 'Unknown transport' }

  let config: Record<string, unknown> = {}
  if (params.configEncrypted) {
    if (!params.configKey) {
      return { ok: false, errorCode: 'CONFIG_KEY_MISSING', error: 'Config key required' }
    }
    try {
      config = decrypt(params.configEncrypted, params.configKey)
    } catch {
      return { ok: false, errorCode: 'CONFIG_DECRYPT_FAILED', error: 'Failed to decrypt config' }
    }
  }

  let result: SendResult
  try {
    result = await transport.send(params.event, config)
  } catch (err) {
    return { ok: false, errorCode: 'SEND_FAILED', error: redact(String(err), config) }
  }
  if (result.ok) return { ok: true }
  return { ok: false, errorCode: 'SEND_FAILED', error: redact(result.error, config) }
}

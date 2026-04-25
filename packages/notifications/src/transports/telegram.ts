import { Bot, GrammyError, HttpError } from 'grammy'

import type { NotificationEvent } from '@kiotviet-lite/shared'

import { formatTelegramMessage } from '../formatters/index.js'
import type { SendResult, Transport } from './base.js'

export class TelegramTransport implements Transport {
  readonly name = 'telegram'

  async send(event: NotificationEvent, config: Record<string, unknown>): Promise<SendResult> {
    const botToken = config.botToken as string | undefined
    const chatId = config.chatId as string | undefined

    if (!botToken || !chatId) {
      return { ok: false, error: 'Missing botToken or chatId', attempts: 1, retriable: false }
    }

    const TIMEOUT_MS = 10_000

    try {
      const bot = new Bot(botToken)
      const message = formatTelegramMessage(event)
      const sendPromise = bot.api.sendMessage(chatId, message, { parse_mode: 'HTML' })
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Telegram API timeout')), TIMEOUT_MS),
      )
      await Promise.race([sendPromise, timeoutPromise])
      return { ok: true, attempts: 1 }
    } catch (err) {
      if (err instanceof GrammyError) {
        const retriable = err.error_code >= 500 || err.error_code === 429
        return { ok: false, error: err.message, attempts: 1, retriable }
      }
      if (err instanceof HttpError) {
        return { ok: false, error: err.message, attempts: 1, retriable: true }
      }
      if (err instanceof Error && err.message === 'Telegram API timeout') {
        return { ok: false, error: 'Telegram API timeout', attempts: 1, retriable: true }
      }
      return { ok: false, error: String(err), attempts: 1, retriable: false }
    }
  }
}

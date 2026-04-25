import type { NotificationEvent } from '@kiotviet-lite/shared'

export type SendResult =
  | { ok: true; attempts: number }
  | { ok: false; error: string; attempts: number; retriable: boolean }

export interface Transport {
  readonly name: string
  send(event: NotificationEvent, config: Record<string, unknown>): Promise<SendResult>
}

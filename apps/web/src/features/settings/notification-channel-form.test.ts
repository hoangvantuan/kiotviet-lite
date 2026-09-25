import { describe, expect, it } from 'vitest'

import {
  type NotificationChannelItem,
  notificationSubscribableTypeValues,
} from '@kiotviet-lite/shared'

import {
  buildCreatePayload,
  buildUpdatePayload,
  describeChannelTarget,
  emptyChannelForm,
  formFromChannel,
  NOTIFICATION_EVENT_LABELS,
} from './notification-channel-form'

const BOT_TOKEN = '123456789:AAHfiqksKZ8WmR2zSjiQ7_v4TMAKdiHm9T0'

function item(partial: Partial<NotificationChannelItem>): NotificationChannelItem {
  return {
    id: '0190a4c2-0000-7000-8000-000000000001',
    name: 'Kênh',
    transport: 'webhook',
    enabled: true,
    eventTypes: ['stock.negative'],
    minSeverity: 'info',
    config: { urlMasked: 'https://hooks.example.com/••••', hasHmacSecret: true },
    lastDelivery: null,
    failedLast7Days: 0,
    createdAt: '2026-09-25T00:00:00.000Z',
    updatedAt: '2026-09-25T00:00:00.000Z',
    ...partial,
  }
}

describe('GL-15: biểu mẫu kênh thông báo', () => {
  it('mọi loại sự kiện đăng ký được đều có nhãn tiếng Việt', () => {
    for (const type of notificationSubscribableTypeValues) {
      expect(NOTIFICATION_EVENT_LABELS[type]).toMatch(/\S/)
    }
  })

  it('tạo kênh telegram hợp lệ ra đúng payload API', () => {
    const res = buildCreatePayload({
      ...emptyChannelForm(),
      transport: 'telegram',
      name: ' Nhóm chủ ',
      eventTypes: ['stock.negative'],
      botToken: BOT_TOKEN,
      chatId: '-1001234567890',
    })
    expect(res).toEqual({
      ok: true,
      payload: {
        transport: 'telegram',
        name: 'Nhóm chủ',
        enabled: true,
        eventTypes: ['stock.negative'],
        minSeverity: 'info',
        config: { botToken: BOT_TOKEN, chatId: '-1001234567890' },
      },
    })
  })

  it('webhook bỏ trống khoá ký thì không gửi trường hmacSecret; http bị báo lỗi tại trường URL', () => {
    const ok = buildCreatePayload({
      ...emptyChannelForm(),
      transport: 'webhook',
      name: 'Kế toán',
      eventTypes: ['order.high_value'],
      url: 'https://hooks.example.com/x',
    })
    expect(ok.ok && ok.payload.config).toEqual({ url: 'https://hooks.example.com/x' })

    const bad = buildCreatePayload({
      ...emptyChannelForm(),
      transport: 'webhook',
      name: 'Kế toán',
      eventTypes: ['order.high_value'],
      url: 'http://hooks.example.com/x',
    })
    expect(bad).toEqual({ ok: false, errors: { url: 'Webhook phải dùng https://' } })
  })

  it('thiếu sự kiện hoặc thiếu token báo lỗi theo trường', () => {
    const res = buildCreatePayload({ ...emptyChannelForm(), transport: 'telegram', name: 'A' })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(Object.keys(res.errors).sort()).toEqual(['botToken', 'chatId', 'eventTypes'])
    }
  })

  it('sửa kênh: không gửi bí mật bỏ trống (giữ nguyên trên máy chủ), gỡ khoá ký gửi null', () => {
    const original = item({})
    const form = formFromChannel(original)
    expect(form.url).toBe('')
    expect(form.hmacSecret).toBe('')

    expect(buildUpdatePayload({ ...form, name: 'Tên mới' }, original)).toEqual({
      ok: true,
      payload: {
        name: 'Tên mới',
        enabled: true,
        eventTypes: ['stock.negative'],
        minSeverity: 'info',
      },
    })
    const removed = buildUpdatePayload({ ...form, removeHmacSecret: true }, original)
    expect(removed.ok && removed.payload.config).toEqual({ hmacSecret: null })
  })

  it('sửa kênh telegram: chat ID đổi thì gửi, token mới thì gửi, token cũ không bao giờ có trong form', () => {
    const original = item({
      transport: 'telegram',
      config: { chatId: '-100111', botTokenMasked: '••••9T0' },
    })
    const form = formFromChannel(original)
    expect(form.chatId).toBe('-100111')
    expect(form.botToken).toBe('')
    const res = buildUpdatePayload({ ...form, chatId: '-100222', botToken: BOT_TOKEN }, original)
    expect(res.ok && res.payload.config).toEqual({ chatId: '-100222', botToken: BOT_TOKEN })
  })

  it('mô tả đích gửi chỉ dùng dạng đã che', () => {
    expect(describeChannelTarget(item({}))).toBe('https://hooks.example.com/•••• · có khoá ký')
    expect(
      describeChannelTarget(
        item({ transport: 'telegram', config: { chatId: '-100111', botTokenMasked: '••••9T0' } }),
      ),
    ).toBe('Chat -100111 · bot ••••9T0')
    expect(describeChannelTarget(item({ config: null }))).toBe(
      'Không đọc được cấu hình (kiểm tra NOTIFICATION_CONFIG_KEY)',
    )
  })
})

/**
 * GL-15 (cấp cửa hàng): chủ cửa hàng tự cấu hình kênh thông báo thật (Telegram bot, webhook https).
 *
 * Bước tái hiện gốc: trước đây API chỉ có `POST /notifications/emit`, không có cách nào tạo kênh
 * telegram/webhook ngoài việc chèn tay vào database với config đã tự mã hoá. Test đi qua đúng
 * route mà trang cài đặt gọi.
 */
import { decrypt } from '@kiotviet-lite/notifications'
import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  notificationChannels,
  notificationDeliveries,
  notificationRules,
} from '@kiotviet-lite/shared'

import { createNotificationRoutes } from '../routes/notifications.routes.js'
import { emitEvent } from '../services/notification-emitter.js'
import { createStore } from './helpers/factories.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

const KEY = '3f9c1a7e5b2d8046c1e9a3f7b5d2086e4c1a9f3e7b5d20864c1e9a3f7b5d2086'
const BOT_TOKEN = '123456789:AAHfiqksKZ8WmR2zSjiQ7_v4TMAKdiHm9T0'
const HMAC = 'hmac-secret-rat-dai-0123456789'
const HOOK_URL = 'https://93.184.215.14/kvl/hook?token=bi-mat-trong-url'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.BCRYPT_ROUNDS = '4'
})

type Json = Record<string, unknown>

describe('GL-15: quản lý kênh thông báo của cửa hàng', () => {
  let env: TestEnv
  let app: ReturnType<typeof createNotificationRoutes>
  const fetchMock = vi.fn()

  beforeEach(async () => {
    process.env.NOTIFICATION_CONFIG_KEY = KEY
    env = await createTestEnv()
    app = createNotificationRoutes({ db: env.db })
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    delete process.env.NOTIFICATION_CONFIG_KEY
    await env.close()
  })

  function call(method: string, path: string, body?: unknown, auth = env.owner.authHeader) {
    return app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...auth },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  const telegramBody = {
    transport: 'telegram',
    name: 'Nhóm chủ quán',
    eventTypes: ['stock.negative', 'order.high_value'],
    minSeverity: 'warn',
    config: { botToken: BOT_TOKEN, chatId: '-1001234567890' },
  }

  const webhookBody = {
    transport: 'webhook',
    name: 'Hệ thống kế toán',
    eventTypes: ['stock.negative'],
    config: { url: HOOK_URL, hmacSecret: HMAC },
  }

  async function createChannel(body: unknown): Promise<Json> {
    const res = await call('POST', '/channels', body)
    expect(res.status).toBe(201)
    return ((await res.json()) as { data: Json }).data
  }

  it('tạo kênh telegram: lưu config đã mã hoá, phản hồi chỉ có dạng che, tạo quy tắc theo sự kiện', async () => {
    const res = await call('POST', '/channels', telegramBody)
    expect(res.status).toBe(201)
    const text = await res.text()
    expect(text).not.toContain(BOT_TOKEN)
    const data = (JSON.parse(text) as { data: Json }).data
    expect(data).toMatchObject({
      name: 'Nhóm chủ quán',
      transport: 'telegram',
      enabled: true,
      minSeverity: 'warn',
      config: { chatId: '-1001234567890', botTokenMasked: expect.stringMatching(/9T0$/) },
    })
    expect(data.eventTypes).toEqual(['stock.negative', 'order.high_value'])

    const [row] = await env.db
      .select()
      .from(notificationChannels)
      .where(eq(notificationChannels.id, data.id as string))
    expect(row!.configEncrypted).not.toContain(BOT_TOKEN)
    expect(decrypt(row!.configEncrypted!, KEY)).toEqual({
      botToken: BOT_TOKEN,
      chatId: '-1001234567890',
    })
    const rules = await env.db
      .select()
      .from(notificationRules)
      .where(eq(notificationRules.channelId, row!.id))
    expect(rules.map((r) => r.eventType).sort()).toEqual(['order.high_value', 'stock.negative'])
    expect(rules.every((r) => r.minSeverity === 'warn' && r.enabled)).toBe(true)
  })

  it('danh sách kênh không bao giờ chứa bí mật, URL webhook chỉ lộ origin', async () => {
    await createChannel(telegramBody)
    await createChannel(webhookBody)
    const res = await call('GET', '/channels')
    expect(res.status).toBe(200)
    const text = await res.text()
    for (const secret of [BOT_TOKEN, HMAC, 'bi-mat-trong-url', '/kvl/hook']) {
      expect(text).not.toContain(secret)
    }
    const items = (JSON.parse(text) as { data: Json[] }).data
    expect(items).toHaveLength(2)
    const hook = items.find((i) => i.transport === 'webhook')!
    expect(hook.config).toEqual({ urlMasked: 'https://93.184.215.14/••••', hasHmacSecret: true })
  })

  it.each([
    ['http://93.184.215.14/hook', 'https'],
    ['https://127.0.0.1/hook', 'nội bộ'],
    ['https://169.254.169.254/latest/meta-data/', 'nội bộ'],
    ['https://localhost/hook', 'nội bộ'],
    ['https://10.0.0.5/hook', 'nội bộ'],
    ['https://[::1]/hook', 'nội bộ'],
    ['https://93.184.215.14:8443/hook', '443'],
  ])('webhook %s bị từ chối (SSRF), không lưu kênh', async (url, hint) => {
    const res = await call('POST', '/channels', { ...webhookBody, config: { url } })
    expect([400, 422]).toContain(res.status)
    expect(await res.text()).toContain(hint)
    expect(await env.db.select().from(notificationChannels)).toHaveLength(0)
  })

  it('sửa kênh: bỏ trống bí mật thì giữ nguyên, đổi sự kiện thì thay quy tắc, null thì gỡ khoá ký', async () => {
    const created = await createChannel(webhookBody)
    const id = created.id as string

    const res = await call('PATCH', `/channels/${id}`, {
      name: 'Kế toán mới',
      eventTypes: ['order.high_value', 'stock.negative'],
      minSeverity: 'error',
      config: {},
    })
    expect(res.status).toBe(200)
    const [row] = await env.db
      .select()
      .from(notificationChannels)
      .where(eq(notificationChannels.id, id))
    expect(row!.name).toBe('Kế toán mới')
    expect(decrypt(row!.configEncrypted!, KEY)).toEqual({ url: HOOK_URL, hmacSecret: HMAC })
    const rules = await env.db
      .select()
      .from(notificationRules)
      .where(eq(notificationRules.channelId, id))
    expect(rules.map((r) => r.eventType).sort()).toEqual(['order.high_value', 'stock.negative'])
    expect(rules.every((r) => r.minSeverity === 'error')).toBe(true)

    const removeHmac = await call('PATCH', `/channels/${id}`, { config: { hmacSecret: null } })
    expect(removeHmac.status).toBe(200)
    const [after] = await env.db
      .select()
      .from(notificationChannels)
      .where(eq(notificationChannels.id, id))
    expect(decrypt(after!.configEncrypted!, KEY)).toEqual({ url: HOOK_URL })

    const badUrl = await call('PATCH', `/channels/${id}`, {
      config: { url: 'https://192.168.1.1/x' },
    })
    expect([400, 422]).toContain(badUrl.status)
  })

  it('sửa trường chỉ có ở kênh khác loại (url cho telegram) bị từ chối', async () => {
    const created = await createChannel(telegramBody)
    const res = await call('PATCH', `/channels/${created.id as string}`, {
      config: { url: HOOK_URL },
    })
    expect(res.status).toBe(400)
  })

  it('tắt kênh bằng PATCH enabled=false', async () => {
    const created = await createChannel(webhookBody)
    const res = await call('PATCH', `/channels/${created.id as string}`, { enabled: false })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { data: Json }).data.enabled).toBe(false)
  })

  it('xoá kênh xoá luôn quy tắc của kênh', async () => {
    const created = await createChannel(webhookBody)
    const res = await call('DELETE', `/channels/${created.id as string}`)
    expect(res.status).toBe(204)
    expect(await env.db.select().from(notificationChannels)).toHaveLength(0)
    expect(await env.db.select().from(notificationRules)).toHaveLength(0)
  })

  it('gửi thử webhook: gửi đúng một sự kiện notification.test, không ghi lượt gửi', async () => {
    const created = await createChannel(webhookBody)
    const res = await call('POST', `/channels/${created.id as string}/test`)
    expect(res.status).toBe(200)
    expect(((await res.json()) as { data: Json }).data).toMatchObject({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(HOOK_URL)
    const payload = JSON.parse(init.body as string) as { type: string; storeId: string }
    expect(payload.type).toBe('notification.test')
    expect(payload.storeId).toBe(env.storeId)
    expect((init.headers as Record<string, string>)['X-KVL-Signature']).toBeTruthy()
    expect(await env.db.select().from(notificationDeliveries)).toHaveLength(0)
  })

  it('gửi thử thất bại trả thông báo lỗi dễ hiểu, không lộ URL bí mật', async () => {
    fetchMock.mockResolvedValue(new Response('not found', { status: 404 }))
    const created = await createChannel(webhookBody)
    const res = await call('POST', `/channels/${created.id as string}/test`)
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toContain('bi-mat-trong-url')
    const data = (JSON.parse(text) as { data: { ok: boolean; message: string } }).data
    expect(data.ok).toBe(false)
    expect(data.message).toContain('404')
  })

  it('chỉ owner quản lý kênh: manager và staff bị 403', async () => {
    const created = await createChannel(webhookBody)
    for (const user of [env.manager, env.staff]) {
      expect((await call('GET', '/channels', undefined, user.authHeader)).status).toBe(403)
      expect((await call('POST', '/channels', webhookBody, user.authHeader)).status).toBe(403)
      expect(
        (await call('POST', `/channels/${created.id as string}/test`, undefined, user.authHeader))
          .status,
      ).toBe(403)
    }
  })

  it('máy chủ chưa đặt NOTIFICATION_CONFIG_KEY: từ chối lưu kênh có bí mật với mã rõ ràng', async () => {
    delete process.env.NOTIFICATION_CONFIG_KEY
    const res = await call('POST', '/channels', telegramBody)
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error: { details?: { code?: string } } }
    expect(body.error.details?.code).toBe('CONFIG_KEY_MISSING')
  })

  it('kênh của cửa hàng khác trả 404 cho sửa, xoá, gửi thử', async () => {
    const other = await createStore(env)
    const [foreign] = await env.db
      .insert(notificationChannels)
      .values({ storeId: other.id, transport: 'webhook', name: 'Của người khác' })
      .returning()
    for (const [method, path] of [
      ['PATCH', `/channels/${foreign!.id}`],
      ['DELETE', `/channels/${foreign!.id}`],
      ['POST', `/channels/${foreign!.id}/test`],
    ] as const) {
      const res = await call(method, path, method === 'PATCH' ? { enabled: false } : undefined)
      expect(res.status).toBe(404)
    }
    const list = (await (await call('GET', '/channels')).json()) as { data: unknown[] }
    expect(list.data).toHaveLength(0)
  })

  it('sự kiện nghiệp vụ đi tới kênh đang bật; kênh lỗi ghi dead mà không làm hỏng luồng gọi', async () => {
    await createChannel(webhookBody)
    const off = await createChannel({ ...webhookBody, name: 'Tắt', enabled: false })
    expect(off.enabled).toBe(false)

    expect(() =>
      emitEvent(env.db, {
        storeId: env.storeId,
        type: 'stock.negative',
        severity: 'error',
        title: 'Tồn âm',
        body: 'SP A còn -1',
      }),
    ).not.toThrow()
    await vi.waitFor(async () => {
      const rows = await env.db.select().from(notificationDeliveries)
      expect(rows.map((r) => r.status)).toEqual(['sent'])
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fetchMock.mockResolvedValue(new Response('bad', { status: 400 }))
    expect(() =>
      emitEvent(env.db, {
        storeId: env.storeId,
        type: 'stock.negative',
        severity: 'error',
        title: 'Tồn âm lần 2',
        body: 'SP B còn -2',
      }),
    ).not.toThrow()
    await vi.waitFor(async () => {
      const rows = await env.db.select().from(notificationDeliveries)
      expect(rows.map((r) => r.status).sort()).toEqual(['dead', 'sent'])
    })

    const list = (await (await call('GET', '/channels')).json()) as { data: Json[] }
    const active = list.data.find((i) => i.enabled === true)!
    expect(active.lastDelivery).toMatchObject({ status: 'dead' })
    expect(active.failedLast7Days).toBe(1)
  })
})

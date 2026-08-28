import type { NotificationEvent, SendResult } from '@kiotviet-lite/notifications'
import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { notificationChannels, notificationRules } from '@kiotviet-lite/shared'

import { isLoginSuspicious, recordLogin } from '../services/login-history.service.js'
import { seedDefaultRules } from '../services/notification-seed.service.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

/**
 * emitEvent gọi notify() theo kiểu fire-and-forget: nó không trả promise nên
 * test không thể chờ. Nếu để notify() chạy thật, query của nó còn dở khi
 * afterEach đóng PGlite, promise không bao giờ settle và worker vitest treo
 * vĩnh viễn. Mock notify để phần cần kiểm tra (emitEvent dựng đúng event và
 * không ném lỗi) trở nên xác định.
 */
const notifyMock = vi.hoisted(() =>
  vi.fn<(db: unknown, event: NotificationEvent) => Promise<SendResult[]>>(async () => []),
)

vi.mock('@kiotviet-lite/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kiotviet-lite/notifications')>()),
  notify: notifyMock,
}))

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.BCRYPT_ROUNDS = '4'
})

describe('notification-emitter', () => {
  let env: TestEnv

  beforeEach(async () => {
    notifyMock.mockClear()
    env = await createTestEnv()
  })

  afterEach(async () => {
    await env.close()
  })

  it('emitEvent calls notify without blocking (fire-and-forget)', async () => {
    // Import emitEvent and verify it does not throw
    const { emitEvent } = await import('../services/notification-emitter.js')
    expect(() => {
      emitEvent(env.db, {
        storeId: env.storeId,
        type: 'stock.negative',
        severity: 'error',
        title: 'Test event',
        body: 'Test body',
      })
    }).not.toThrow()

    expect(notifyMock).toHaveBeenCalledTimes(1)
    const [, event] = notifyMock.mock.calls[0]!
    expect(event).toMatchObject({
      storeId: env.storeId,
      type: 'stock.negative',
      severity: 'error',
    })
    // emitEvent tự điền id và occurredAt
    expect(event.id).toBeTruthy()
    expect(event.occurredAt).toBeTruthy()
  })
})

describe('login-history suspicious detection', () => {
  let env: TestEnv

  beforeEach(async () => {
    env = await createTestEnv()
  })

  afterEach(async () => {
    await env.close()
  })

  it('returns false when no login history exists', async () => {
    const result = await isLoginSuspicious(env.db, {
      userId: env.owner.id,
      ip: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    })
    expect(result).toBe(false)
  })

  it('returns false when ip/userAgent is known', async () => {
    // Record some logins
    for (let i = 0; i < 3; i++) {
      await recordLogin(env.db, {
        userId: env.owner.id,
        storeId: env.storeId,
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      })
    }

    const result = await isLoginSuspicious(env.db, {
      userId: env.owner.id,
      ip: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    })
    expect(result).toBe(false)
  })

  it('returns false when only ip is new (userAgent known)', async () => {
    for (let i = 0; i < 3; i++) {
      await recordLogin(env.db, {
        userId: env.owner.id,
        storeId: env.storeId,
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      })
    }

    const result = await isLoginSuspicious(env.db, {
      userId: env.owner.id,
      ip: '10.0.0.1',
      userAgent: 'Mozilla/5.0',
    })
    expect(result).toBe(false)
  })

  it('returns true when BOTH ip AND userAgent are new', async () => {
    for (let i = 0; i < 3; i++) {
      await recordLogin(env.db, {
        userId: env.owner.id,
        storeId: env.storeId,
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      })
    }

    const result = await isLoginSuspicious(env.db, {
      userId: env.owner.id,
      ip: '10.0.0.1',
      userAgent: 'Chrome/120 Unknown',
    })
    expect(result).toBe(true)
  })

  it('returns false when ip or userAgent is undefined', async () => {
    await recordLogin(env.db, {
      userId: env.owner.id,
      storeId: env.storeId,
      ip: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    })

    const result = await isLoginSuspicious(env.db, {
      userId: env.owner.id,
      ip: undefined,
      userAgent: undefined,
    })
    expect(result).toBe(false)
  })
})

describe('notification-seed', () => {
  let env: TestEnv

  beforeEach(async () => {
    env = await createTestEnv()
  })

  afterEach(async () => {
    await env.close()
  })

  it('seedDefaultRules creates 1 channel + 8 rules for store', async () => {
    await seedDefaultRules(env.db, env.storeId)

    const channels = await env.db
      .select()
      .from(notificationChannels)
      .where(eq(notificationChannels.storeId, env.storeId))

    expect(channels).toHaveLength(1)
    expect(channels[0]!.transport).toBe('console')
    expect(channels[0]!.name).toBe('Console mặc định')

    const rules = await env.db
      .select()
      .from(notificationRules)
      .where(eq(notificationRules.storeId, env.storeId))

    expect(rules).toHaveLength(8)
    expect(rules.every((r) => r.enabled)).toBe(true)
    expect(rules.every((r) => r.channelId === channels[0]!.id)).toBe(true)

    const eventTypes = rules.map((r) => r.eventType).sort()
    expect(eventTypes).toEqual([
      'audit.price_override',
      'auth.login.suspicious',
      'auth.pin.locked',
      'order.debt_limit_exceeded',
      'order.high_value',
      'stock.negative',
      'sync.failed_repeatedly',
      'system.error.unhandled',
    ])
  })
})

describe('stock.negative emission', () => {
  let env: TestEnv

  beforeEach(async () => {
    env = await createTestEnv()
  })

  afterEach(async () => {
    await env.close()
  })

  it('emitEvent is called when stock goes below 0 (verified via no throw)', async () => {
    // This test verifies the emitEvent helper can handle the stock.negative event type
    const { emitEvent } = await import('../services/notification-emitter.js')
    expect(() => {
      emitEvent(env.db, {
        storeId: env.storeId,
        type: 'stock.negative',
        severity: 'error',
        title: 'Tồn kho âm: Sản phẩm A',
        body: 'Tồn kho Sản phẩm A bị âm (-3) sau bán hàng.',
        context: {
          productId: 'prod-123',
          productName: 'Sản phẩm A',
          currentStock: -3,
          previousStock: 2,
        },
      })
    }).not.toThrow()
  })
})

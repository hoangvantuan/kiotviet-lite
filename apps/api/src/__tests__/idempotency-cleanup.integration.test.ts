import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { idempotencyKeys } from '@kiotviet-lite/shared'

import {
  IDEMPOTENCY_KEY_RETENTION_MS,
  purgeExpiredIdempotencyKeys,
  startIdempotencyKeyCleanup,
} from '../services/idempotency-cleanup.service.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

const DAY_MS = 24 * 60 * 60 * 1000

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv()
})

afterEach(async () => {
  await env.close()
})

async function seedKey(key: string, createdAt: Date) {
  await env.db.insert(idempotencyKeys).values({
    storeId: env.storeId,
    key,
    userId: env.owner.id,
    requestPath: '/api/v1/pos/orders',
    requestHash: 'a'.repeat(64),
    responseStatus: 201,
    responseBody: { data: { id: key } },
    createdAt,
  })
}

async function remainingKeys() {
  const rows = await env.db.select({ key: idempotencyKeys.key }).from(idempotencyKeys)
  return rows.map((r) => r.key).sort()
}

// R4: bảng khóa chống trùng không được phình mãi
describe('dọn idempotency_keys', () => {
  it('xóa khóa cũ hơn 7 ngày, giữ khóa còn trong hạn', async () => {
    const now = new Date('2026-09-26T00:00:00Z')
    await seedKey('old-8-days', new Date(now.getTime() - 8 * DAY_MS))
    await seedKey('edge-7-days', new Date(now.getTime() - IDEMPOTENCY_KEY_RETENTION_MS))
    await seedKey('fresh-1-day', new Date(now.getTime() - DAY_MS))

    const deleted = await purgeExpiredIdempotencyKeys({ db: env.db, now })

    expect(deleted).toBe(1)
    expect(await remainingKeys()).toEqual(['edge-7-days', 'fresh-1-day'])
  })

  it('chạy ngay lúc khởi động, lỗi DB chỉ ghi log không làm sập tiến trình', async () => {
    await seedKey('old', new Date(Date.now() - 10 * DAY_MS))
    await seedKey('fresh', new Date())

    const job = startIdempotencyKeyCleanup({ db: env.db, intervalMs: 3_600_000 })
    await job.firstRun
    job.stop()
    expect(await remainingKeys()).toEqual(['fresh'])

    const broken = new Proxy(env.db, {
      get(target, property, receiver) {
        if (property === 'delete') {
          return () => {
            throw new Error('ECONNREFUSED')
          }
        }
        return Reflect.get(target, property, receiver)
      },
    })
    const failing = startIdempotencyKeyCleanup({ db: broken, intervalMs: 3_600_000 })
    await expect(failing.firstRun).resolves.toBeUndefined()
    failing.stop()
  })
})

import { PGlite } from '@electric-sql/pglite'
import type { NotificationDb } from '@kiotviet-lite/notifications'
import { notify } from '@kiotviet-lite/notifications'
import { drizzle as pgliteDrizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { uuidv7 } from 'uuidv7'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { stores } from '@kiotviet-lite/shared'
import * as schema from '@kiotviet-lite/shared/schema'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(__dirname, '../db/migrations')

let pglite: PGlite
let db: NotificationDb
let storeId: string

beforeAll(async () => {
  pglite = new PGlite()
  const drizzleDb = pgliteDrizzle(pglite, { schema, casing: 'snake_case' })
  await migrate(drizzleDb, { migrationsFolder })
  db = drizzleDb as unknown as NotificationDb

  const [store] = await (db as ReturnType<typeof pgliteDrizzle>)
    .insert(stores)
    .values({ name: 'Test Store M25' })
    .returning()
  storeId = store!.id
})

afterAll(async () => {
  await pglite.close()
})

function validEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: uuidv7(),
    storeId,
    type: 'stock.negative' as const,
    severity: 'error' as const,
    title: 'Tồn kho âm',
    body: 'Sản phẩm X bị âm kho',
    occurredAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('M25 — notify() không nuốt lỗi validate', () => {
  it('payload body quá dài (>2000 ký tự) phải throw error, không im lặng', async () => {
    const longBody = 'x'.repeat(2001)
    const event = validEvent({ body: longBody })

    await expect(notify(db, event)).rejects.toThrow('Invalid notification event')
  })

  it('payload title quá dài (>200 ký tự) phải throw error', async () => {
    const longTitle = 'y'.repeat(201)
    const event = validEvent({ title: longTitle })

    await expect(notify(db, event)).rejects.toThrow('Invalid notification event')
  })

  it('payload thiếu trường bắt buộc phải throw error', async () => {
    const badEvent = {
      id: uuidv7(),
      storeId,
      // thiếu type, severity, title, body
      occurredAt: new Date().toISOString(),
    }

    await expect(notify(db, badEvent as never)).rejects.toThrow('Invalid notification event')
  })

  it('payload type không hợp lệ phải throw error', async () => {
    const event = validEvent({ type: 'unknown.invalid.type' })

    await expect(notify(db, event)).rejects.toThrow('Invalid notification event')
  })

  it('error có cause chứa ZodError gốc', async () => {
    const longBody = 'z'.repeat(2001)
    const event = validEvent({ body: longBody })

    try {
      await notify(db, event)
      expect.fail('Phải throw error')
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
      const error = err as Error
      expect(error.cause).toBeDefined()
    }
  })

  it('payload hợp lệ không throw error', async () => {
    const event = validEvent()
    // Không throw, trả về kết quả bình thường
    const results = await notify(db, event)
    expect(Array.isArray(results)).toBe(true)
  })
})

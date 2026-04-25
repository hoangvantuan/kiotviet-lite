import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle as pgliteDrizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { uuidv7 } from 'uuidv7'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  notificationChannels,
  notificationDeliveries,
  notificationRules,
  stores,
} from '@kiotviet-lite/shared'
import * as schema from '@kiotviet-lite/shared/schema'

import { notify } from '../index.js'
import type { NotificationDb } from '../types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(__dirname, '../../../../apps/api/src/db/migrations')

let pglite: PGlite
let db: NotificationDb
let storeId: string
let channelId: string

beforeAll(async () => {
  pglite = new PGlite()
  const drizzleDb = pgliteDrizzle(pglite, { schema, casing: 'snake_case' })
  await migrate(drizzleDb, { migrationsFolder })
  db = drizzleDb as unknown as NotificationDb

  const [store] = await (db as ReturnType<typeof pgliteDrizzle>)
    .insert(stores)
    .values({ name: 'Test Store' })
    .returning()
  storeId = store!.id

  const [channel] = await (db as ReturnType<typeof pgliteDrizzle>)
    .insert(notificationChannels)
    .values({
      storeId,
      transport: 'console',
      name: 'Console Alert',
    })
    .returning()
  channelId = channel!.id

  await (db as ReturnType<typeof pgliteDrizzle>).insert(notificationRules).values({
    storeId,
    eventType: 'stock.negative',
    minSeverity: 'error',
    channelId,
    throttleSeconds: 0,
  })
})

afterAll(async () => {
  await pglite.close()
})

function makeEvent(overrides: Record<string, unknown> = {}) {
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

describe('notify integration', () => {
  it('delivers matching event and logs sent status', async () => {
    const event = makeEvent()
    const results = await notify(db, event)

    expect(results).toHaveLength(1)
    expect(results[0]!.ok).toBe(true)

    const deliveries = await (db as ReturnType<typeof pgliteDrizzle>)
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.eventId, event.id))

    expect(deliveries).toHaveLength(1)
    expect(deliveries[0]!.status).toBe('sent')
    expect(deliveries[0]!.attempts).toBe(1)
  })

  it('skips event with non-matching severity', async () => {
    const event = makeEvent({ id: uuidv7(), severity: 'info' })
    const results = await notify(db, event)

    expect(results).toHaveLength(0)

    const deliveries = await (db as ReturnType<typeof pgliteDrizzle>)
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.eventId, event.id))

    expect(deliveries).toHaveLength(0)
  })

  it('throttles duplicate event within window', async () => {
    await (db as ReturnType<typeof pgliteDrizzle>).insert(notificationRules).values({
      storeId,
      eventType: 'auth.pin.locked',
      minSeverity: 'info',
      channelId,
      throttleSeconds: 300,
    })

    const event1 = makeEvent({ id: uuidv7(), type: 'auth.pin.locked', severity: 'warn' })
    const results1 = await notify(db, event1)
    expect(results1).toHaveLength(1)
    expect(results1[0]!.ok).toBe(true)

    const event2 = makeEvent({ id: uuidv7(), type: 'auth.pin.locked', severity: 'warn' })
    const results2 = await notify(db, event2)
    expect(results2).toHaveLength(1)

    const delivery2 = await (db as ReturnType<typeof pgliteDrizzle>)
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.eventId, event2.id))

    expect(delivery2).toHaveLength(1)
    expect(delivery2[0]!.status).toBe('throttled')
  })
})

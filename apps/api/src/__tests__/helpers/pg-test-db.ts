import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

import { stores, users } from '@kiotviet-lite/shared'
import * as schema from '@kiotviet-lite/shared/schema'

import type { Db } from '../../db/index.js'
import { hashPassword } from '../../lib/password.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(__dirname, '../../db/migrations')

/** URL Postgres riêng cho test (cần quyền CREATE DATABASE); không có thì test Postgres thật bị bỏ qua. */
export const testPgUrl = process.env.TEST_PG_URL

export interface PgTestDb {
  db: Db
  storeId: string
  ownerId: string
  close: () => Promise<void>
}

/** Tạo một database tạm đã chạy migration, kèm một cửa hàng và chủ cửa hàng. Xoá khi `close`. */
export async function createPgTestDb(prefix: string): Promise<PgTestDb> {
  const dbName = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
  const admin = postgres(testPgUrl!, { max: 1, onnotice: () => {} })
  await admin.unsafe(`CREATE DATABASE ${dbName}`)
  const url = new URL(testPgUrl!)
  url.pathname = `/${dbName}`
  const client = postgres(url.toString(), { max: 10, onnotice: () => {} })
  const db = drizzle(client, { schema, casing: 'snake_case' }) as unknown as Db
  await migrate(db, { migrationsFolder })
  const [store] = await db.insert(stores).values({ name: 'Cửa hàng test' }).returning()
  const [owner] = await db
    .insert(users)
    .values({
      storeId: store!.id,
      name: 'Owner Test',
      phone: '0901111111',
      passwordHash: await hashPassword('matkhau123'),
      pinHash: await hashPassword('111111'),
      role: 'owner',
    })
    .returning()
  return {
    db,
    storeId: store!.id,
    ownerId: owner!.id,
    close: async () => {
      await client.end()
      await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`)
      await admin.end()
    },
  }
}

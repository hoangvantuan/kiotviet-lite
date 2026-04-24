import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach,describe, expect, it } from 'vitest'

import { stores, users } from '@kiotviet-lite/shared/schema'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(__dirname, '../../../../apps/api/src/db/migrations')

describe('PGlite', () => {
  let pglite: PGlite

  afterEach(async () => {
    if (pglite) {
      await pglite.close()
    }
  })

  it('tạo schema, insert và query thành công', async () => {
    pglite = new PGlite()
    const db = drizzle(pglite, { casing: 'snake_case' })

    await migrate(db, { migrationsFolder })

    const storeResults = await db
      .insert(stores)
      .values({ name: 'Cửa hàng test' })
      .returning()

    const store = storeResults[0]!
    expect(store).toBeDefined()
    expect(store.name).toBe('Cửa hàng test')
    expect(store.id).toBeDefined()

    const userResults = await db
      .insert(users)
      .values({
        storeId: store.id,
        name: 'Nguyễn Văn A',
        phone: '0901234567',
        passwordHash: 'hashed_password',
        role: 'owner',
      })
      .returning()

    const user = userResults[0]!
    expect(user).toBeDefined()
    expect(user.name).toBe('Nguyễn Văn A')
    expect(user.role).toBe('owner')
    expect(user.storeId).toBe(store.id)

    const queriedUsers = await db
      .select()
      .from(users)
      .where(eq(users.storeId, store.id))

    expect(queriedUsers).toHaveLength(1)
    expect(queriedUsers[0]!.phone).toBe('0901234567')
  })
})

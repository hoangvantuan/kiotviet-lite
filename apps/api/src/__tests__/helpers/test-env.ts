import { PGlite } from '@electric-sql/pglite'
import { drizzle as pgliteDrizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { refreshTokens, stores, type UserRole, users } from '@kiotviet-lite/shared'
import * as schema from '@kiotviet-lite/shared/schema'

import type { Db } from '../../db/index.js'
import { signAccessToken, signRefreshToken } from '../../lib/jwt.js'
import { hashPassword } from '../../lib/password.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(__dirname, '../../db/migrations')

export interface SeededUser {
  id: string
  storeId: string
  role: UserRole
  phone: string
  pin: string
  accessToken: string
  authHeader: { Authorization: string }
}

export interface TestEnv {
  pglite: PGlite
  db: Db
  storeId: string
  owner: SeededUser
  manager: SeededUser
  staff: SeededUser
  close: () => Promise<void>
  issueRefreshToken: (userId: string) => Promise<{ token: string; tokenHash: string }>
}

export async function createTestEnv(): Promise<TestEnv> {
  const pglite = new PGlite()
  const drizzleDb = pgliteDrizzle(pglite, { schema, casing: 'snake_case' })
  await migrate(drizzleDb, { migrationsFolder })
  const db = drizzleDb as unknown as Db

  const [store] = await db.insert(stores).values({ name: 'Cửa hàng test' }).returning()
  if (!store) throw new Error('seed store failed')

  const ownerPwd = await hashPassword('matkhau123')
  const managerPwd = await hashPassword('matkhau123')
  const staffPwd = await hashPassword('matkhau123')
  const ownerPin = await hashPassword('111111')
  const managerPin = await hashPassword('222222')
  const staffPin = await hashPassword('333333')

  const insertedUsers = await db
    .insert(users)
    .values([
      {
        storeId: store.id,
        name: 'Owner Test',
        phone: '0901111111',
        passwordHash: ownerPwd,
        pinHash: ownerPin,
        role: 'owner',
      },
      {
        storeId: store.id,
        name: 'Manager Test',
        phone: '0902222222',
        passwordHash: managerPwd,
        pinHash: managerPin,
        role: 'manager',
      },
      {
        storeId: store.id,
        name: 'Staff Test',
        phone: '0903333333',
        passwordHash: staffPwd,
        pinHash: staffPin,
        role: 'staff',
      },
    ])
    .returning()

  const ownerRow = insertedUsers.find((u) => u.role === 'owner')
  const managerRow = insertedUsers.find((u) => u.role === 'manager')
  const staffRow = insertedUsers.find((u) => u.role === 'staff')
  if (!ownerRow || !managerRow || !staffRow) throw new Error('seed users failed')

  const buildUser = (row: typeof users.$inferSelect, pin: string): SeededUser => {
    const accessToken = signAccessToken({
      userId: row.id,
      storeId: row.storeId,
      role: row.role,
    })
    return {
      id: row.id,
      storeId: row.storeId,
      role: row.role,
      phone: row.phone ?? '',
      pin,
      accessToken,
      authHeader: { Authorization: `Bearer ${accessToken}` },
    }
  }

  return {
    pglite,
    db,
    storeId: store.id,
    owner: buildUser(ownerRow, '111111'),
    manager: buildUser(managerRow, '222222'),
    staff: buildUser(staffRow, '333333'),
    close: async () => {
      await pglite.close()
    },
    issueRefreshToken: async (userId: string) => {
      const refresh = signRefreshToken(userId)
      await db.insert(refreshTokens).values({
        userId,
        tokenHash: refresh.tokenHash,
        expiresAt: refresh.expiresAt,
      })
      return { token: refresh.token, tokenHash: refresh.tokenHash }
    },
  }
}

import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { stores } from './stores.js'

export const userRoleEnum = pgEnum('user_role', ['owner', 'manager', 'staff'])

export const users = pgTable(
  'users',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    name: varchar({ length: 100 }).notNull(),
    phone: varchar({ length: 20 }),
    passwordHash: text().notNull(),
    role: userRoleEnum().notNull(),
    pinHash: text(),
    failedPinAttempts: integer().notNull().default(0),
    pinLockedUntil: timestamp({ withTimezone: true }),
    isActive: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('users_store_id_phone_unique').on(table.storeId, table.phone),
    uniqueIndex('users_phone_unique').on(table.phone),
  ],
)

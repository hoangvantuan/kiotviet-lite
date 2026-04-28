import { sql } from 'drizzle-orm'
import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { stores } from './stores.js'

export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    name: varchar({ length: 100 }).notNull(),
    phone: varchar({ length: 20 }),
    email: varchar({ length: 255 }),
    address: text(),
    taxId: varchar({ length: 32 }),
    notes: text(),
    currentDebt: bigint({ mode: 'number' }).notNull().default(0),
    purchaseCount: integer().notNull().default(0),
    totalPurchased: bigint({ mode: 'number' }).notNull().default(0),
    deletedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('uniq_suppliers_store_name_alive')
      .on(table.storeId, sql`LOWER(${table.name})`)
      .where(sql`${table.deletedAt} IS NULL`),
    uniqueIndex('uniq_suppliers_store_phone_alive')
      .on(table.storeId, table.phone)
      .where(sql`${table.deletedAt} IS NULL AND ${table.phone} IS NOT NULL`),
    index('idx_suppliers_store_created').on(table.storeId, table.createdAt),
    index('idx_suppliers_store_name_lower').on(table.storeId, sql`LOWER(${table.name})`),
    index('idx_suppliers_store_phone').on(table.storeId, table.phone),
  ],
)

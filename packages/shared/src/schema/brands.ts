import { sql } from 'drizzle-orm'
import { index, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { stores } from './stores.js'

export const brands = pgTable(
  'brands',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    name: varchar({ length: 100 }).notNull(),
    deletedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('uniq_brands_store_name_alive')
      .on(table.storeId, sql`LOWER(${table.name})`)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_brands_store_created').on(table.storeId, table.createdAt),
  ],
)

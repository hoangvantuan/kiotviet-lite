import { sql } from 'drizzle-orm'
import { bigint, index, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { stores } from './stores.js'

export const customerGroups = pgTable(
  'customer_groups',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    name: varchar({ length: 100 }).notNull(),
    description: varchar({ length: 255 }),
    defaultPriceListId: uuid(),
    debtLimit: bigint({ mode: 'number' }),
    deletedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('uniq_customer_groups_store_name_alive')
      .on(table.storeId, sql`LOWER(${table.name})`)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_customer_groups_store_created').on(table.storeId, table.createdAt),
  ],
)

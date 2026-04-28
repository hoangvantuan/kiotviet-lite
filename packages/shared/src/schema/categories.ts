import { sql } from 'drizzle-orm'
import { index, integer, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { stores } from './stores.js'

export const categories = pgTable(
  'categories',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    name: varchar({ length: 100 }).notNull(),
    parentId: uuid(),
    sortOrder: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_categories_store_parent_sort').on(table.storeId, table.parentId, table.sortOrder),
    uniqueIndex('uniq_categories_store_parent_name').on(
      table.storeId,
      table.parentId,
      sql`LOWER(${table.name})`,
    ),
  ],
)

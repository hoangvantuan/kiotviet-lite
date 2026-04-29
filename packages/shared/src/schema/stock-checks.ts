import { desc } from 'drizzle-orm'
import {
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
import { users } from './users.js'

export const stockChecks = pgTable(
  'stock_checks',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    code: varchar({ length: 32 }).notNull(),
    status: varchar({ length: 16 }).notNull().default('draft'),
    note: text(),
    totalItems: integer().notNull().default(0),
    totalDiffPositive: integer().notNull().default(0),
    totalDiffNegative: integer().notNull().default(0),
    createdBy: uuid()
      .notNull()
      .references(() => users.id),
    confirmedBy: uuid().references(() => users.id),
    confirmedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('uniq_stock_checks_store_code').on(table.storeId, table.code),
    index('idx_stock_checks_store_created').on(table.storeId, desc(table.createdAt)),
    index('idx_stock_checks_store_status').on(table.storeId, table.status),
  ],
)

export type StockCheck = typeof stockChecks.$inferSelect
export type NewStockCheck = typeof stockChecks.$inferInsert

import { bigint, index, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { orders } from './orders.js'
import { stores } from './stores.js'
import { users } from './users.js'

export const orderReturns = pgTable(
  'order_returns',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    returnNumber: varchar({ length: 32 }).notNull(),
    totalAmount: bigint({ mode: 'number' }).notNull(),
    refundAmount: bigint({ mode: 'number' }).notNull().default(0),
    debtReductionAmount: bigint({ mode: 'number' }).notNull().default(0),
    note: text(),
    createdBy: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uniq_order_returns_store_number').on(table.storeId, table.returnNumber),
    index('idx_order_returns_order').on(table.orderId),
    index('idx_order_returns_store_date').on(table.storeId, table.createdAt),
  ],
)

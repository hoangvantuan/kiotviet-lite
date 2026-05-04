import { bigint, index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { customers } from './customers.js'
import { stores } from './stores.js'
import { users } from './users.js'

export const receipts = pgTable(
  'receipts',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    customerId: uuid()
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    amount: bigint({ mode: 'number' }).notNull(),
    note: varchar({ length: 500 }),
    createdBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_receipts_store_created').on(table.storeId, table.createdAt.desc()),
    index('idx_receipts_store_customer').on(
      table.storeId,
      table.customerId,
      table.createdAt.desc(),
    ),
  ],
)

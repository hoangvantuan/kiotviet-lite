import { bigint, index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { customers } from './customers.js'
import { stores } from './stores.js'
import { users } from './users.js'

export const debtAdjustments = pgTable(
  'debt_adjustments',
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
    oldAmount: bigint({ mode: 'number' }).notNull(),
    newAmount: bigint({ mode: 'number' }).notNull(),
    reason: varchar({ length: 500 }).notNull(),
    adjustedBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_debt_adjustments_store_created').on(table.storeId, table.createdAt.desc()),
    index('idx_debt_adjustments_store_customer').on(
      table.storeId,
      table.customerId,
      table.createdAt.desc(),
    ),
  ],
)

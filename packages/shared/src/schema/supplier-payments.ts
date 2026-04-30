import { bigint, index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { stores } from './stores.js'
import { suppliers } from './suppliers.js'
import { users } from './users.js'

export const supplierPayments = pgTable(
  'supplier_payments',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    amount: bigint({ mode: 'number' }).notNull(),
    note: varchar({ length: 500 }),
    createdBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_supplier_payments_store_created').on(table.storeId, table.createdAt.desc()),
    index('idx_supplier_payments_store_supplier').on(
      table.storeId,
      table.supplierId,
      table.createdAt.desc(),
    ),
    index('idx_supplier_payments_store_creator').on(table.storeId, table.createdBy),
  ],
)

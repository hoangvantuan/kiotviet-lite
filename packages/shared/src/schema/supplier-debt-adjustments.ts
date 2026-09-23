import { bigint, index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { stores } from './stores.js'
import { suppliers } from './suppliers.js'
import { users } from './users.js'

export const supplierDebtAdjustments = pgTable(
  'supplier_debt_adjustments',
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
    oldAmount: bigint({ mode: 'number' }).notNull(),
    newAmount: bigint({ mode: 'number' }).notNull(),
    reason: varchar({ length: 500 }).notNull(),
    type: varchar({ length: 16 }).$type<'adjustment' | 'opening'>().notNull().default('adjustment'),
    incurredAt: timestamp({ withTimezone: true }),
    adjustedBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_supplier_debt_adjustments_store_created').on(table.storeId, table.createdAt.desc()),
    index('idx_supplier_debt_adjustments_store_supplier').on(
      table.storeId,
      table.supplierId,
      table.createdAt.desc(),
    ),
  ],
)

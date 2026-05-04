import { bigint, index, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { debts } from './debts.js'
import { receipts } from './receipts.js'

export const receiptAllocations = pgTable(
  'receipt_allocations',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    receiptId: uuid()
      .notNull()
      .references(() => receipts.id, { onDelete: 'restrict' }),
    debtId: uuid()
      .notNull()
      .references(() => debts.id, { onDelete: 'restrict' }),
    amount: bigint({ mode: 'number' }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_receipt_allocations_receipt').on(table.receiptId),
    index('idx_receipt_allocations_debt').on(table.debtId),
    uniqueIndex('uniq_receipt_allocations_receipt_debt').on(table.receiptId, table.debtId),
  ],
)

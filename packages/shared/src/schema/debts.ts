import { sql } from 'drizzle-orm'
import { bigint, index, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { customers } from './customers.js'
import { orders } from './orders.js'
import { stores } from './stores.js'

export const debts = pgTable(
  'debts',
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
    customerId: uuid()
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    amount: bigint({ mode: 'number' }).notNull(),
    paid: bigint({ mode: 'number' }).notNull().default(0),
    remaining: bigint({ mode: 'number' }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // FIFO order theo thời gian tạo (Story 5.2 dùng để phân bổ)
    index('idx_debts_store_customer').on(table.storeId, table.customerId, table.createdAt.asc()),
    // Mỗi order chỉ có 1 debt record duy nhất
    uniqueIndex('uniq_debts_store_order').on(table.storeId, table.orderId),
    // Query nợ còn lại nhanh (nợ chưa trả hết)
    index('idx_debts_remaining')
      .on(table.storeId, table.customerId, table.remaining)
      .where(sql`${table.remaining} > 0`),
  ],
)

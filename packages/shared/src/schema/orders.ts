import {
  bigint,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { customers } from './customers.js'
import { stores } from './stores.js'
import { users } from './users.js'

export const orders = pgTable(
  'orders',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    orderNumber: varchar({ length: 32 }).notNull(),
    customerId: uuid().references(() => customers.id, { onDelete: 'set null' }),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    subtotal: bigint({ mode: 'number' }).notNull(),
    discountType: varchar({ length: 16 }),
    discountValue: bigint({ mode: 'number' }).notNull().default(0),
    discountAmount: bigint({ mode: 'number' }).notNull().default(0),
    total: bigint({ mode: 'number' }).notNull(),
    paymentMethod: varchar({ length: 16 }).notNull(),
    paymentStatus: varchar({ length: 16 }).notNull(),
    cashAmount: bigint({ mode: 'number' }),
    transferAmount: bigint({ mode: 'number' }),
    change: bigint({ mode: 'number' }).notNull().default(0),
    note: text(),
    status: varchar({ length: 16 }).notNull().default('completed'),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('uniq_orders_store_number').on(table.storeId, table.orderNumber),
    index('idx_orders_store_date').on(table.storeId, table.createdAt),
    index('idx_orders_store_status').on(table.storeId, table.status),
    index('idx_orders_store_customer').on(table.storeId, table.customerId),
    index('idx_orders_store_payment_status').on(table.storeId, table.paymentStatus),
  ],
)

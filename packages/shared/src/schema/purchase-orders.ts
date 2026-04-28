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

import { stores } from './stores.js'
import { suppliers } from './suppliers.js'
import { users } from './users.js'

export const purchaseOrders = pgTable(
  'purchase_orders',
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
    code: varchar({ length: 32 }).notNull(),
    subtotal: bigint({ mode: 'number' }).notNull(),
    discountTotal: bigint({ mode: 'number' }).notNull().default(0),
    discountTotalType: varchar({ length: 16 }).notNull().default('amount'),
    discountTotalValue: bigint({ mode: 'number' }).notNull().default(0),
    totalAmount: bigint({ mode: 'number' }).notNull(),
    paidAmount: bigint({ mode: 'number' }).notNull().default(0),
    paymentStatus: varchar({ length: 16 }).notNull(),
    note: text(),
    purchaseDate: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('uniq_purchase_orders_store_code').on(table.storeId, table.code),
    index('idx_purchase_orders_store_date').on(table.storeId, table.purchaseDate),
    index('idx_purchase_orders_store_supplier').on(table.storeId, table.supplierId),
    index('idx_purchase_orders_store_payment_status').on(table.storeId, table.paymentStatus),
  ],
)

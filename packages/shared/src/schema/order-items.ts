import { bigint, index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { orders } from './orders.js'
import { productVariants } from './product-variants.js'
import { products } from './products.js'

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    variantId: uuid().references(() => productVariants.id, { onDelete: 'set null' }),
    productName: varchar({ length: 255 }).notNull(),
    variantName: varchar({ length: 255 }),
    unit: varchar({ length: 50 }),
    unitPrice: bigint({ mode: 'number' }).notNull(),
    quantity: bigint({ mode: 'number' }).notNull(),
    discountType: varchar({ length: 16 }),
    discountValue: bigint({ mode: 'number' }).notNull().default(0),
    discountAmount: bigint({ mode: 'number' }).notNull().default(0),
    lineTotal: bigint({ mode: 'number' }).notNull(),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_order_items_order').on(table.orderId),
    index('idx_order_items_product').on(table.productId, table.createdAt),
    index('idx_order_items_variant').on(table.variantId),
  ],
)

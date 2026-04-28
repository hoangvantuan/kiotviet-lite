import { sql } from 'drizzle-orm'
import { bigint, index, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { productVariants } from './product-variants.js'
import { products } from './products.js'
import { purchaseOrders } from './purchase-orders.js'

export const purchaseOrderItems = pgTable(
  'purchase_order_items',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    purchaseOrderId: uuid()
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    variantId: uuid().references(() => productVariants.id, { onDelete: 'restrict' }),
    productNameSnapshot: varchar({ length: 255 }).notNull(),
    productSkuSnapshot: varchar({ length: 64 }).notNull(),
    variantLabelSnapshot: varchar({ length: 255 }),
    quantity: integer().notNull(),
    unitPrice: bigint({ mode: 'number' }).notNull(),
    discountAmount: bigint({ mode: 'number' }).notNull().default(0),
    discountType: varchar({ length: 16 }).notNull().default('amount'),
    discountValue: bigint({ mode: 'number' }).notNull().default(0),
    lineTotal: bigint({ mode: 'number' }).notNull(),
    costAfter: bigint({ mode: 'number' }),
    stockAfter: integer(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_purchase_order_items_po').on(table.purchaseOrderId),
    index('idx_purchase_order_items_product').on(table.productId, table.createdAt),
    index('idx_purchase_order_items_variant')
      .on(table.variantId, table.createdAt)
      .where(sql`${table.variantId} IS NOT NULL`),
  ],
)

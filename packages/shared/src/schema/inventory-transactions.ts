import { index, integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { productVariants } from './product-variants.js'
import { products } from './products.js'
import { stores } from './stores.js'
import { users } from './users.js'

export const inventoryTransactions = pgTable(
  'inventory_transactions',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    storeId: uuid()
      .notNull()
      .references(() => stores.id),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    variantId: uuid().references(() => productVariants.id, { onDelete: 'restrict' }),
    type: varchar({ length: 32 }).notNull(),
    quantity: integer().notNull(),
    note: text(),
    createdBy: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_inventory_tx_product_created').on(table.productId, table.createdAt),
    index('idx_inventory_tx_variant_created').on(table.variantId, table.createdAt),
  ],
)

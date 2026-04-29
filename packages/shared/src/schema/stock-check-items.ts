import { desc } from 'drizzle-orm'
import { index, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { productVariants } from './product-variants.js'
import { products } from './products.js'
import { stockChecks } from './stock-checks.js'

export const stockCheckItems = pgTable(
  'stock_check_items',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    stockCheckId: uuid()
      .notNull()
      .references(() => stockChecks.id, { onDelete: 'cascade' }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    variantId: uuid().references(() => productVariants.id, { onDelete: 'restrict' }),
    productNameSnapshot: varchar({ length: 255 }).notNull(),
    productSkuSnapshot: varchar({ length: 64 }).notNull(),
    variantLabelSnapshot: varchar({ length: 255 }),
    systemQty: integer().notNull(),
    actualQty: integer().notNull(),
    diff: integer().notNull(),
    note: varchar({ length: 255 }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_stock_check_items_check').on(table.stockCheckId),
    index('idx_stock_check_items_product').on(table.productId, desc(table.createdAt)),
  ],
)

export type StockCheckItem = typeof stockCheckItems.$inferSelect
export type NewStockCheckItem = typeof stockCheckItems.$inferInsert

import { desc } from 'drizzle-orm'
import { index, integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { productVariants } from './product-variants.js'
import { products } from './products.js'
import { stockChecks } from './stock-checks.js'
import { stores } from './stores.js'
import { users } from './users.js'

export const stockCheckLogs = pgTable(
  'stock_check_logs',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    stockCheckId: uuid()
      .notNull()
      .references(() => stockChecks.id, { onDelete: 'restrict' }),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    variantId: uuid().references(() => productVariants.id, { onDelete: 'restrict' }),
    systemQty: integer().notNull(),
    actualQty: integer().notNull(),
    diff: integer().notNull(),
    adjustedBy: uuid()
      .notNull()
      .references(() => users.id),
    adjustedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_stock_check_logs_store_adjusted').on(table.storeId, desc(table.adjustedAt)),
    index('idx_stock_check_logs_product_adjusted').on(table.productId, desc(table.adjustedAt)),
    index('idx_stock_check_logs_check').on(table.stockCheckId),
  ],
)

export type StockCheckLog = typeof stockCheckLogs.$inferSelect
export type NewStockCheckLog = typeof stockCheckLogs.$inferInsert

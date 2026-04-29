import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { products } from './products.js'
import { stores } from './stores.js'

export const volumePrices = pgTable(
  'volume_prices',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    minQty: integer().notNull(),
    price: bigint({ mode: 'number' }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('uniq_volume_prices_product_min_qty').on(table.productId, table.minQty),
    index('idx_volume_prices_product').on(table.productId),
    index('idx_volume_prices_store_product').on(table.storeId, table.productId),
    check('check_volume_prices_min_qty_positive', sql`${table.minQty} >= 1`),
  ],
)

import { bigint, boolean, index, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { priceLists } from './price-lists.js'
import { products } from './products.js'

export const priceListItems = pgTable(
  'price_list_items',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    priceListId: uuid()
      .notNull()
      .references(() => priceLists.id, { onDelete: 'cascade' }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    price: bigint({ mode: 'number' }).notNull(),
    isOverridden: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('uniq_price_list_items_list_product').on(table.priceListId, table.productId),
    index('idx_price_list_items_product').on(table.productId),
  ],
)

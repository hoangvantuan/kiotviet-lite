import { bigint, boolean, index, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { priceLists } from './price-lists.js'
import { productVariants } from './product-variants.js'
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
    // POS-08: null là giá cho mọi biến thể của sản phẩm; có giá trị là giá riêng của biến thể đó
    variantId: uuid().references(() => productVariants.id, { onDelete: 'cascade' }),
    price: bigint({ mode: 'number' }).notNull(),
    isOverridden: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique('uniq_price_list_items_list_product_variant')
      .on(table.priceListId, table.productId, table.variantId)
      .nullsNotDistinct(),
    index('idx_price_list_items_product').on(table.productId),
  ],
)

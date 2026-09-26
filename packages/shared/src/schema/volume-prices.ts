import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { productVariants } from './product-variants.js'
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
    // POS-08: null là bậc giá cho mọi biến thể của sản phẩm; có giá trị là bậc riêng của biến thể
    variantId: uuid().references(() => productVariants.id, { onDelete: 'cascade' }),
    minQty: integer().notNull(),
    price: bigint({ mode: 'number' }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique('uniq_volume_prices_product_variant_min_qty')
      .on(table.productId, table.variantId, table.minQty)
      .nullsNotDistinct(),
    index('idx_volume_prices_product').on(table.productId),
    index('idx_volume_prices_store_product').on(table.storeId, table.productId),
    check('check_volume_prices_min_qty_positive', sql`${table.minQty} >= 1`),
  ],
)

import { bigint, index, pgTable, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { customers } from './customers.js'
import { productVariants } from './product-variants.js'
import { products } from './products.js'
import { stores } from './stores.js'

export const customerPrices = pgTable(
  'customer_prices',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    customerId: uuid()
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    // POS-08: null là giá cho mọi biến thể của sản phẩm; có giá trị là giá riêng của biến thể đó
    variantId: uuid().references(() => productVariants.id, { onDelete: 'cascade' }),
    price: bigint({ mode: 'number' }).notNull(),
    note: varchar({ length: 255 }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique('uniq_customer_prices_customer_product_variant')
      .on(table.customerId, table.productId, table.variantId)
      .nullsNotDistinct(),
    index('idx_customer_prices_store_customer').on(table.storeId, table.customerId),
    index('idx_customer_prices_product').on(table.productId),
  ],
)

import { sql } from 'drizzle-orm'
import {
  bigint,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { products } from './products.js'
import { stores } from './stores.js'

export const productUnitConversions = pgTable(
  'product_unit_conversions',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    unit: varchar({ length: 32 }).notNull(),
    conversionFactor: integer().notNull(),
    sellingPrice: bigint({ mode: 'number' }).notNull().default(0),
    sortOrder: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('uniq_unit_conversions_product_unit').on(
      table.productId,
      sql`LOWER(${table.unit})`,
    ),
    index('idx_unit_conversions_product_sort').on(
      table.productId,
      table.sortOrder,
      table.createdAt,
    ),
  ],
)

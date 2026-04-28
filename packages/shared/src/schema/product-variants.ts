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

export const productVariants = pgTable(
  'product_variants',
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
    sku: varchar({ length: 64 }).notNull(),
    barcode: varchar({ length: 64 }),
    attribute1Name: varchar({ length: 50 }).notNull(),
    attribute1Value: varchar({ length: 50 }).notNull(),
    attribute2Name: varchar({ length: 50 }),
    attribute2Value: varchar({ length: 50 }),
    sellingPrice: bigint({ mode: 'number' }).notNull().default(0),
    costPrice: bigint({ mode: 'number' }),
    stockQuantity: integer().notNull().default(0),
    status: varchar({ length: 16 }).notNull().default('active'),
    deletedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('uniq_variants_store_sku_alive')
      .on(table.storeId, sql`LOWER(${table.sku})`)
      .where(sql`${table.deletedAt} IS NULL`),
    uniqueIndex('uniq_variants_store_barcode_alive')
      .on(table.storeId, table.barcode)
      .where(sql`${table.deletedAt} IS NULL AND ${table.barcode} IS NOT NULL`),
    uniqueIndex('uniq_variants_product_attrs_alive')
      .on(
        table.productId,
        sql`LOWER(${table.attribute1Value})`,
        sql`LOWER(coalesce(${table.attribute2Value}, ''))`,
      )
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_variants_product_created').on(table.productId, table.createdAt),
    index('idx_variants_store_status').on(table.storeId, table.status),
  ],
)

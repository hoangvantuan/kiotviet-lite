import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import type { PriceSource } from '../constants/pricing.js'
import { orders } from './orders.js'
import { productVariants } from './product-variants.js'
import { products } from './products.js'

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    variantId: uuid().references(() => productVariants.id, { onDelete: 'set null' }),
    productName: varchar({ length: 255 }).notNull(),
    variantName: varchar({ length: 255 }),
    unit: varchar({ length: 50 }),
    unitPrice: bigint({ mode: 'number' }).notNull(),
    quantity: bigint({ mode: 'number' }).notNull(),
    discountType: varchar({ length: 16 }),
    discountValue: bigint({ mode: 'number' }).notNull().default(0),
    discountAmount: bigint({ mode: 'number' }).notNull().default(0),
    lineTotal: bigint({ mode: 'number' }).notNull(),
    originalPrice: bigint({ mode: 'number' }),
    priceOverride: boolean().notNull().default(false),
    priceOverrideReason: varchar({ length: 255 }),
    priceOverridePinUsed: boolean().notNull().default(false),
    // #32: Server-determined price provenance snapshot, immutable after order creation.
    // Server populates from resolveProductPrice; client-sent labels are ignored.
    priceSource: varchar({ length: 32 }).$type<PriceSource>(),
    priceSourceDetail: varchar({ length: 255 }),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_order_items_order').on(table.orderId),
    index('idx_order_items_product').on(table.productId, table.createdAt),
    index('idx_order_items_variant').on(table.variantId),
    index('idx_order_items_price_override')
      .on(table.orderId, table.priceOverride)
      .where(sql`${table.priceOverride} = true`),
  ],
)

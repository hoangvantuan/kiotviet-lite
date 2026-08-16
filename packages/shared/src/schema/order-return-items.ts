import { bigint, index, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { orderItems } from './order-items.js'
import { orderReturns } from './order-returns.js'
import { productVariants } from './product-variants.js'
import { products } from './products.js'

export const orderReturnItems = pgTable(
  'order_return_items',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    returnId: uuid()
      .notNull()
      .references(() => orderReturns.id, { onDelete: 'cascade' }),
    orderItemId: uuid()
      .notNull()
      .references(() => orderItems.id, { onDelete: 'restrict' }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    variantId: uuid().references(() => productVariants.id, { onDelete: 'set null' }),
    productName: varchar({ length: 255 }).notNull(),
    variantName: varchar({ length: 255 }),
    unit: varchar({ length: 50 }),
    unitPrice: bigint({ mode: 'number' }).notNull(),
    quantity: bigint({ mode: 'number' }).notNull(),
    lineTotal: bigint({ mode: 'number' }).notNull(),
    reason: varchar({ length: 32 }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_return_items_return').on(table.returnId),
    index('idx_return_items_order_item').on(table.orderItemId),
    // CRIT C3: mỗi orderItem chỉ xuất hiện 1 lần trong 1 phiếu trả (phòng vệ sâu
    // tầng DB chống hoàn tiền gấp N lần do dòng trùng).
    uniqueIndex('uniq_return_items_return_order_item').on(table.returnId, table.orderItemId),
  ],
)

import { bigint, index, integer, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { productVariants } from './product-variants.js'
import { products } from './products.js'
import { purchaseOrderItems } from './purchase-order-items.js'
import { purchaseReturns } from './purchase-returns.js'
import { quantity } from './quantity-column.js'

export const purchaseReturnItems = pgTable(
  'purchase_return_items',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    purchaseReturnId: uuid()
      .notNull()
      .references(() => purchaseReturns.id, { onDelete: 'cascade' }),
    purchaseOrderItemId: uuid()
      .notNull()
      .references(() => purchaseOrderItems.id, { onDelete: 'restrict' }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    variantId: uuid().references(() => productVariants.id, { onDelete: 'restrict' }),
    // Số lượng theo đơn vị ghi trên phiếu nhập gốc; baseQuantity = quantity × conversionFactor
    quantity: quantity().notNull(),
    conversionFactor: integer().notNull().default(1),
    baseQuantity: quantity().notNull(),
    // Giá trị hàng trả theo giá nhập thực của dòng gốc (sau chiết khấu dòng và chiết khấu phiếu)
    lineTotal: bigint({ mode: 'number' }).notNull(),
    costAfter: bigint({ mode: 'number' }),
    stockAfter: quantity(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_purchase_return_items_return').on(table.purchaseReturnId),
    index('idx_purchase_return_items_po_item').on(table.purchaseOrderItemId),
    uniqueIndex('uniq_purchase_return_items_return_po_item').on(
      table.purchaseReturnId,
      table.purchaseOrderItemId,
    ),
  ],
)

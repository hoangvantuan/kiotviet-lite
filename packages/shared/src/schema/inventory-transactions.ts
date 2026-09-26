import { sql } from 'drizzle-orm'
import { bigint, check, index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { productVariants } from './product-variants.js'
import { products } from './products.js'
import { quantity } from './quantity-column.js'
import { stores } from './stores.js'
import { users } from './users.js'

/**
 * POS-18: chứng từ sinh ra dòng sổ kho. Mỗi loại dòng ứng với một loại chứng từ:
 * sale, order_cancel → order; return → order_return; purchase (theo phiếu), purchase_cancel →
 * purchase_order; purchase_return → purchase_return; stock_check → stock_check;
 * initial_stock → product. Nhập tay và điều chỉnh tay không có chứng từ: manual, reference_id NULL.
 */
export const INVENTORY_REFERENCE_TYPES = [
  'order',
  'order_return',
  'purchase_order',
  'purchase_return',
  'stock_check',
  'product',
  'manual',
] as const
export type InventoryReferenceType = (typeof INVENTORY_REFERENCE_TYPES)[number]

export const inventoryTransactions = pgTable(
  'inventory_transactions',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    storeId: uuid()
      .notNull()
      .references(() => stores.id),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    variantId: uuid().references(() => productVariants.id, { onDelete: 'restrict' }),
    type: varchar({ length: 32 }).notNull(),
    quantity: quantity().notNull(),
    unitCost: bigint({ mode: 'number' }),
    costAfter: bigint({ mode: 'number' }),
    stockAfter: quantity(),
    note: text(),
    // POS-18: truy dòng sổ về chứng từ gốc thay vì khớp theo ghi chú
    referenceType: varchar({ length: 32 }).$type<InventoryReferenceType>().notNull(),
    referenceId: uuid(),
    createdBy: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_inventory_tx_product_created').on(table.productId, table.createdAt),
    index('idx_inventory_tx_variant_created').on(table.variantId, table.createdAt),
    index('idx_inventory_tx_store_created').on(table.storeId, table.createdAt),
    index('idx_inventory_tx_store_product_date').on(
      table.storeId,
      table.productId,
      table.createdAt.desc(),
    ),
    index('idx_inventory_tx_reference').on(table.storeId, table.referenceType, table.referenceId),
    check(
      'chk_inventory_tx_reference_id',
      sql`${table.referenceType} = 'manual' OR ${table.referenceId} IS NOT NULL`,
    ),
  ],
)

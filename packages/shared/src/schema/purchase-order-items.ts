import { sql } from 'drizzle-orm'
import { bigint, index, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { productUnitConversions } from './product-unit-conversions.js'
import { productVariants } from './product-variants.js'
import { products } from './products.js'
import { purchaseOrders } from './purchase-orders.js'
import { quantity } from './quantity-column.js'

export const purchaseOrderItems = pgTable(
  'purchase_order_items',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    purchaseOrderId: uuid()
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    variantId: uuid().references(() => productVariants.id, { onDelete: 'restrict' }),
    productNameSnapshot: varchar({ length: 255 }).notNull(),
    productSkuSnapshot: varchar({ length: 64 }).notNull(),
    variantLabelSnapshot: varchar({ length: 255 }),
    // quantity, unitPrice, chiết khấu dòng và lineTotal theo đơn vị ghi trên chứng từ
    // (đơn vị tính, hoặc đơn vị quy đổi khi unitConversionId khác null)
    quantity: quantity().notNull(),
    unitPrice: bigint({ mode: 'number' }).notNull(),
    discountAmount: bigint({ mode: 'number' }).notNull().default(0),
    discountType: varchar({ length: 16 }).notNull().default('amount'),
    discountValue: bigint({ mode: 'number' }).notNull().default(0),
    lineTotal: bigint({ mode: 'number' }).notNull(),
    unitConversionId: uuid().references(() => productUnitConversions.id, {
      onDelete: 'set null',
    }),
    // Snapshot đơn vị quy đổi lúc nhập; null = nhập theo đơn vị tính
    unitNameSnapshot: varchar({ length: 32 }),
    // Số đơn vị tính trong một đơn vị trên chứng từ; 1 khi nhập theo đơn vị tính
    conversionFactor: integer().notNull().default(1),
    // Phần chiết khấu phiếu phân bổ cho dòng; null = phiếu lập trước quy tắc KHO-04
    orderDiscountAllocated: bigint({ mode: 'number' }),
    // Giá nhập thực trên một đơn vị tính sau mọi chiết khấu; null = phiếu lập trước quy tắc KHO-04
    unitCost: bigint({ mode: 'number' }),
    costAfter: bigint({ mode: 'number' }),
    stockAfter: quantity(),
    // KHO-11: lũy kế số lượng đã trả NCC, theo đơn vị ghi trên chứng từ
    returnedQuantity: quantity().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_purchase_order_items_po').on(table.purchaseOrderId),
    index('idx_purchase_order_items_product').on(table.productId, table.createdAt),
    index('idx_purchase_order_items_variant')
      .on(table.variantId, table.createdAt)
      .where(sql`${table.variantId} IS NOT NULL`),
  ],
)

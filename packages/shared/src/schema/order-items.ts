import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  index,
  integer,
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
import { quantity } from './quantity-column.js'

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
    quantity: quantity().notNull(),
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
    // R2 (ADR-0010): ảnh chụp lúc bán, không đổi sau khi tạo đơn.
    // Số đơn vị gốc trong một đơn vị bán (1 thùng = 24 gói); trả hàng hoàn kho theo hệ số này.
    conversionFactor: integer().notNull().default(1),
    // Giá vốn MỘT đơn vị gốc lúc bán (giá vốn biến thể, không có thì giá vốn sản phẩm; ADR-0007).
    // NULL khi lúc bán chưa có giá vốn. Giá vốn một đơn vị bán = unitCost × conversionFactor.
    unitCost: bigint({ mode: 'number' }),
    // true với dòng đơn cũ điền ngược từ giá vốn gần nhất trước ngày bán: chỉ là ước tính
    unitCostEstimated: boolean().notNull().default(false),
    // Phần chiết khấu cấp đơn phân bổ cho dòng (allocateOrderDiscount). Doanh thu ròng của dòng
    // = lineTotal - orderDiscountAllocated; tổng các dòng = orders.total.
    orderDiscountAllocated: bigint({ mode: 'number' }).notNull().default(0),
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

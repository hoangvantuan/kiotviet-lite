import {
  bigint,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { purchaseOrders } from './purchase-orders.js'
import { stores } from './stores.js'
import { suppliers } from './suppliers.js'
import { users } from './users.js'

/**
 * KHO-11: phiếu trả hàng nhập. Luôn gắn một phiếu nhập gốc, trả theo giá nhập thực của dòng gốc.
 * totalAmount = debtReductionAmount (giảm công nợ NCC) + supplierRefundAmount (NCC hoàn tiền).
 */
export const purchaseReturns = pgTable(
  'purchase_returns',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    purchaseOrderId: uuid()
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'restrict' }),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    code: varchar({ length: 32 }).notNull(),
    totalAmount: bigint({ mode: 'number' }).notNull(),
    debtReductionAmount: bigint({ mode: 'number' }).notNull().default(0),
    supplierRefundAmount: bigint({ mode: 'number' }).notNull().default(0),
    note: text(),
    createdBy: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uniq_purchase_returns_store_code').on(table.storeId, table.code),
    index('idx_purchase_returns_po').on(table.purchaseOrderId),
    index('idx_purchase_returns_store_created').on(table.storeId, table.createdAt.desc()),
  ],
)

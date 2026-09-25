import { bigint, index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { purchaseOrders } from './purchase-orders.js'
import { stores } from './stores.js'
import { suppliers } from './suppliers.js'
import { users } from './users.js'

export const supplierPayments = pgTable(
  'supplier_payments',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    amount: bigint({ mode: 'number' }).notNull(),
    note: varchar({ length: 500 }),
    // TIEN-104: phiếu chi có thể gắn với một phiếu nhập cụ thể (tùy chọn)
    purchaseOrderId: uuid().references(() => purchaseOrders.id, { onDelete: 'restrict' }),
    // TIEN-107: chứng từ không bị xóa, hủy thì đổi trạng thái và ghi người hủy, lúc hủy, lý do
    status: varchar({ length: 16 }).notNull().default('active'),
    cancelledAt: timestamp({ withTimezone: true }),
    cancelledBy: uuid().references(() => users.id, { onDelete: 'restrict' }),
    cancelReason: varchar({ length: 500 }),
    createdBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_supplier_payments_store_created').on(table.storeId, table.createdAt.desc()),
    index('idx_supplier_payments_store_supplier').on(
      table.storeId,
      table.supplierId,
      table.createdAt.desc(),
    ),
    index('idx_supplier_payments_store_creator').on(table.storeId, table.createdBy),
    index('idx_supplier_payments_purchase_order').on(table.purchaseOrderId),
  ],
)

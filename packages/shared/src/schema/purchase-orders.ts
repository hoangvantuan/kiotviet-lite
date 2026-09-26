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

import { cashShifts } from './cash-shifts.js'
import { stores } from './stores.js'
import { suppliers } from './suppliers.js'
import { users } from './users.js'

export const purchaseOrders = pgTable(
  'purchase_orders',
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
    code: varchar({ length: 32 }).notNull(),
    subtotal: bigint({ mode: 'number' }).notNull(),
    discountTotal: bigint({ mode: 'number' }).notNull().default(0),
    discountTotalType: varchar({ length: 16 }).notNull().default('amount'),
    discountTotalValue: bigint({ mode: 'number' }).notNull().default(0),
    totalAmount: bigint({ mode: 'number' }).notNull(),
    paidAmount: bigint({ mode: 'number' }).notNull().default(0),
    paymentStatus: varchar({ length: 16 }).notNull(),
    note: text(),
    // KHO-11: phiếu nhập hủy thì đổi trạng thái, không xóa. Hủy đảo tồn kho và công nợ NCC.
    status: varchar({ length: 16 }).notNull().default('active'),
    cancelledAt: timestamp({ withTimezone: true }),
    cancelledBy: uuid().references(() => users.id, { onDelete: 'restrict' }),
    cancelReason: varchar({ length: 500 }),
    // Lúc hủy: phần giảm vào công nợ NCC và phần NCC phải hoàn tiền mặt (tổng = totalAmount)
    cancelDebtReduction: bigint({ mode: 'number' }).notNull().default(0),
    cancelSupplierRefund: bigint({ mode: 'number' }).notNull().default(0),
    // BC-06: kênh NCC hoàn phần tiền trên và ca nhận tiền (tiền vào của ngày hủy)
    cancelRefundMethod: varchar({ length: 16 }),
    cancelShiftId: uuid().references(() => cashShifts.id, { onDelete: 'restrict' }),
    // Lũy kế trả hàng nhập: giá trị hàng trả và phần NCC hoàn tiền mặt
    returnedAmount: bigint({ mode: 'number' }).notNull().default(0),
    returnRefundAmount: bigint({ mode: 'number' }).notNull().default(0),
    purchaseDate: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('uniq_purchase_orders_store_code').on(table.storeId, table.code),
    index('idx_purchase_orders_store_date').on(table.storeId, table.purchaseDate),
    index('idx_purchase_orders_store_supplier').on(table.storeId, table.supplierId),
    index('idx_purchase_orders_store_payment_status').on(table.storeId, table.paymentStatus),
    index('idx_purchase_orders_store_created').on(table.storeId, table.createdAt.desc()),
    index('idx_purchase_orders_cancel_shift').on(table.cancelShiftId),
    index('idx_purchase_orders_store_cancelled_at').on(table.storeId, table.cancelledAt),
  ],
)

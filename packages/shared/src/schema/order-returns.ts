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
import { orders } from './orders.js'
import { stores } from './stores.js'
import { users } from './users.js'

export const orderReturns = pgTable(
  'order_returns',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    returnNumber: varchar({ length: 32 }).notNull(),
    totalAmount: bigint({ mode: 'number' }).notNull(),
    refundAmount: bigint({ mode: 'number' }).notNull().default(0),
    debtReductionAmount: bigint({ mode: 'number' }).notNull().default(0),
    // Phần hoàn vào tiền trả trước của khách: đơn đã được cấn bằng tiền trả trước (ADR-0011).
    // totalAmount = debtReductionAmount + prepaymentRefundAmount + refundAmount (tiền mặt).
    prepaymentRefundAmount: bigint({ mode: 'number' }).notNull().default(0),
    // TIEN-02: kênh chi phần hoàn tiền (refundAmount). NULL khi không hoàn tiền (chỉ cấn nợ, hoàn
    // vào tiền trả trước) và với phiếu lập trước khi có trường này
    refundMethod: varchar({ length: 16 }),
    shiftId: uuid().references(() => cashShifts.id, { onDelete: 'restrict' }),
    note: text(),
    createdBy: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uniq_order_returns_store_number').on(table.storeId, table.returnNumber),
    index('idx_order_returns_order').on(table.orderId),
    index('idx_order_returns_store_date').on(table.storeId, table.createdAt),
    index('idx_order_returns_shift').on(table.shiftId),
  ],
)

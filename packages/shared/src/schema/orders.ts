import {
  bigint,
  boolean,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { cashShifts } from './cash-shifts.js'
import { customers } from './customers.js'
import type { OrderPolicyViolation } from './order-management.js'
import { priceLists } from './price-lists.js'
import { stores } from './stores.js'
import { users } from './users.js'

export const orders = pgTable(
  'orders',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    orderNumber: varchar({ length: 32 }).notNull(),
    customerId: uuid().references(() => customers.id, { onDelete: 'set null' }),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    subtotal: bigint({ mode: 'number' }).notNull(),
    discountType: varchar({ length: 16 }),
    discountValue: bigint({ mode: 'number' }).notNull().default(0),
    discountAmount: bigint({ mode: 'number' }).notNull().default(0),
    total: bigint({ mode: 'number' }).notNull(),
    paymentMethod: varchar({ length: 16 }).notNull(),
    paymentStatus: varchar({ length: 16 }).notNull(),
    cashAmount: bigint({ mode: 'number' }),
    transferAmount: bigint({ mode: 'number' }),
    change: bigint({ mode: 'number' }).notNull().default(0),
    note: text(),
    // CRIT C1: id do client sinh cho đơn offline. Unique (storeId, clientId) chống
    // tạo đơn đôi khi sync retry/race. NULL cho đơn POS online (Postgres bỏ qua
    // NULL trong unique index nên không xung đột).
    clientId: uuid(),
    status: varchar({ length: 16 }).notNull().default('completed'),
    debtLimitExceeded: boolean().notNull().default(false),
    // ADR-0009: đơn ngoại tuyến vi phạm chính sách (giá, chiết khấu, giá vốn, hạn mức nợ) vẫn được
    // nhận vì hàng đã giao, nhưng nằm ở 'pending_review' cho tới khi chủ hoặc quản lý duyệt.
    reviewStatus: varchar({ length: 16 }).notNull().default('none'),
    policyViolations: jsonb().$type<OrderPolicyViolation[]>(),
    reviewedBy: uuid().references(() => users.id),
    reviewedAt: timestamp({ withTimezone: true }),
    reviewNote: text(),
    // BC-08 (ADR-0010): số liệu lúc bán để in lại hóa đơn cũ không đổi theo phát sinh sau.
    // Khách đã trả lúc bán (total - nợ ghi cho đơn); NULL chỉ với đơn cũ không suy ra được.
    paidAmountAtSale: bigint({ mode: 'number' }),
    // Công nợ của khách ngay trước đơn này; NULL với khách lẻ và đơn cũ trước bản chụp.
    customerDebtBefore: bigint({ mode: 'number' }),
    // TIEN-107: đơn hủy giữ nguyên dòng, status = 'cancelled' kèm người hủy, lúc hủy, lý do
    cancelledAt: timestamp({ withTimezone: true }),
    cancelledBy: uuid().references(() => users.id),
    cancelReason: varchar({ length: 500 }),
    // BC-06: tiền trả lại khách khi hủy (phần khách đã trả lúc bán), kênh trả và ca chi tiền. Tiền
    // bán vẫn thuộc ngày bán và ca bán; khoản hoàn là tiền ra của ngày hủy, ca hủy
    cancelRefundAmount: bigint({ mode: 'number' }).notNull().default(0),
    cancelRefundMethod: varchar({ length: 16 }),
    cancelShiftId: uuid().references(() => cashShifts.id, { onDelete: 'restrict' }),
    // POS-06: ca bán hàng. Đơn ngoại tuyến gắn theo giờ bán và người bán khi đồng bộ; NULL khi
    // không có ca phù hợp (hiện trong đối soát)
    shiftId: uuid().references(() => cashShifts.id, { onDelete: 'restrict' }),
    priceListId: uuid().references(() => priceLists.id, { onDelete: 'set null' }),
    priceListName: varchar({ length: 100 }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // BC-06: giờ bán. Đơn trực tuyến bằng giờ tạo; đơn ngoại tuyến là giờ bán trên máy (đã kiểm,
    // không ở tương lai) còn created_at là giờ đồng bộ. Báo cáo dòng tiền và gắn ca theo cột này.
    soldAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // BM-02: khách và bảng giá của đơn phải cùng cửa hàng với đơn. MATCH SIMPLE nên cột NULL
    // không bị kiểm; khóa ngoại một cột ở trên vẫn giữ ON DELETE SET NULL.
    foreignKey({
      name: 'fk_orders_store_customer',
      columns: [table.storeId, table.customerId],
      foreignColumns: [customers.storeId, customers.id],
    }),
    foreignKey({
      name: 'fk_orders_store_price_list',
      columns: [table.storeId, table.priceListId],
      foreignColumns: [priceLists.storeId, priceLists.id],
    }),
    uniqueIndex('uniq_orders_store_number').on(table.storeId, table.orderNumber),
    uniqueIndex('uniq_orders_store_client').on(table.storeId, table.clientId),
    index('idx_orders_store_date').on(table.storeId, table.createdAt),
    index('idx_orders_store_sold_at').on(table.storeId, table.soldAt),
    index('idx_orders_store_price_list').on(table.storeId, table.priceListId),
    index('idx_orders_store_status').on(table.storeId, table.status),
    index('idx_orders_store_customer').on(table.storeId, table.customerId),
    index('idx_orders_store_payment_status').on(table.storeId, table.paymentStatus),
    index('idx_orders_shift').on(table.shiftId),
    index('idx_orders_cancel_shift').on(table.cancelShiftId),
    index('idx_orders_store_cancelled_at').on(table.storeId, table.cancelledAt),
    index('idx_orders_store_review_status').on(table.storeId, table.reviewStatus),
    index('idx_orders_store_status_created').on(table.storeId, table.status, table.createdAt),
    index('idx_orders_store_cust_status_date').on(
      table.storeId,
      table.customerId,
      table.status,
      table.createdAt,
    ),
    index('idx_orders_store_user_status_date').on(
      table.storeId,
      table.userId,
      table.status,
      table.createdAt,
    ),
  ],
)

import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { customers } from './customers.js'
import { orders } from './orders.js'
import { stores } from './stores.js'

// sale: nợ sinh từ đơn bán; opening: nợ đầu kỳ (ADR-0003); adjustment: điều chỉnh tăng nợ
export const debtTypeEnum = pgEnum('debt_type', ['sale', 'opening', 'adjustment'])

export const debts = pgTable(
  'debts',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    orderId: uuid().references(() => orders.id, { onDelete: 'restrict' }),
    customerId: uuid()
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    type: debtTypeEnum().notNull().default('sale'),
    amount: bigint({ mode: 'number' }).notNull(),
    // Tiền thực thu qua phiếu thu (không gồm cấn trừ trả hàng hay điều chỉnh giảm)
    paid: bigint({ mode: 'number' }).notNull().default(0),
    // Phần nợ được giảm mà không thu tiền: cấn trừ trả hàng, điều chỉnh giảm nợ
    reduced: bigint({ mode: 'number' }).notNull().default(0),
    remaining: bigint({ mode: 'number' }).notNull(),
    // Phần của `reduced` là tiền trả trước đã cấn vào khoản này (ADR-0011). Trả hàng hoàn phần
    // này về tiền trả trước thay vì hoàn tiền mặt, rồi trừ lại ở đây.
    prepaymentApplied: bigint({ mode: 'number' }).notNull().default(0),
    // Ghi chú nguồn của khoản nợ không gắn đơn (lý do điều chỉnh tăng, điền ngược)
    note: varchar({ length: 500 }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // FIFO order theo thời gian tạo (Story 5.2 dùng để phân bổ)
    index('idx_debts_store_customer').on(table.storeId, table.customerId, table.createdAt.asc()),
    // Mỗi order chỉ có 1 debt record duy nhất
    uniqueIndex('uniq_debts_store_order').on(table.storeId, table.orderId),
    // Query nợ còn lại nhanh (nợ chưa trả hết)
    index('idx_debts_remaining')
      .on(table.storeId, table.customerId, table.remaining)
      .where(sql`${table.remaining} > 0`),
    // Index cho báo cáo tuổi nợ và nợ quá hạn dashboard
    index('idx_debts_store_remaining_created')
      .on(table.storeId, table.createdAt)
      .where(sql`${table.remaining} > 0`),
    // Mỗi khoản nợ: phát sinh = đã thu + giảm trừ + còn lại
    check(
      'chk_debts_balance',
      sql`${table.amount} = ${table.paid} + ${table.reduced} + ${table.remaining}`,
    ),
    // Khoản thường không âm. Riêng nợ đầu kỳ âm là tiền khách trả trước (ADR-0011): phần đã
    // cấn vào nợ mới ghi thành `reduced` âm, `remaining` chạy từ `amount` về 0.
    check(
      'chk_debts_sign',
      sql`(${table.paid} >= 0 AND ${table.reduced} >= 0 AND ${table.remaining} >= 0) OR (${table.type} = 'opening' AND ${table.amount} < 0 AND ${table.paid} = 0 AND ${table.reduced} <= 0 AND ${table.remaining} <= 0)`,
    ),
    check(
      'chk_debts_prepayment_applied',
      sql`${table.prepaymentApplied} >= 0 AND ${table.prepaymentApplied} <= GREATEST(${table.reduced}, 0)`,
    ),
  ],
)

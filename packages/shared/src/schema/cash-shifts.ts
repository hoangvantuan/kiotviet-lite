import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  index,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import type { ShiftSummary } from './cash-management.js'
import { stores } from './stores.js'
import { users } from './users.js'

/**
 * POS-06: ca bán hàng. Mỗi người bán có tối đa một ca đang mở (chỉ mục unique một phần). Đơn,
 * phiếu thu, phiếu trả, phiếu chi lập trong ca ghi `shift_id`; lúc đóng ca máy chủ tính tiền mặt
 * phải có từ các chứng từ đó và chụp lại vào `close_summary`, cùng số thực đếm và chênh lệch.
 */
export const cashShifts = pgTable(
  'cash_shifts',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: varchar({ length: 16 }).notNull().default('open'),
    openingCash: bigint({ mode: 'number' }).notNull(),
    openNote: varchar({ length: 500 }),
    openedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp({ withTimezone: true }),
    closedBy: uuid().references(() => users.id, { onDelete: 'restrict' }),
    // Tiền mặt phải có = đầu ca + thu tiền mặt - chi và hoàn tiền mặt, tính lúc đóng ca
    expectedCash: bigint({ mode: 'number' }),
    countedCash: bigint({ mode: 'number' }),
    // Chênh lệch = thực đếm - phải có: âm là thiếu tiền, dương là thừa tiền
    difference: bigint({ mode: 'number' }),
    closeNote: varchar({ length: 500 }),
    closeSummary: jsonb().$type<ShiftSummary>(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('uniq_cash_shifts_open_user')
      .on(table.storeId, table.userId)
      .where(sql`${table.status} = 'open'`),
    index('idx_cash_shifts_store_opened').on(table.storeId, table.openedAt),
    index('idx_cash_shifts_store_user_opened').on(table.storeId, table.userId, table.openedAt),
    check('chk_cash_shifts_status', sql`${table.status} IN ('open', 'closed')`),
    check('chk_cash_shifts_opening_cash', sql`${table.openingCash} >= 0`),
    check(
      'chk_cash_shifts_closed_fields',
      sql`${table.status} = 'open' OR (${table.closedAt} IS NOT NULL AND ${table.countedCash} IS NOT NULL AND ${table.expectedCash} IS NOT NULL AND ${table.difference} IS NOT NULL)`,
    ),
  ],
)

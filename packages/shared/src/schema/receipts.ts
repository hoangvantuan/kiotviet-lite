import { bigint, index, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { cashShifts } from './cash-shifts.js'
import { customers } from './customers.js'
import { stores } from './stores.js'
import { users } from './users.js'

export const receipts = pgTable(
  'receipts',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    // TIEN-109: mã phiếu thu PT-yymmdd-nnnn cấp từ bộ đếm theo cửa hàng (R4)
    code: varchar({ length: 32 }).notNull(),
    customerId: uuid()
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    amount: bigint({ mode: 'number' }).notNull(),
    // TIEN-05: phương thức nhận tiền; NULL chỉ với phiếu lập trước khi có trường này
    paymentMethod: varchar({ length: 16 }),
    // POS-06: ca của người lập phiếu lúc lập, NULL khi không có ca mở
    shiftId: uuid().references(() => cashShifts.id, { onDelete: 'restrict' }),
    note: varchar({ length: 500 }),
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
    uniqueIndex('uniq_receipts_store_code').on(table.storeId, table.code),
    index('idx_receipts_shift').on(table.shiftId),
    index('idx_receipts_store_created').on(table.storeId, table.createdAt.desc()),
    index('idx_receipts_store_customer').on(
      table.storeId,
      table.customerId,
      table.createdAt.desc(),
    ),
  ],
)

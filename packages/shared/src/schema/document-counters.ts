import { integer, pgTable, primaryKey, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

import { stores } from './stores.js'

/**
 * OFF-08: bộ đếm mã chứng từ theo cửa hàng. Mỗi tiền tố (vd `HD-260925-`) có một dòng, số kế tiếp
 * cấp bằng `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, nên bán song song không đụng mã và
 * không phải thử lại trong một transaction đã hỏng như cách `MAX + 1` cũ.
 */
export const documentCounters = pgTable(
  'document_counters',
  {
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    prefix: varchar({ length: 32 }).notNull(),
    lastValue: integer().notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.storeId, table.prefix] })],
)

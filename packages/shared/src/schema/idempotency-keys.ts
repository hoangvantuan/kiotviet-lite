import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { stores } from './stores.js'
import { users } from './users.js'

/**
 * POS-02, TIEN-04, KHO-08: khóa chống trùng của các POST tạo chứng từ. Khóa là duy nhất theo cửa
 * hàng; dòng được giành ở đầu transaction tạo chứng từ và ghi phản hồi ở cuối CÙNG transaction đó,
 * nên hoặc có cả chứng từ lẫn phản hồi, hoặc không có gì. Gửi lại cùng khóa nhận nguyên phản hồi cũ.
 */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    key: varchar({ length: 128 }).notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    // Đường dẫn thật của request (vd /api/v1/orders/<id>/returns), để khóa không dùng chéo route
    requestPath: varchar({ length: 255 }).notNull(),
    // sha256 của phương thức, đường dẫn, người gửi và nội dung body đã chuẩn hóa
    requestHash: varchar({ length: 64 }).notNull(),
    // NULL chỉ tồn tại bên trong transaction đang tạo chứng từ, không bao giờ được commit
    responseStatus: integer(),
    responseBody: jsonb(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.storeId, table.key] }),
    index('idx_idempotency_keys_created_at').on(table.createdAt),
  ],
)

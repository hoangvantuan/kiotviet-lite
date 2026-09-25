import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { customerGroups } from './customer-groups.js'
import { stores } from './stores.js'

export const customers = pgTable(
  'customers',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    name: varchar({ length: 100 }).notNull(),
    code: varchar({ length: 64 }).notNull(),
    phone: varchar({ length: 20 }),
    email: varchar({ length: 255 }),
    address: text(),
    taxId: varchar({ length: 32 }),
    notes: text(),
    // Hạn mức nợ riêng. NULL: theo hạn mức nhóm; không có nhóm hoặc nhóm không đặt thì KHÔNG được nợ.
    // 0 cũng là không được nợ. "Không giới hạn" chỉ bật bằng cờ debtUnlimited (ADR-0009).
    debtLimit: bigint({ mode: 'number' }),
    debtUnlimited: boolean().notNull().default(false),
    groupId: uuid().references(() => customerGroups.id, { onDelete: 'set null' }),
    totalPurchased: bigint({ mode: 'number' }).notNull().default(0),
    purchaseCount: integer().notNull().default(0),
    currentDebt: bigint({ mode: 'number' }).notNull().default(0),
    deletedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Đích của khóa ngoại ghép (store_id, customer_id) từ bảng khác: chặn tham chiếu chéo cửa hàng.
    uniqueIndex('uniq_customers_store_id').on(table.storeId, table.id),
    uniqueIndex('uniq_customers_store_code_alive')
      .on(table.storeId, sql`LOWER(${table.code})`)
      .where(sql`${table.deletedAt} IS NULL`),
    uniqueIndex('uniq_customers_store_phone_alive')
      .on(table.storeId, table.phone)
      .where(sql`${table.deletedAt} IS NULL AND ${table.phone} IS NOT NULL`),
    index('idx_customers_store_created').on(table.storeId, table.createdAt),
    index('idx_customers_store_group').on(table.storeId, table.groupId),
    index('idx_customers_store_name_lower').on(table.storeId, sql`LOWER(${table.name})`),
    index('idx_customers_store_phone').on(table.storeId, table.phone),
  ],
)

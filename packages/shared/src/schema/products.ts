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

import { PRODUCT_SEARCH_SOURCE, searchTextSql } from '../utils/search-text.js'
import { brands } from './brands.js'
import { categories } from './categories.js'
import { quantity } from './quantity-column.js'
import { stores } from './stores.js'

export const products = pgTable(
  'products',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    name: varchar({ length: 255 }).notNull(),
    sku: varchar({ length: 64 }).notNull(),
    barcode: varchar({ length: 64 }),
    categoryId: uuid().references(() => categories.id, { onDelete: 'restrict' }),
    brandId: uuid().references(() => brands.id, { onDelete: 'restrict' }),
    sellingPrice: bigint({ mode: 'number' }).notNull().default(0),
    costPrice: bigint({ mode: 'number' }),
    unit: varchar({ length: 32 }).notNull().default('Cái'),
    weight: integer(),
    description: text(),
    imageUrl: text(),
    // Tên và mã đã bỏ dấu tiếng Việt, chữ thường: tìm kiếm không dấu, có chỉ mục trigram.
    searchText: text()
      .notNull()
      .generatedAlwaysAs(sql.raw(searchTextSql(PRODUCT_SEARCH_SOURCE))),
    status: varchar({ length: 16 }).notNull().default('active'),
    hasVariants: boolean().notNull().default(false),
    trackInventory: boolean().notNull().default(false),
    // ADR-0015: cho phép số lượng lẻ (hàng cân ký). Mặc định false: hàng đếm cái chỉ nhận số nguyên.
    allowDecimalQuantity: boolean().notNull().default(false),
    currentStock: quantity().notNull().default(0),
    minStock: quantity().notNull().default(0),
    deletedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('uniq_products_store_sku_alive')
      .on(table.storeId, sql`LOWER(${table.sku})`)
      .where(sql`${table.deletedAt} IS NULL`),
    uniqueIndex('uniq_products_store_barcode_alive')
      .on(table.storeId, table.barcode)
      .where(sql`${table.deletedAt} IS NULL AND ${table.barcode} IS NOT NULL`),
    index('idx_products_store_status_created').on(table.storeId, table.status, table.createdAt),
    index('idx_products_store_category').on(table.storeId, table.categoryId),
    index('idx_products_store_name_lower').on(table.storeId, sql`LOWER(${table.name})`),
    // Cần extension pg_trgm (migration tạo extension chạy trước). Tắt fastupdate: danh sách chờ
    // của GIN làm nhập 11k dòng trong một transaction chậm gấp 6 lần, và planner bỏ qua chỉ mục
    // tới lần VACUUM kế tiếp (GL-21).
    index('idx_products_search_text_trgm')
      .using('gin', table.searchText.op('gin_trgm_ops'))
      .with({ fastupdate: 'off' }),
  ],
)

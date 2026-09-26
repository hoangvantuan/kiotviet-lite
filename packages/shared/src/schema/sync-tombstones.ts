import { index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

/**
 * GL-03: dấu vết các dòng danh mục bị XÓA CỨNG, để máy bán hàng đồng bộ gia tăng biết mà xóa bản
 * sao cục bộ. Dòng được trigger AFTER DELETE ghi (migration sync_tombstones_triggers), kể cả khi xóa lan theo khóa
 * ngoại. Xóa mềm và ngừng bán không cần bảng này: dòng vẫn còn, `updated_at` đổi nên tự lọt vào
 * lượt đồng bộ sau. Không đặt khóa ngoại tới stores để xóa cửa hàng không bị chặn.
 */
export const syncTombstones = pgTable(
  'sync_tombstones',
  {
    // Trigger chèn dòng nên khóa phải có mặc định phía cơ sở dữ liệu
    id: uuid().primaryKey().defaultRandom(),
    storeId: uuid().notNull(),
    // Tên bảng nguồn, ví dụ 'products', 'price_list_items'
    entity: varchar({ length: 64 }).notNull(),
    entityId: uuid().notNull(),
    deletedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_sync_tombstones_store_deleted').on(table.storeId, table.deletedAt, table.id),
  ],
)

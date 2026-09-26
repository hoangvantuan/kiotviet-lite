import { z } from 'zod'

import { pgliteMigrations } from '../migrations/pglite/index.js'

/**
 * GL-03: các loại dữ liệu danh mục máy bán hàng kéo về. `tombstones` là dấu vết dòng bị xóa cứng.
 * Thứ tự này cũng là thứ tự máy khách kéo trong một lượt.
 */
export const SYNC_PULL_ENTITIES = [
  'tombstones',
  'price_lists',
  'customer_groups',
  'customers',
  'products',
  'variants',
  'unit_conversions',
  'price_list_items',
  'customer_prices',
  'volume_prices',
  'category_discounts',
] as const
export type SyncPullEntity = (typeof SYNC_PULL_ENTITIES)[number]

export const SYNC_PULL_DEFAULT_LIMIT = 1000

/** Vị trí đã đọc tới: mốc updated_at (ISO UTC, đủ micro giây) và id của dòng cuối */
export interface SyncCursor {
  t: string
  id: string
}

export const syncPullQuerySchema = z
  .object({
    entity: z.enum(SYNC_PULL_ENTITIES),
    after: z.string().datetime({ offset: true }).optional(),
    afterId: z.string().uuid().optional(),
    // Trang đầu của lượt gia tăng: thời điểm máy chủ lúc bắt đầu lượt trước. Dòng lượt trước có thể
    // bỏ sót là dòng của transaction đang chạy lúc đó (commit muộn), nên đọc lại từ vài phút trước mốc
    since: z.string().datetime({ offset: true }).optional(),
    limit: z.coerce.number().int().min(1).max(2000).default(SYNC_PULL_DEFAULT_LIMIT),
  })
  .transform(({ entity, after, afterId, since, limit }) => ({
    entity,
    cursor: after ? { t: after, id: afterId ?? '00000000-0000-0000-0000-000000000000' } : null,
    since: after !== undefined ? (since ?? null) : null,
    limit,
  }))
export type SyncPullQuery = z.output<typeof syncPullQuerySchema>

export interface SyncPullResponse {
  data: {
    entity: SyncPullEntity
    /** Dòng còn dùng được (với `tombstones`: {entity, entityId}) */
    rows: Record<string, unknown>[]
    /** id các dòng đã xóa mềm, máy khách phải xóa bản sao */
    deleted: string[]
  }
  meta: {
    hasMore: boolean
    /** null khi trang rỗng: máy khách giữ con trỏ cũ */
    nextCursor: SyncCursor | null
    serverTime: string
    /** Chỉ có ở trang đầu của lần đồng bộ từ đầu, để hiện tiến độ */
    total?: number
    /** Con trỏ dấu xóa đã quá hạn lưu giữ: xóa dữ liệu cục bộ và đồng bộ lại từ đầu */
    resetRequired?: boolean
  }
}

export const schemaVersionResponseSchema = z.object({
  version: z.number().int(),
})
export type SchemaVersionResponse = z.infer<typeof schemaVersionResponseSchema>

/** Phiên bản schema PGlite mới nhất, suy từ danh sách migration để không lệch khi thêm bản mới */
export const PGLITE_SCHEMA_VERSION = Math.max(...pgliteMigrations.map((m) => m.version))

/**
 * OFF-17: mã tạm in trên hóa đơn của đơn ngoại tuyến là tiền tố này cộng 8 ký tự đầu của
 * clientId. Máy chủ cấp mã thật khi đồng bộ; tìm đơn bằng mã tạm vẫn ra đúng đơn đó.
 */
export const OFFLINE_ORDER_NUMBER_PREFIX = 'TAM-'
/** Nhận cả tiền tố `OFFLINE-` của bản trước, vì hóa đơn đã in bằng bản đó vẫn còn trong tay khách */
export const OFFLINE_ORDER_NUMBER_PATTERN = /^(?:TAM|OFFLINE)-([0-9a-f]{8})$/i

import { createOrderItemSchema, createOrderSchema } from './order-management.js'

// Story 9-2: Sync push schemas
export const syncPushOrderItemSchema = createOrderItemSchema
export const syncPushOrderDataSchema = createOrderSchema

/**
 * OFF-10: số đơn tối đa trong một lần `/sync/push`. Máy khách chia hàng chờ thành từng lô theo
 * đúng hằng số này, nên hai phía không lệch nhau.
 */
export const SYNC_PUSH_MAX_BATCH = 100

/**
 * OFF-11: đơn ngoại tuyến mang giờ bán tính trên máy bán. Máy chủ chấp nhận lệch tới
 * SYNC_SOLD_AT_MAX_FUTURE_MS về tương lai (đồng hồ máy lệch nhẹ); xa hơn thì dùng giờ nhận đơn và
 * gắn cờ. Cũ hơn SYNC_SOLD_AT_MAX_AGE_DAYS, hoặc trước lúc tạo cửa hàng, cũng dùng giờ nhận đơn và
 * gắn cờ (ADR-0014).
 */
export const SYNC_SOLD_AT_MAX_FUTURE_MS = 5 * 60 * 1000
export const SYNC_SOLD_AT_MAX_AGE_DAYS = 7

export const syncPushOrderSchema = z.object({
  clientId: z.string().uuid(),
  // Giờ bán trên máy bán (OFF-11)
  createdAt: z.string().datetime(),
  // OFF-05: người bán lúc bán. Máy chủ kiểm người này thuộc cửa hàng của người đồng bộ và còn
  // quyền bán. Máy khách cũ không gửi thì người đồng bộ là người bán.
  sellerUserId: z.string().uuid().optional(),
  orderData: syncPushOrderDataSchema,
})
export type SyncPushOrder = z.infer<typeof syncPushOrderSchema>

/**
 * OFF-10: lô chỉ kiểm khung và clientId. Nội dung từng đơn kiểm riêng ở máy chủ, để một đơn sai
 * không làm cả lô bị từ chối (mỗi đơn có kết quả riêng).
 */
export const syncPushRequestSchema = z.object({
  orders: z
    .array(z.object({ clientId: z.string().uuid() }).passthrough())
    .min(1)
    .max(SYNC_PUSH_MAX_BATCH, `Mỗi lần đồng bộ tối đa ${SYNC_PUSH_MAX_BATCH} đơn`),
})
export type SyncPushRequest = z.infer<typeof syncPushRequestSchema>

export const syncPushResultSchema = z.object({
  clientId: z.string().uuid(),
  serverId: z.string().uuid().optional(),
  // OFF-17: mã đơn trên máy chủ, thay cho mã tạm in lúc ngoại tuyến
  orderNumber: z.string().optional(),
  status: z.enum(['synced', 'error', 'duplicate']),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      // Lý do cụ thể trong cùng mã lỗi, ví dụ seller_not_in_store, seller_inactive
      reason: z.string().optional(),
    })
    .optional(),
  // Sai lệch máy chủ đã tự xử lý nhưng vẫn nhận đơn (khách hoặc bảng giá không thuộc cửa hàng)
  warnings: z.array(z.object({ code: z.string(), message: z.string() })).optional(),
  // ADR-0009: đơn đã nhận nhưng vi phạm chính sách, đang chờ chủ duyệt
  reviewStatus: z.enum(['none', 'pending_review', 'approved', 'rejected']).optional(),
})
export type SyncPushResult = z.infer<typeof syncPushResultSchema>

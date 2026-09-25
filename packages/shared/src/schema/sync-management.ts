import { z } from 'zod'

export const syncInitialQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
})
export type SyncInitialQuery = z.infer<typeof syncInitialQuerySchema>

export const syncIncrementalQuerySchema = z.object({
  since: z.string().datetime(),
})
export type SyncIncrementalQuery = z.infer<typeof syncIncrementalQuerySchema>

export const schemaVersionResponseSchema = z.object({
  version: z.number().int(),
})
export type SchemaVersionResponse = z.infer<typeof schemaVersionResponseSchema>

export const PGLITE_SCHEMA_VERSION = 2

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
 * gắn cờ. Đơn cũ hơn SYNC_SOLD_AT_MAX_AGE_DAYS vẫn giữ giờ bán nhưng gắn cờ để chủ đối chiếu.
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

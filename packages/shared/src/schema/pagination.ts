import { z } from 'zod'

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants/pagination.js'

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
})

/**
 * Bộ lọc ngày của các màn danh sách (R7). Nhận ngày YYYY-MM-DD, máy chủ hiểu theo lịch cửa hàng
 * (from = 00:00, to = 23:59:59.999 giờ cửa hàng), hoặc thời điểm ISO đầy đủ, giữ nguyên.
 * Máy khách nên gửi YYYY-MM-DD để mốc ngày không phụ thuộc múi giờ của trình duyệt.
 */
export const dateFilterSchema = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày không hợp lệ (YYYY-MM-DD)'),
  z.string().datetime({ offset: true }),
])

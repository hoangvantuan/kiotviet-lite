import { z } from 'zod'

import { dateFilterSchema, paginationSchema } from './pagination.js'

export const stockCheckStatusSchema = z.enum(['draft', 'confirmed'])

export const stockCheckItemInputSchema = z.object({
  productId: z.string().uuid('Sản phẩm không hợp lệ'),
  variantId: z.string().uuid('Biến thể không hợp lệ').nullable().optional(),
  actualQty: z
    .number()
    .int('Số lượng thực tế phải là số nguyên')
    .min(0, 'Số lượng thực tế ≥ 0')
    .max(1_000_000_000, 'Số lượng thực tế vượt giới hạn'),
  note: z.string().trim().max(255, 'Ghi chú dòng tối đa 255 ký tự').nullable().optional(),
})

export const createStockCheckBodySchema = z.object({
  note: z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự').nullable().optional(),
  items: z
    .array(stockCheckItemInputSchema)
    .min(1, 'Phiếu kiểm phải có ít nhất 1 dòng sản phẩm')
    .max(1000, 'Tối đa 1000 dòng trong một phiếu kiểm'),
})

export const updateStockCheckBodySchema = z.object({
  note: z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự').nullable().optional(),
  items: z
    .array(stockCheckItemInputSchema)
    .min(1, 'Phiếu kiểm phải có ít nhất 1 dòng sản phẩm')
    .max(1000, 'Tối đa 1000 dòng trong một phiếu kiểm')
    .optional(),
})

export const listStockChecksQuerySchema = paginationSchema.extend({
  status: stockCheckStatusSchema.optional(),
  search: z.string().trim().optional(),
  fromDate: dateFilterSchema.optional(),
  toDate: dateFilterSchema.optional(),
})

export const stockCheckItemDetailSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable(),
  productNameSnapshot: z.string(),
  productSkuSnapshot: z.string(),
  variantLabelSnapshot: z.string().nullable(),
  systemQty: z.number().int(),
  actualQty: z.number().int(),
  diff: z.number().int(),
  note: z.string().nullable(),
})

export const stockCheckListItemSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  status: stockCheckStatusSchema,
  totalItems: z.number().int(),
  totalDiffPositive: z.number().int(),
  totalDiffNegative: z.number().int(),
  note: z.string().nullable(),
  createdAt: z.string(),
  confirmedAt: z.string().nullable(),
  createdBy: z.string().uuid(),
  createdByName: z.string().nullable(),
  confirmedBy: z.string().uuid().nullable(),
  confirmedByName: z.string().nullable(),
})

export const stockCheckDetailSchema = stockCheckListItemSchema.extend({
  storeId: z.string().uuid(),
  updatedAt: z.string(),
  items: z.array(stockCheckItemDetailSchema),
})

export const stockCheckCountsSchema = z.object({
  total: z.number().int(),
  draft: z.number().int(),
  confirmed: z.number().int(),
})

export const negativeStockDetailSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable(),
  productName: z.string(),
  variantLabel: z.string().nullable(),
  currentStock: z.number().int(),
  diff: z.number().int(),
  wouldBe: z.number().int(),
})

// Dòng có tồn hệ thống đã đổi (nhập, bán, trả, phiếu kiểm khác) sau lúc đếm: số đếm cũ không
// còn đối chiếu được với tồn hiện tại, phải đếm lại rồi lưu phiếu trước khi xác nhận (KHO-02)
export const staleStockCheckItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable(),
  productName: z.string(),
  variantLabel: z.string().nullable(),
  systemQty: z.number().int(),
  currentStock: z.number().int(),
})

export type StockCheckStatus = z.infer<typeof stockCheckStatusSchema>
export type StockCheckItemInput = z.infer<typeof stockCheckItemInputSchema>
export type CreateStockCheckInput = z.infer<typeof createStockCheckBodySchema>
export type UpdateStockCheckInput = z.infer<typeof updateStockCheckBodySchema>
export type ListStockChecksQuery = z.infer<typeof listStockChecksQuerySchema>
export type StockCheckItemDetail = z.infer<typeof stockCheckItemDetailSchema>
export type StockCheckListItem = z.infer<typeof stockCheckListItemSchema>
export type StockCheckDetail = z.infer<typeof stockCheckDetailSchema>
export type StockCheckCounts = z.infer<typeof stockCheckCountsSchema>
export type NegativeStockDetail = z.infer<typeof negativeStockDetailSchema>
export type StaleStockCheckItem = z.infer<typeof staleStockCheckItemSchema>

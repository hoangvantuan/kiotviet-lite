import { z } from 'zod'

import { dateFilterSchema, paginationSchema } from './pagination.js'
import { nonNegativeQuantitySchema } from './quantity-input.js'

export const stockCheckStatusSchema = z.enum(['draft', 'confirmed'])

export const stockCheckItemInputSchema = z.object({
  productId: z.string().uuid('Sản phẩm không hợp lệ'),
  variantId: z.string().uuid('Biến thể không hợp lệ').nullable().optional(),
  // ADR-0015: số lẻ chỉ cho mặt hàng bật cờ, máy chủ kiểm khi nạp mặt hàng
  actualQty: nonNegativeQuantitySchema('Số lượng thực tế'),
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
  systemQty: z.number(),
  actualQty: z.number(),
  diff: z.number(),
  note: z.string().nullable(),
  // ADR-0015: cờ bán số lẻ hiện tại của mặt hàng, để ô số lượng thực tế nhận số lẻ
  allowDecimalQuantity: z.boolean(),
})

export const stockCheckListItemSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  status: stockCheckStatusSchema,
  totalItems: z.number().int(),
  totalDiffPositive: z.number(),
  totalDiffNegative: z.number(),
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
  currentStock: z.number(),
  diff: z.number(),
  wouldBe: z.number(),
})

// Dòng có tồn hệ thống đã đổi (nhập, bán, trả, phiếu kiểm khác) sau lúc đếm: số đếm cũ không
// còn đối chiếu được với tồn hiện tại, phải đếm lại rồi lưu phiếu trước khi xác nhận (KHO-02)
export const staleStockCheckItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable(),
  productName: z.string(),
  variantLabel: z.string().nullable(),
  systemQty: z.number(),
  currentStock: z.number(),
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

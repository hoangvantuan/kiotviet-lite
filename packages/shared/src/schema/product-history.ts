import { z } from 'zod'

import { paginationSchema } from './pagination.js'

export const productHistoryQuerySchema = paginationSchema.extend({
  variantId: z.string().uuid().optional(),
})

export const productPurchaseHistoryItemSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  purchaseOrderItemId: z.string().uuid(),
  purchaseOrderCode: z.string(),
  purchaseDate: z.string(),
  supplierId: z.string().uuid(),
  supplierName: z.string(),
  variantId: z.string().uuid().nullable(),
  variantLabelSnapshot: z.string().nullable(),
  quantity: z.number(),
  unitPrice: z.number().int(),
  discountAmount: z.number().int(),
  lineTotal: z.number().int(),
  costAfter: z.number().int().nullable(),
  stockAfter: z.number().nullable(),
})

export const productStockCheckHistoryItemSchema = z.object({
  stockCheckLogId: z.string().uuid(),
  stockCheckId: z.string().uuid(),
  stockCheckCode: z.string(),
  adjustedAt: z.string(),
  adjustedBy: z.string().uuid(),
  adjustedByName: z.string().nullable(),
  variantId: z.string().uuid().nullable(),
  variantLabelSnapshot: z.string().nullable(),
  systemQty: z.number(),
  actualQty: z.number(),
  diff: z.number(),
  note: z.string().nullable(),
})

export type ProductHistoryQuery = z.infer<typeof productHistoryQuerySchema>
export type ProductPurchaseHistoryItem = z.infer<typeof productPurchaseHistoryItemSchema>
export type ProductStockCheckHistoryItem = z.infer<typeof productStockCheckHistoryItemSchema>

import { z } from 'zod'

export const productHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
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
  quantity: z.number().int(),
  unitPrice: z.number().int(),
  discountAmount: z.number().int(),
  lineTotal: z.number().int(),
  costAfter: z.number().int().nullable(),
  stockAfter: z.number().int().nullable(),
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
  systemQty: z.number().int(),
  actualQty: z.number().int(),
  diff: z.number().int(),
  note: z.string().nullable(),
})

export type ProductHistoryQuery = z.infer<typeof productHistoryQuerySchema>
export type ProductPurchaseHistoryItem = z.infer<typeof productPurchaseHistoryItemSchema>
export type ProductStockCheckHistoryItem = z.infer<typeof productStockCheckHistoryItemSchema>

import { z } from 'zod'

export const inventoryTransactionTypeSchema = z.enum([
  'initial_stock',
  'purchase',
  'sale',
  'manual_adjustment',
  'return',
])

export const inventoryTransactionItemSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable(),
  type: inventoryTransactionTypeSchema,
  quantity: z.number(),
  unitCost: z.number().nullable(),
  costAfter: z.number().nullable(),
  stockAfter: z.number().nullable(),
  note: z.string().nullable(),
  createdBy: z.string().uuid(),
  createdAt: z.string(),
})

export const recordPurchaseInputSchema = z.object({
  variantId: z.string().uuid().nullable().optional(),
  quantity: z.number().int().min(1, 'Số lượng phải > 0'),
  unitCost: z.number().int().min(0, 'Giá nhập ≥ 0'),
  note: z.string().trim().max(500).optional(),
})

export const recordManualAdjustInputSchema = z.object({
  variantId: z.string().uuid().nullable().optional(),
  delta: z
    .number()
    .int('Delta phải là số nguyên')
    .refine((v) => v !== 0, 'Delta phải khác 0'),
  reason: z.string().trim().min(1, 'Lý do bắt buộc').max(255, 'Lý do tối đa 255 ký tự'),
  note: z.string().trim().max(500).optional(),
})

export const listInventoryTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export type InventoryTransactionType = z.infer<typeof inventoryTransactionTypeSchema>
export type InventoryTransactionItem = z.infer<typeof inventoryTransactionItemSchema>
export type RecordPurchaseInput = z.infer<typeof recordPurchaseInputSchema>
export type RecordManualAdjustInput = z.infer<typeof recordManualAdjustInputSchema>
export type ListInventoryTransactionsQuery = z.infer<typeof listInventoryTransactionsQuerySchema>

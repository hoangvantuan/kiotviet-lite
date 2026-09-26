import { z } from 'zod'

import { documentShiftIdSchema, moneyMethodSchema, refundMethodSchema } from './cash-management.js'
import { positiveQuantitySchema } from './quantity-input.js'

export const purchaseReturnItemInputSchema = z
  .object({
    purchaseOrderItemId: z.string().uuid('Dòng phiếu nhập không hợp lệ'),
    // Theo đơn vị ghi trên dòng phiếu nhập gốc
    quantity: positiveQuantitySchema('Số lượng trả'),
  })
  .strict()

export const createPurchaseReturnSchema = z
  .object({
    items: z
      .array(purchaseReturnItemInputSchema)
      .min(1, 'Cần ít nhất một dòng hàng trả')
      .max(200, 'Tối đa 200 dòng trong một phiếu trả'),
    note: z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự').optional(),
    // BC-06: kênh NCC hoàn phần tiền (khi trả vượt số còn nợ) và ca nhận tiền; mặc định tiền mặt
    refundMethod: refundMethodSchema.optional(),
    shiftId: documentShiftIdSchema,
  })
  .strict()
  .refine((d) => new Set(d.items.map((i) => i.purchaseOrderItemId)).size === d.items.length, {
    message: 'Không được trả trùng một dòng phiếu nhập',
    path: ['items'],
  })

export const purchaseReturnItemSchema = z.object({
  id: z.string().uuid(),
  purchaseOrderItemId: z.string().uuid(),
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable(),
  productNameSnapshot: z.string(),
  variantLabelSnapshot: z.string().nullable(),
  unitName: z.string().nullable(),
  quantity: z.number(),
  conversionFactor: z.number().int(),
  baseQuantity: z.number(),
  lineTotal: z.number(),
})

export const purchaseReturnSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  purchaseOrderId: z.string().uuid(),
  supplierId: z.string().uuid(),
  totalAmount: z.number(),
  debtReductionAmount: z.number(),
  supplierRefundAmount: z.number(),
  /** BC-06: kênh NCC hoàn tiền; null khi không có tiền hoàn hoặc phiếu lập trước thay đổi này */
  refundMethod: moneyMethodSchema.nullable(),
  note: z.string().nullable(),
  createdBy: z.string().uuid(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
  items: z.array(purchaseReturnItemSchema),
})

export type PurchaseReturnItemInput = z.infer<typeof purchaseReturnItemInputSchema>
export type CreatePurchaseReturnInput = z.infer<typeof createPurchaseReturnSchema>
export type PurchaseReturnItem = z.infer<typeof purchaseReturnItemSchema>
export type PurchaseReturn = z.infer<typeof purchaseReturnSchema>

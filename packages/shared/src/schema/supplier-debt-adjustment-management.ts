import { z } from 'zod'

export const createSupplierDebtAdjustmentSchema = z
  .object({
    supplierId: z.string().uuid({ message: 'Vui lòng chọn nhà cung cấp' }),
    newAmount: z
      .number()
      .int('Số tiền phải là số nguyên')
      .min(0, 'Số nợ mới không được âm')
      .max(99_999_999_999_999, 'Số tiền vượt giới hạn'),
    reason: z
      .string()
      .trim()
      .min(1, 'Vui lòng nhập lý do điều chỉnh')
      .max(500, 'Lý do tối đa 500 ký tự'),
  })
  .strict()

export const listSupplierDebtAdjustmentsQuerySchema = z.object({
  supplierId: z.string().uuid(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const supplierDebtAdjustmentListItemSchema = z.object({
  id: z.string().uuid(),
  supplierId: z.string().uuid(),
  oldAmount: z.number().int(),
  newAmount: z.number().int(),
  reason: z.string(),
  type: z.enum(['adjustment', 'opening']),
  incurredAt: z.string().nullable(),
  adjustedBy: z.string().uuid(),
  adjustedByName: z.string().nullable(),
  createdAt: z.string(),
})

export const supplierDebtAdjustmentDetailSchema = supplierDebtAdjustmentListItemSchema.extend({
  supplierName: z.string().nullable(),
})

export type CreateSupplierDebtAdjustmentInput = z.infer<typeof createSupplierDebtAdjustmentSchema>
export type ListSupplierDebtAdjustmentsQuery = z.infer<
  typeof listSupplierDebtAdjustmentsQuerySchema
>
export type SupplierDebtAdjustmentListItem = z.infer<typeof supplierDebtAdjustmentListItemSchema>
export type SupplierDebtAdjustmentDetail = z.infer<typeof supplierDebtAdjustmentDetailSchema>

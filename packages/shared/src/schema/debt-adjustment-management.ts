import { z } from 'zod'

export const createDebtAdjustmentSchema = z
  .object({
    customerId: z.string().uuid({ message: 'Vui lòng chọn khách hàng' }),
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

export const listDebtAdjustmentsQuerySchema = z.object({
  customerId: z.string().uuid(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const debtAdjustmentListItemSchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  oldAmount: z.number().int(),
  newAmount: z.number().int(),
  reason: z.string(),
  adjustedBy: z.string().uuid(),
  adjustedByName: z.string().nullable(),
  createdAt: z.string(),
})

export const debtAdjustmentDetailSchema = debtAdjustmentListItemSchema.extend({
  customerName: z.string().nullable(),
})

export type CreateDebtAdjustmentInput = z.infer<typeof createDebtAdjustmentSchema>
export type ListDebtAdjustmentsQuery = z.infer<typeof listDebtAdjustmentsQuerySchema>
export type DebtAdjustmentListItem = z.infer<typeof debtAdjustmentListItemSchema>
export type DebtAdjustmentDetail = z.infer<typeof debtAdjustmentDetailSchema>

import { z } from 'zod'

import {
  adjustmentReasonSchema,
  debtAdjustmentDirectionSchema,
  expectedCurrentDebtSchema,
} from './debt-adjustment-management.js'

// Phía NCC chỉ giữ một tổng (ADR-0003), nhưng cùng hợp đồng tăng/giảm kèm số cũ (TIEN-102)
export const createSupplierDebtAdjustmentSchema = z
  .object({
    supplierId: z.string().uuid({ message: 'Vui lòng chọn nhà cung cấp' }),
    direction: debtAdjustmentDirectionSchema,
    amount: z
      .number({ required_error: 'Vui lòng nhập số tiền điều chỉnh' })
      .int('Số tiền phải là số nguyên')
      .min(1, 'Số tiền điều chỉnh phải lớn hơn 0')
      .max(99_999_999_999_999, 'Số tiền vượt giới hạn'),
    expectedCurrentDebt: expectedCurrentDebtSchema,
    reason: adjustmentReasonSchema,
  })
  .strict()
  .refine((v) => v.direction === 'increase' || v.amount <= v.expectedCurrentDebt, {
    message: 'Số tiền giảm không được lớn hơn số nợ hiện tại',
    path: ['amount'],
  })

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

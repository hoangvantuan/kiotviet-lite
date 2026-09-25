import { z } from 'zod'

// TIEN-102: điều chỉnh là một bút toán tăng/giảm theo số chênh lệch, kèm số nợ máy khách đang
// thấy. Máy chủ từ chối (409) khi công nợ đã đổi, thay vì ghi đè bằng một số tuyệt đối.
export const debtAdjustmentDirectionSchema = z.enum(['increase', 'decrease'], {
  errorMap: () => ({ message: 'Vui lòng chọn tăng nợ hoặc giảm nợ' }),
})

const adjustmentAmountSchema = z
  .number({ required_error: 'Vui lòng nhập số tiền điều chỉnh' })
  .int('Số tiền phải là số nguyên')
  .min(1, 'Số tiền điều chỉnh phải lớn hơn 0')
  .max(99_999_999_999_999, 'Số tiền vượt giới hạn')

// Âm khi khách còn tiền trả trước (ADR-0011)
export const expectedCurrentDebtSchema = z
  .number({ required_error: 'Thiếu số nợ hiện tại, vui lòng tải lại' })
  .int()
  .min(-99_999_999_999_999)
  .max(99_999_999_999_999)

export const adjustmentReasonSchema = z
  .string()
  .trim()
  .min(1, 'Vui lòng nhập lý do điều chỉnh')
  .max(500, 'Lý do tối đa 500 ký tự')

export const createDebtAdjustmentSchema = z
  .object({
    customerId: z.string().uuid({ message: 'Vui lòng chọn khách hàng' }),
    direction: debtAdjustmentDirectionSchema,
    amount: adjustmentAmountSchema,
    expectedCurrentDebt: expectedCurrentDebtSchema,
    reason: adjustmentReasonSchema,
  })
  .strict()
  .refine((v) => v.direction === 'increase' || v.amount <= v.expectedCurrentDebt, {
    message: 'Số tiền giảm không được lớn hơn số nợ hiện tại',
    path: ['amount'],
  })

/** Số nợ sau điều chỉnh, dùng chung cho xem trước ở giao diện và cho máy chủ. */
export function applyDebtAdjustment(
  currentDebt: number,
  direction: DebtAdjustmentDirection,
  amount: number,
): number {
  return direction === 'increase' ? currentDebt + amount : currentDebt - amount
}

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

export type DebtAdjustmentDirection = z.infer<typeof debtAdjustmentDirectionSchema>
export type CreateDebtAdjustmentInput = z.infer<typeof createDebtAdjustmentSchema>
export type ListDebtAdjustmentsQuery = z.infer<typeof listDebtAdjustmentsQuerySchema>
export type DebtAdjustmentListItem = z.infer<typeof debtAdjustmentListItemSchema>
export type DebtAdjustmentDetail = z.infer<typeof debtAdjustmentDetailSchema>

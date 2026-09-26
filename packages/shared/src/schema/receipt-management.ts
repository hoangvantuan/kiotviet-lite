import { z } from 'zod'

import { documentStatusSchema } from './document-cancel.js'
import { moneyMethodInput, moneyMethodSchema } from './cash-management.js'
import { dateFilterSchema, paginationSchema } from './pagination.js'

export const allocationInputSchema = z
  .object({
    debtId: z.string().uuid('ID khoản nợ không hợp lệ'),
    amount: z
      .number({ required_error: 'Vui lòng nhập số tiền phân bổ' })
      .int('Số tiền phải là số nguyên')
      .min(1, 'Số tiền phân bổ phải lớn hơn 0'),
  })
  .strict()

export const createReceiptSchema = z
  .object({
    customerId: z.string().uuid({ message: 'Vui lòng chọn khách hàng' }),
    amount: z
      .number({ required_error: 'Vui lòng nhập số tiền' })
      .int('Số tiền phải là số nguyên')
      .min(1, 'Số tiền phải lớn hơn 0')
      .max(99_999_999_999_999, 'Số tiền vượt giới hạn'),
    // TIEN-05: phương thức nhận tiền, bắt buộc để đối soát quỹ tiền mặt và tài khoản ngân hàng
    paymentMethod: moneyMethodInput('Vui lòng chọn phương thức nhận tiền'),
    note: z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự').nullable().optional(),
    allocationMode: z.enum(['fifo', 'manual']),
    allocations: z.array(allocationInputSchema).min(1, 'Cần ít nhất một khoản phân bổ'),
  })
  .strict()
  .refine((data) => data.allocations.reduce((sum, a) => sum + a.amount, 0) === data.amount, {
    message: 'Tổng phân bổ phải bằng số tiền thu',
    path: ['allocations'],
  })
  .refine(
    (data) => {
      const ids = data.allocations.map((a) => a.debtId)
      return new Set(ids).size === ids.length
    },
    {
      message: 'Không được phân bổ trùng khoản nợ',
      path: ['allocations'],
    },
  )

export const listReceiptsQuerySchema = paginationSchema
  .extend({
    customerId: z.string().uuid().optional(),
    fromDate: dateFilterSchema.optional(),
    toDate: dateFilterSchema.optional(),
    search: z.string().trim().max(200).optional(),
  })
  .refine(
    (data) => {
      if (data.fromDate && data.toDate) {
        return new Date(data.toDate) >= new Date(data.fromDate)
      }
      return true
    },
    {
      message: 'Ngày kết thúc phải sau ngày bắt đầu',
      path: ['toDate'],
    },
  )

export const customerDebtTypeSchema = z.enum(['sale', 'opening', 'adjustment'])

/**
 * Tên khoản nợ hiện cho người dùng: đơn bán ghi mã đơn, nợ đầu kỳ và khoản điều chỉnh tăng nợ
 * ghi rõ loại. Dùng chung cho sổ công nợ, lập phiếu thu, chi tiết và bản in phiếu thu.
 */
export function debtSourceLabel(debt: {
  type: z.infer<typeof customerDebtTypeSchema>
  orderCode: string | null
}): string {
  if (debt.orderCode) return debt.orderCode
  return debt.type === 'adjustment' ? 'Điều chỉnh tăng nợ' : 'Nợ đầu kỳ'
}

export const openDebtItemSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid().nullable(),
  orderCode: z.string().nullable(),
  type: customerDebtTypeSchema,
  amount: z.number().int(),
  paid: z.number().int(),
  remaining: z.number().int(),
  createdAt: z.string(),
})

export const customerOpenDebtsResponseSchema = z.object({
  customerId: z.string().uuid(),
  customerName: z.string(),
  customerPhone: z.string().nullable(),
  totalRemaining: z.number().int(),
  items: z.array(openDebtItemSchema),
})

export const receiptAllocationItemSchema = z.object({
  id: z.string().uuid(),
  debtId: z.string().uuid(),
  orderId: z.string().uuid().nullable(),
  orderCode: z.string().nullable(),
  type: customerDebtTypeSchema,
  amount: z.number().int(),
  debtRemainingAfter: z.number().int().nullable(),
})

export const receiptListItemSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  paymentMethod: moneyMethodSchema.nullable(),
  customerId: z.string().uuid(),
  customerName: z.string().nullable(),
  customerCode: z.string().nullable(),
  customerPhone: z.string().nullable(),
  amount: z.number(),
  note: z.string().nullable(),
  allocationCount: z.number().int(),
  status: documentStatusSchema,
  cancelledAt: z.string().nullable(),
  cancelledBy: z.string().uuid().nullable(),
  cancelledByName: z.string().nullable(),
  cancelReason: z.string().nullable(),
  createdBy: z.string().uuid(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
})

export const receiptDetailSchema = receiptListItemSchema.extend({
  debtAfter: z.number().nullable(),
  allocations: z.array(receiptAllocationItemSchema),
})

export type AllocationInput = z.infer<typeof allocationInputSchema>
export type CreateReceiptInput = z.infer<typeof createReceiptSchema>
export type ListReceiptsQuery = z.infer<typeof listReceiptsQuerySchema>
export type OpenDebtItem = z.infer<typeof openDebtItemSchema>
export type CustomerOpenDebtsResponse = z.infer<typeof customerOpenDebtsResponseSchema>
export type ReceiptAllocationItem = z.infer<typeof receiptAllocationItemSchema>
export type ReceiptListItem = z.infer<typeof receiptListItemSchema>
export type ReceiptDetail = z.infer<typeof receiptDetailSchema>

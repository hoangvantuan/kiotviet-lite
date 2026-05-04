import { z } from 'zod'

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

export const listReceiptsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    customerId: z.string().uuid().optional(),
    fromDate: z.string().datetime().optional(),
    toDate: z.string().datetime().optional(),
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

export const openDebtItemSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  orderCode: z.string(),
  amount: z.number().int(),
  paid: z.number().int(),
  remaining: z.number().int(),
  createdAt: z.string(),
})

export const customerOpenDebtsResponseSchema = z.object({
  customerId: z.string().uuid(),
  customerName: z.string(),
  customerPhone: z.string(),
  totalRemaining: z.number().int(),
  items: z.array(openDebtItemSchema),
})

export const receiptAllocationItemSchema = z.object({
  id: z.string().uuid(),
  debtId: z.string().uuid(),
  orderId: z.string().uuid(),
  orderCode: z.string(),
  amount: z.number().int(),
  debtRemainingAfter: z.number().int().nullable(),
})

export const receiptListItemSchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  customerName: z.string().nullable(),
  customerPhone: z.string().nullable(),
  amount: z.number(),
  note: z.string().nullable(),
  allocationCount: z.number().int(),
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

import { z } from 'zod'

export const createSupplierPaymentSchema = z
  .object({
    supplierId: z.string().uuid({ message: 'Vui lòng chọn nhà cung cấp' }),
    amount: z
      .number({ required_error: 'Vui lòng nhập số tiền' })
      .int('Số tiền phải là số nguyên')
      .min(1, 'Số tiền phải lớn hơn 0')
      .max(99_999_999_999_999, 'Số tiền vượt giới hạn'),
    note: z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự').nullable().optional(),
  })
  .strict()

export const listSupplierPaymentsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    supplierId: z.string().uuid().optional(),
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

export const supplierPaymentListItemSchema = z.object({
  id: z.string().uuid(),
  supplierId: z.string().uuid(),
  supplierName: z.string().nullable(),
  supplierPhone: z.string().nullable(),
  amount: z.number(),
  note: z.string().nullable(),
  createdBy: z.string().uuid(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
})

export const supplierPaymentDetailSchema = supplierPaymentListItemSchema.extend({
  debtAfter: z.number().nullable(),
})

export type CreateSupplierPaymentInput = z.infer<typeof createSupplierPaymentSchema>
export type ListSupplierPaymentsQuery = z.infer<typeof listSupplierPaymentsQuerySchema>
export type SupplierPaymentListItem = z.infer<typeof supplierPaymentListItemSchema>
export type SupplierPaymentDetail = z.infer<typeof supplierPaymentDetailSchema>

import { z } from 'zod'

// Response cho GET /api/v1/pos/customer-debt/:customerId
export const debtInfoSchema = z.object({
  customerId: z.string().uuid(),
  customerName: z.string(),
  groupId: z.string().uuid().nullable(),
  groupName: z.string().nullable(),
  // Âm khi khách còn tiền trả trước (ADR-0010)
  currentDebt: z.number().int(),
  customerDebtLimit: z.number().int().min(0).nullable(),
  groupDebtLimit: z.number().int().min(0).nullable(),
  effectiveDebtLimit: z.number().int().min(0).nullable(),
})

// Response item cho debt record
export const debtItemSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid().nullable(),
  customerId: z.string().uuid(),
  type: z.enum(['sale', 'opening', 'adjustment']),
  // Nợ đầu kỳ âm (tiền khách trả trước) có amount, paid, remaining âm (ADR-0010)
  amount: z.number().int(),
  paid: z.number().int(),
  remaining: z.number().int(),
  createdAt: z.string(),
})

const MAX_OPENING_DEBT = 99_999_999_999_999

// Ô số để trống hay nhập sai đến đây thành null: invalid_type_error để thông báo vẫn là tiếng Việt (GL-09)
const openingAmount = () =>
  z
    .number({
      required_error: 'Vui lòng nhập số tiền',
      invalid_type_error: 'Vui lòng nhập số tiền',
    })
    .int('Số tiền phải là số nguyên')

const incurredAtSchema = z
  .string({
    required_error: 'Vui lòng chọn ngày phát sinh',
    invalid_type_error: 'Vui lòng chọn ngày phát sinh',
  })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phát sinh không hợp lệ')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  }, 'Ngày phát sinh không hợp lệ')

// Nợ đầu kỳ nhà cung cấp: chỉ số dương
export const createOpeningDebtSchema = z
  .object({
    amount: openingAmount()
      .min(1, 'Số tiền phải lớn hơn 0')
      .max(MAX_OPENING_DEBT, 'Số tiền vượt giới hạn'),
    incurredAt: incurredAtSchema,
  })
  .strict()

// Nợ đầu kỳ khách hàng: số âm là tiền khách trả trước (ADR-0010)
export const createCustomerOpeningDebtSchema = z
  .object({
    amount: openingAmount()
      .min(-MAX_OPENING_DEBT, 'Số tiền vượt giới hạn')
      .max(MAX_OPENING_DEBT, 'Số tiền vượt giới hạn')
      .refine((value) => value !== 0, 'Số tiền phải khác 0'),
    incurredAt: incurredAtSchema,
  })
  .strict()

export const openingDebtSchema = z.object({
  id: z.string().uuid(),
  orderId: z.null(),
  type: z.literal('opening'),
  amount: z.number().int(),
  remaining: z.number().int(),
  incurredAt: z.string(),
})

export type CreateOpeningDebtInput = z.infer<typeof createOpeningDebtSchema>
export type CreateCustomerOpeningDebtInput = z.infer<typeof createCustomerOpeningDebtSchema>
export type OpeningDebt = z.infer<typeof openingDebtSchema>

export type DebtInfo = z.infer<typeof debtInfoSchema>
export type DebtItem = z.infer<typeof debtItemSchema>

import { z } from 'zod'

// Response cho GET /api/v1/pos/customer-debt/:customerId
export const debtInfoSchema = z.object({
  customerId: z.string().uuid(),
  customerName: z.string(),
  groupId: z.string().uuid().nullable(),
  groupName: z.string().nullable(),
  currentDebt: z.number().int().min(0),
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
  amount: z.number().int().min(0),
  paid: z.number().int().min(0),
  remaining: z.number().int().min(0),
  createdAt: z.string(),
})

export const createOpeningDebtSchema = z
  .object({
    amount: z
      .number({ required_error: 'Vui lòng nhập số tiền' })
      .int('Số tiền phải là số nguyên')
      .min(1, 'Số tiền phải lớn hơn 0')
      .max(99_999_999_999_999, 'Số tiền vượt giới hạn'),
    incurredAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phát sinh không hợp lệ')
      .refine((value) => {
        const date = new Date(`${value}T00:00:00Z`)
        return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
      }, 'Ngày phát sinh không hợp lệ'),
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
export type OpeningDebt = z.infer<typeof openingDebtSchema>

export type DebtInfo = z.infer<typeof debtInfoSchema>
export type DebtItem = z.infer<typeof debtItemSchema>

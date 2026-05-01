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
  orderId: z.string().uuid(),
  customerId: z.string().uuid(),
  amount: z.number().int().min(0),
  paid: z.number().int().min(0),
  remaining: z.number().int().min(0),
  createdAt: z.string(),
})

export type DebtInfo = z.infer<typeof debtInfoSchema>
export type DebtItem = z.infer<typeof debtItemSchema>

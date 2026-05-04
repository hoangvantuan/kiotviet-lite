import { z } from 'zod'

export const debtAgingQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
})

export const debtAgingRowSchema = z.object({
  customerId: z.string().uuid(),
  customerName: z.string(),
  customerPhone: z.string().nullable(),
  debtLimit: z.number().nullable(),
  totalDebt: z.number(),
  buckets: z.array(z.number()),
})

export const debtAgingReportSchema = z.object({
  rows: z.array(debtAgingRowSchema),
  totals: z.object({
    totalDebt: z.number(),
    buckets: z.array(z.number()),
  }),
  bucketLabels: z.array(z.string()),
})

export const debtSummaryQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
})

export const debtSummaryReportSchema = z.object({
  receivable: z.object({
    totalDebt: z.number(),
    customerCount: z.number().int(),
    totalCollected: z.number(),
    receiptCount: z.number().int(),
  }),
  payable: z.object({
    totalDebt: z.number(),
    supplierCount: z.number().int(),
    totalPaid: z.number(),
    paymentCount: z.number().int(),
  }),
  cashFlow: z.object({
    totalIn: z.number(),
    totalOut: z.number(),
    net: z.number(),
  }),
  period: z.object({
    from: z.string(),
    to: z.string(),
  }),
})

export type DebtAgingQuery = z.infer<typeof debtAgingQuerySchema>
export type DebtAgingRow = z.infer<typeof debtAgingRowSchema>
export type DebtAgingReport = z.infer<typeof debtAgingReportSchema>
export type DebtSummaryQuery = z.infer<typeof debtSummaryQuerySchema>
export type DebtSummaryReport = z.infer<typeof debtSummaryReportSchema>

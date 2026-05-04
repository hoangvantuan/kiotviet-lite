import { z } from 'zod'

export const dashboardPeriodSchema = z.enum(['today', 'week', 'month', 'year'])
export type DashboardPeriod = z.infer<typeof dashboardPeriodSchema>

export const dashboardQuerySchema = z.object({
  period: dashboardPeriodSchema.default('today'),
})

export const dashboardMetricSchema = z.object({
  value: z.number().int(),
  previousValue: z.number().int(),
  trend: z.number().nullable(),
  sparkline: z.array(z.number().int()).length(7),
})

export const dashboardMetricsSchema = z.object({
  revenue: dashboardMetricSchema,
  profit: dashboardMetricSchema,
  orderCount: dashboardMetricSchema,
  avgOrderValue: dashboardMetricSchema,
})

export const revenueChartItemSchema = z.object({
  date: z.string(),
  label: z.string(),
  revenue: z.number().int(),
  orderCount: z.number().int(),
})

export const topProductSchema = z.object({
  productId: z.string().uuid(),
  name: z.string(),
  quantity: z.number().int(),
  revenue: z.number().int(),
  percentage: z.number(),
})

export const lowStockAlertSchema = z.object({
  productId: z.string().uuid(),
  name: z.string(),
  currentStock: z.number().int(),
  minStock: z.number().int(),
  status: z.enum(['out', 'low']),
})

export const overdueDebtSchema = z.object({
  customerId: z.string().uuid(),
  name: z.string(),
  totalDebt: z.number().int(),
  maxOverdueDays: z.number().int(),
})

export const dashboardResponseSchema = z.object({
  metrics: dashboardMetricsSchema,
  revenueChart: z.array(revenueChartItemSchema),
  topProducts: z.array(topProductSchema).max(5),
  lowStockAlerts: z.array(lowStockAlertSchema).max(5),
  overdueDebts: z.array(overdueDebtSchema).max(5),
})

export type DashboardMetric = z.infer<typeof dashboardMetricSchema>
export type DashboardMetrics = z.infer<typeof dashboardMetricsSchema>
export type RevenueChartItem = z.infer<typeof revenueChartItemSchema>
export type TopProduct = z.infer<typeof topProductSchema>
export type LowStockAlert = z.infer<typeof lowStockAlertSchema>
export type OverdueDebt = z.infer<typeof overdueDebtSchema>
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>

import { z } from 'zod'

export const reportDateRangeSchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
})

export const revenueReportTabSchema = z.enum(['time', 'product', 'customer', 'employee'])
export type RevenueReportTab = z.infer<typeof revenueReportTabSchema>

export const revenueGroupBySchema = z.enum(['day', 'week', 'month'])
export type RevenueGroupBy = z.infer<typeof revenueGroupBySchema>

export const revenueReportQuerySchema = z.object({
  tab: revenueReportTabSchema.default('time'),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  groupBy: revenueGroupBySchema.default('day'),
})
export type RevenueReportQuery = z.infer<typeof revenueReportQuerySchema>

export const profitReportQuerySchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
})
export type ProfitReportQuery = z.infer<typeof profitReportQuerySchema>

export const inventoryReportTabSchema = z.enum(['current', 'reorder', 'slow'])
export type InventoryReportTab = z.infer<typeof inventoryReportTabSchema>

export const inventoryReportQuerySchema = z.object({
  tab: inventoryReportTabSchema.default('current'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})
export type InventoryReportQuery = z.infer<typeof inventoryReportQuerySchema>

export const pricingReportTabSchema = z.enum(['overrides', 'comparison', 'history'])
export type PricingReportTab = z.infer<typeof pricingReportTabSchema>

export const pricingReportQuerySchema = z.object({
  tab: pricingReportTabSchema.default('overrides'),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  productId: z.string().uuid().optional(),
})
export type PricingReportQuery = z.infer<typeof pricingReportQuerySchema>

export const exportFormatSchema = z.enum(['csv', 'xlsx'])
export type ExportFormat = z.infer<typeof exportFormatSchema>

export const exportQuerySchema = z.object({
  format: exportFormatSchema,
})

// Revenue report response types
export const revenueByTimeRowSchema = z.object({
  date: z.string(),
  label: z.string(),
  orderCount: z.number().int(),
  revenue: z.number().int(),
  previousRevenue: z.number().int().nullable(),
  trend: z.number().nullable(),
})
export type RevenueByTimeRow = z.infer<typeof revenueByTimeRowSchema>

export const revenueByProductRowSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  sku: z.string(),
  quantity: z.number().int(),
  revenue: z.number().int(),
  percentage: z.number(),
})
export type RevenueByProductRow = z.infer<typeof revenueByProductRowSchema>

export const revenueByCustomerRowSchema = z.object({
  customerId: z.string().uuid().nullable(),
  customerName: z.string(),
  phone: z.string().nullable(),
  orderCount: z.number().int(),
  revenue: z.number().int(),
  currentDebt: z.number().int(),
})
export type RevenueByCustomerRow = z.infer<typeof revenueByCustomerRowSchema>

export const revenueByEmployeeRowSchema = z.object({
  userId: z.string().uuid(),
  userName: z.string(),
  orderCount: z.number().int(),
  revenue: z.number().int(),
  percentage: z.number(),
})
export type RevenueByEmployeeRow = z.infer<typeof revenueByEmployeeRowSchema>

export const revenueSummarySchema = z.object({
  totalOrders: z.number().int(),
  totalRevenue: z.number().int(),
})

export interface RevenueByTimeResponse {
  rows: RevenueByTimeRow[]
  summary: { totalOrders: number; totalRevenue: number; avgDaily: number }
}

export interface RevenueByProductResponse {
  rows: RevenueByProductRow[]
  summary: { totalProducts: number; totalQuantity: number; totalRevenue: number }
}

export interface RevenueByCustomerResponse {
  rows: RevenueByCustomerRow[]
  summary: { totalCustomers: number; totalRevenue: number }
}

export interface RevenueByEmployeeResponse {
  rows: RevenueByEmployeeRow[]
  summary: { totalEmployees: number; totalRevenue: number }
}

export type RevenueReportResponse =
  | RevenueByTimeResponse
  | RevenueByProductResponse
  | RevenueByCustomerResponse
  | RevenueByEmployeeResponse

// Profit report response types
export const profitRowSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  sku: z.string(),
  quantity: z.number().int(),
  revenue: z.number().int(),
  cogs: z.number().int(),
  profit: z.number().int(),
  marginPercent: z.number(),
  isLoss: z.boolean(),
})
export type ProfitRow = z.infer<typeof profitRowSchema>

export interface ProfitReportResponse {
  summary: {
    totalRevenue: number
    totalCogs: number
    grossProfit: number
    marginPercent: number
  }
  rows: ProfitRow[]
}

// Inventory report response types
export const inventoryCurrentRowSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  sku: z.string(),
  currentStock: z.number().int(),
  costPrice: z.number().int(),
  stockValue: z.number().int(),
})
export type InventoryCurrentRow = z.infer<typeof inventoryCurrentRowSchema>

export const inventoryReorderRowSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  sku: z.string(),
  currentStock: z.number().int(),
  minStock: z.number().int(),
  reorderQuantity: z.number().int(),
})
export type InventoryReorderRow = z.infer<typeof inventoryReorderRowSchema>

export const inventorySlowRowSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  sku: z.string(),
  currentStock: z.number().int(),
  lastSoldDate: z.string().nullable(),
  daysSinceLastSold: z.number().int(),
})
export type InventorySlowRow = z.infer<typeof inventorySlowRowSchema>

export interface InventoryReportPaginationMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface InventoryCurrentResponse {
  rows: InventoryCurrentRow[]
  summary: { totalProducts: number; totalStockValue: number }
  pagination: InventoryReportPaginationMeta
}

export interface InventoryReorderResponse {
  rows: InventoryReorderRow[]
  pagination: InventoryReportPaginationMeta
}

export interface InventorySlowResponse {
  rows: InventorySlowRow[]
  pagination: InventoryReportPaginationMeta
}

export type InventoryReportResponse =
  | InventoryCurrentResponse
  | InventoryReorderResponse
  | InventorySlowResponse

// Pricing report response types
export const priceOverrideRowSchema = z.object({
  orderId: z.string().uuid(),
  orderNumber: z.string(),
  orderDate: z.string(),
  productName: z.string(),
  originalPrice: z.number().int(),
  overridePrice: z.number().int(),
  difference: z.number().int(),
  userName: z.string(),
  reason: z.string().nullable(),
})
export type PriceOverrideRow = z.infer<typeof priceOverrideRowSchema>

export const priceComparisonRowSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  sku: z.string(),
  costPrice: z.number().int(),
  prices: z.array(z.number().int().nullable()),
  margins: z.array(z.number().nullable()),
})
export type PriceComparisonRow = z.infer<typeof priceComparisonRowSchema>

export const priceHistoryRowSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  purchaseDate: z.string(),
  supplierName: z.string(),
  unitPrice: z.number().int(),
  costAfter: z.number().int().nullable(),
})
export type PriceHistoryRow = z.infer<typeof priceHistoryRowSchema>

export interface PriceOverridesResponse {
  rows: PriceOverrideRow[]
}

export interface PriceComparisonResponse {
  priceLists: string[]
  rows: PriceComparisonRow[]
}

export interface PriceHistoryResponse {
  rows: PriceHistoryRow[]
}

export type PricingReportResponse =
  | PriceOverridesResponse
  | PriceComparisonResponse
  | PriceHistoryResponse

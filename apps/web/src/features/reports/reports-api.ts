import type {
  DashboardPeriod,
  DashboardResponse,
  DebtAgingReport,
  DebtSummaryReport,
  ExportFormat,
  InventoryReportResponse,
  InventoryReportTab,
  PricingReportResponse,
  PricingReportTab,
  ProfitReportResponse,
  RevenueGroupBy,
  RevenueReportResponse,
  RevenueReportTab,
} from '@kiotviet-lite/shared'

import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/stores/use-auth-store'

interface ApiEnvelope<T> {
  data: T
}

export interface ReportDateQuery {
  from?: string
  to?: string
}

function buildQs(query: ReportDateQuery): string {
  const params = new URLSearchParams()
  if (query.from) params.set('from', query.from)
  if (query.to) params.set('to', query.to)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export async function getDashboardApi(period: DashboardPeriod) {
  const params = new URLSearchParams()
  params.set('period', period)
  return apiClient.get<ApiEnvelope<DashboardResponse>>(
    `/api/v1/reports/dashboard?${params.toString()}`,
  )
}

export async function getDebtAgingReportApi(query: ReportDateQuery) {
  return apiClient.get<ApiEnvelope<DebtAgingReport>>(`/api/v1/reports/debt-aging${buildQs(query)}`)
}

export async function getDebtSummaryReportApi(query: ReportDateQuery) {
  return apiClient.get<ApiEnvelope<DebtSummaryReport>>(
    `/api/v1/reports/debt-summary${buildQs(query)}`,
  )
}

export interface RevenueReportQueryParams extends ReportDateQuery {
  tab?: RevenueReportTab
  groupBy?: RevenueGroupBy
}

export interface PricingReportQueryParams extends ReportDateQuery {
  tab?: PricingReportTab
  productId?: string
}

export async function getRevenueReportApi(query: RevenueReportQueryParams) {
  const params = new URLSearchParams()
  if (query.tab) params.set('tab', query.tab)
  if (query.from) params.set('from', query.from)
  if (query.to) params.set('to', query.to)
  if (query.groupBy) params.set('groupBy', query.groupBy)
  const qs = params.toString()
  return apiClient.get<ApiEnvelope<RevenueReportResponse>>(
    `/api/v1/reports/revenue${qs ? `?${qs}` : ''}`,
  )
}

export async function getProfitReportApi(query: ReportDateQuery) {
  return apiClient.get<ApiEnvelope<ProfitReportResponse>>(`/api/v1/reports/profit${buildQs(query)}`)
}

export async function getInventoryReportApi(tab: InventoryReportTab) {
  return apiClient.get<ApiEnvelope<InventoryReportResponse>>(`/api/v1/reports/inventory?tab=${tab}`)
}

export async function getPricingReportApi(query: PricingReportQueryParams) {
  const params = new URLSearchParams()
  if (query.tab) params.set('tab', query.tab)
  if (query.from) params.set('from', query.from)
  if (query.to) params.set('to', query.to)
  if (query.productId) params.set('productId', query.productId)
  const qs = params.toString()
  return apiClient.get<ApiEnvelope<PricingReportResponse>>(
    `/api/v1/reports/pricing${qs ? `?${qs}` : ''}`,
  )
}

const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000'

export async function downloadReportExport(
  type: string,
  format: ExportFormat,
  params: Record<string, string | undefined>,
) {
  const token = useAuthStore.getState().accessToken
  const searchParams = new URLSearchParams()
  searchParams.set('format', format)
  for (const [k, v] of Object.entries(params)) {
    if (v) searchParams.set(k, v)
  }
  const res = await fetch(
    `${API_BASE_URL}/api/v1/reports/${type}/export?${searchParams.toString()}`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    },
  )
  if (!res.ok) throw new Error('Tải file thất bại')
  const blob = await res.blob()
  const disposition = res.headers.get('Content-Disposition') ?? ''
  const match = disposition.match(/filename="(.+)"/)
  const filename = match?.[1] ?? `report.${format}`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function downloadCsv(path: string, query: ReportDateQuery, filename: string) {
  const token = useAuthStore.getState().accessToken
  const res = await fetch(`${API_BASE_URL}${path}${buildQs(query)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Tải CSV thất bại')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

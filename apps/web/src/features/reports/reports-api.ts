import type { DebtAgingReport, DebtSummaryReport } from '@kiotviet-lite/shared'

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

export async function getDebtAgingReportApi(query: ReportDateQuery) {
  return apiClient.get<ApiEnvelope<DebtAgingReport>>(
    `/api/v1/reports/debt-aging${buildQs(query)}`,
  )
}

export async function getDebtSummaryReportApi(query: ReportDateQuery) {
  return apiClient.get<ApiEnvelope<DebtSummaryReport>>(
    `/api/v1/reports/debt-summary${buildQs(query)}`,
  )
}

const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000'

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

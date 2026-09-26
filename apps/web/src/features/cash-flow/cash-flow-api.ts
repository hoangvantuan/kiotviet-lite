import type { CashFlowReport, CashFlowReportQuery } from '@kiotviet-lite/shared'

import { apiClient } from '@/lib/api-client'

export function getCashFlowReportApi(query: CashFlowReportQuery) {
  const params = new URLSearchParams({ from: query.from, to: query.to })
  return apiClient.get<{ data: CashFlowReport }>(`/api/v1/cash-reports/cash-flow?${params}`)
}

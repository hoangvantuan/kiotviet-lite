import { useQuery } from '@tanstack/react-query'

import {
  getDebtAgingReportApi,
  getDebtSummaryReportApi,
  type ReportDateQuery,
} from '../reports-api'

export function useDebtAgingReport(query: ReportDateQuery) {
  return useQuery({
    queryKey: ['reports', 'debt-aging', query],
    queryFn: async () => (await getDebtAgingReportApi(query)).data,
  })
}

export function useDebtSummaryReport(query: ReportDateQuery) {
  return useQuery({
    queryKey: ['reports', 'debt-summary', query],
    queryFn: async () => (await getDebtSummaryReportApi(query)).data,
  })
}

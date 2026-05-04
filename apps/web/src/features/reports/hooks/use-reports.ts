import { useQuery, useQueryClient } from '@tanstack/react-query'

import type { DashboardPeriod } from '@kiotviet-lite/shared'

import {
  getDashboardApi,
  getDebtAgingReportApi,
  getDebtSummaryReportApi,
  type ReportDateQuery,
} from '../reports-api'

export function useDashboard(period: DashboardPeriod) {
  return useQuery({
    queryKey: ['reports', 'dashboard', period],
    queryFn: async () => (await getDashboardApi(period)).data,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })
}

export function useInvalidateDashboard() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['reports', 'dashboard'] })
}

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

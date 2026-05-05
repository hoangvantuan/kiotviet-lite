import { useQuery, useQueryClient } from '@tanstack/react-query'

import type { DashboardPeriod, InventoryReportTab } from '@kiotviet-lite/shared'

import {
  getDashboardApi,
  getDebtAgingReportApi,
  getDebtSummaryReportApi,
  getInventoryReportApi,
  getPricingReportApi,
  getProfitReportApi,
  getRevenueReportApi,
  type PricingReportQueryParams,
  type ReportDateQuery,
  type RevenueReportQueryParams,
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

export function useRevenueReport(query: RevenueReportQueryParams) {
  return useQuery({
    queryKey: ['reports', 'revenue', query],
    queryFn: async () => (await getRevenueReportApi(query)).data,
  })
}

export function useProfitReport(query: ReportDateQuery) {
  return useQuery({
    queryKey: ['reports', 'profit', query],
    queryFn: async () => (await getProfitReportApi(query)).data,
  })
}

export function useInventoryReport(tab: InventoryReportTab) {
  return useQuery({
    queryKey: ['reports', 'inventory', tab],
    queryFn: async () => (await getInventoryReportApi(tab)).data,
  })
}

export function usePricingReport(query: PricingReportQueryParams) {
  return useQuery({
    queryKey: ['reports', 'pricing', query],
    queryFn: async () => (await getPricingReportApi(query)).data,
  })
}

import { keepPreviousData, useQuery } from '@tanstack/react-query'

import type { CashFlowReportQuery } from '@kiotviet-lite/shared'

import { useAuthStore } from '@/stores/use-auth-store'

import { getCashFlowReportApi } from './cash-flow-api'

export function useCashFlowReportQuery(query: CashFlowReportQuery) {
  const storeId = useAuthStore((s) => s.user?.storeId)
  return useQuery({
    queryKey: ['cash-reports', 'cash-flow', storeId, query.from, query.to],
    queryFn: async () => (await getCashFlowReportApi(query)).data,
    enabled: !!storeId && !!query.from && !!query.to,
    placeholderData: keepPreviousData,
  })
}

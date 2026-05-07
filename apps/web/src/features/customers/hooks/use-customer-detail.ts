import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { CreateDebtAdjustmentInput, ListCustomerOrdersQuery } from '@kiotviet-lite/shared'

import {
  createDebtAdjustmentApi,
  getCustomerApi,
  getCustomerDebtsApi,
  getCustomerOrdersApi,
  getCustomerStatsApi,
  listDebtAdjustmentsApi,
} from '../customers-api'

const CUSTOMER_DETAIL_KEY = ['customers', 'detail'] as const

export function useCustomerDetail(id: string | undefined) {
  return useQuery({
    queryKey: [...CUSTOMER_DETAIL_KEY, id],
    queryFn: async () => (await getCustomerApi(id as string)).data,
    enabled: Boolean(id),
  })
}

export function useCustomerOrders(id: string | undefined, query: Partial<ListCustomerOrdersQuery>) {
  return useQuery({
    queryKey: [...CUSTOMER_DETAIL_KEY, id, 'orders', query],
    queryFn: async () => getCustomerOrdersApi(id as string, query),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
  })
}

export function useCustomerDebts(id: string | undefined) {
  return useQuery({
    queryKey: [...CUSTOMER_DETAIL_KEY, id, 'debts'],
    queryFn: async () => (await getCustomerDebtsApi(id as string)).data,
    enabled: Boolean(id),
  })
}

export function useCustomerStats(id: string | undefined) {
  return useQuery({
    queryKey: [...CUSTOMER_DETAIL_KEY, id, 'stats'],
    queryFn: async () => (await getCustomerStatsApi(id as string)).data,
    enabled: Boolean(id),
  })
}

// ========== Debt Adjustments ==========

export function useDebtAdjustments(customerId: string | undefined, page = 1) {
  return useQuery({
    queryKey: ['debt-adjustments', customerId, { page }],
    queryFn: async () => listDebtAdjustmentsApi(customerId as string, { page }),
    enabled: Boolean(customerId),
    placeholderData: keepPreviousData,
  })
}

export function useCreateDebtAdjustmentMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateDebtAdjustmentInput) => createDebtAdjustmentApi(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...CUSTOMER_DETAIL_KEY, variables.customerId],
      })
      queryClient.invalidateQueries({ queryKey: ['debt-adjustments', variables.customerId] })
    },
  })
}

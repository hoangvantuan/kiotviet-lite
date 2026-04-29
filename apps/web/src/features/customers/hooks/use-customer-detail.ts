import { keepPreviousData, useQuery } from '@tanstack/react-query'

import type { ListCustomerOrdersQuery } from '@kiotviet-lite/shared'

import {
  getCustomerApi,
  getCustomerDebtsApi,
  getCustomerOrdersApi,
  getCustomerStatsApi,
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

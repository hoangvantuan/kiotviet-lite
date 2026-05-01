import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { getOrderApi, listOrdersApi, type ListOrdersQuery } from './orders-api'

const ORDERS_KEY = ['orders'] as const

export function useOrdersQuery(query: ListOrdersQuery) {
  return useQuery({
    queryKey: [...ORDERS_KEY, 'list', query],
    queryFn: () => listOrdersApi(query),
    placeholderData: keepPreviousData,
  })
}

export function useOrderQuery(id: string | undefined) {
  return useQuery({
    queryKey: [...ORDERS_KEY, 'detail', id],
    queryFn: async () => (await getOrderApi(id as string)).data,
    enabled: Boolean(id),
  })
}

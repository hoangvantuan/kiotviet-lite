import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  type CreateOrderReturnInput,
  createReturnApi,
  getOrderApi,
  getOrderReturnsApi,
  getReturnableItemsApi,
  listOrdersApi,
  type ListOrdersQuery,
} from './orders-api'

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

export function useReturnableItemsQuery(orderId: string | undefined) {
  return useQuery({
    queryKey: [...ORDERS_KEY, 'returnable-items', orderId],
    queryFn: async () => (await getReturnableItemsApi(orderId as string)).data,
    enabled: Boolean(orderId),
  })
}

export function useOrderReturnsQuery(orderId: string | undefined) {
  return useQuery({
    queryKey: [...ORDERS_KEY, 'returns', orderId],
    queryFn: async () => (await getOrderReturnsApi(orderId as string)).data,
    enabled: Boolean(orderId),
  })
}

export function useCreateReturnMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ orderId, input }: { orderId: string; input: CreateOrderReturnInput }) =>
      createReturnApi(orderId, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [...ORDERS_KEY, 'detail', variables.orderId] })
      queryClient.invalidateQueries({ queryKey: [...ORDERS_KEY, 'returns', variables.orderId] })
      queryClient.invalidateQueries({ queryKey: [...ORDERS_KEY, 'returnable-items', variables.orderId] })
      queryClient.invalidateQueries({ queryKey: [...ORDERS_KEY, 'list'] })
    },
  })
}

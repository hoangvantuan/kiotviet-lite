import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { CancelDocumentInput, ReviewOrderInput } from '@kiotviet-lite/shared'

import { useDocumentMutation } from '@/hooks/use-document-mutation'

import {
  cancelOrderApi,
  type CreateOrderReturnInput,
  createReturnApi,
  getOrderApi,
  getOrderReturnsApi,
  getPendingReviewCountApi,
  getReturnableItemsApi,
  listOrdersApi,
  type ListOrdersQuery,
  reviewOrderApi,
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
    queryFn: async () => {
      const response = await getReturnableItemsApi(orderId as string)
      return { items: response.data, prepaymentApplied: response.meta?.prepaymentApplied ?? 0 }
    },
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
  return useDocumentMutation({
    intent: 'order-return.create',
    mutationFn: (
      { orderId, input }: { orderId: string; input: CreateOrderReturnInput },
      idempotencyKey,
    ) => createReturnApi(orderId, input, idempotencyKey),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [...ORDERS_KEY, 'detail', variables.orderId] })
      queryClient.invalidateQueries({ queryKey: [...ORDERS_KEY, 'returns', variables.orderId] })
      queryClient.invalidateQueries({
        queryKey: [...ORDERS_KEY, 'returnable-items', variables.orderId],
      })
      queryClient.invalidateQueries({ queryKey: [...ORDERS_KEY, 'list'] })
    },
  })
}

/** ADR-0009: số đơn ngoại tuyến vi phạm chính sách đang chờ duyệt (chủ, quản lý) */
export function usePendingReviewCountQuery(enabled: boolean) {
  return useQuery({
    queryKey: [...ORDERS_KEY, 'pending-review-count'],
    queryFn: async () => (await getPendingReviewCountApi()).data.count,
    enabled,
  })
}

export function useReviewOrderMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ orderId, input }: { orderId: string; input: ReviewOrderInput }) =>
      reviewOrderApi(orderId, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [...ORDERS_KEY, 'detail', variables.orderId] })
      queryClient.invalidateQueries({ queryKey: [...ORDERS_KEY, 'list'] })
      queryClient.invalidateQueries({ queryKey: [...ORDERS_KEY, 'pending-review-count'] })
    },
  })
}

export function useCancelOrderMutation() {
  const queryClient = useQueryClient()
  return useDocumentMutation({
    intent: 'order.cancel',
    instance: (v: { orderId: string; input: CancelDocumentInput }) => v.orderId,
    fingerprint: (v) => v.orderId,
    mutationFn: ({ orderId, input }: { orderId: string; input: CancelDocumentInput }, key) =>
      cancelOrderApi(orderId, input, key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORDERS_KEY })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })
}

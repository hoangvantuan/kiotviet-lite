import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { CreatePurchaseOrderInput, ListPurchaseOrdersQuery } from '@kiotviet-lite/shared'

import {
  createPurchaseOrderApi,
  getPurchaseOrderApi,
  listPurchaseOrdersApi,
} from './purchase-orders-api'

const PURCHASE_ORDERS_KEY = ['purchase-orders'] as const

export function usePurchaseOrdersQuery(query: Partial<ListPurchaseOrdersQuery>) {
  return useQuery({
    queryKey: [...PURCHASE_ORDERS_KEY, 'list', query],
    queryFn: async () => listPurchaseOrdersApi(query),
    placeholderData: keepPreviousData,
  })
}

export function usePurchaseOrderQuery(id: string | undefined) {
  return useQuery({
    queryKey: [...PURCHASE_ORDERS_KEY, 'detail', id],
    queryFn: async () => (await getPurchaseOrderApi(id as string)).data,
    enabled: Boolean(id),
  })
}

export function useCreatePurchaseOrderMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreatePurchaseOrderInput) => createPurchaseOrderApi(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PURCHASE_ORDERS_KEY })
      qc.invalidateQueries({ queryKey: ['suppliers'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['low-stock-count'] })
      qc.invalidateQueries({ queryKey: ['low-stock'] })
      qc.invalidateQueries({ queryKey: ['inventory-transactions'] })
    },
  })
}

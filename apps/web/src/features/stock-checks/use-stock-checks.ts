import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type {
  CreateStockCheckInput,
  ListStockChecksQuery,
  UpdateStockCheckInput,
} from '@kiotviet-lite/shared'

import {
  confirmStockCheckApi,
  createStockCheckApi,
  deleteStockCheckApi,
  getStockCheckApi,
  listStockChecksApi,
  updateStockCheckApi,
} from './stock-checks-api'

const STOCK_CHECKS_KEY = ['stock-checks'] as const

export function useStockChecksQuery(query: Partial<ListStockChecksQuery>) {
  return useQuery({
    queryKey: [...STOCK_CHECKS_KEY, 'list', query],
    queryFn: async () => listStockChecksApi(query),
    placeholderData: keepPreviousData,
  })
}

export function useStockCheckQuery(id: string | undefined) {
  return useQuery({
    queryKey: [...STOCK_CHECKS_KEY, 'detail', id],
    queryFn: async () => (await getStockCheckApi(id as string)).data,
    enabled: Boolean(id),
  })
}

export function useCreateStockCheckMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateStockCheckInput) => createStockCheckApi(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STOCK_CHECKS_KEY })
    },
  })
}

export function useUpdateStockCheckMutation(id: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateStockCheckInput) => updateStockCheckApi(id as string, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STOCK_CHECKS_KEY })
    },
  })
}

export function useConfirmStockCheckMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => confirmStockCheckApi(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STOCK_CHECKS_KEY })
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['inventory-transactions'] })
      qc.invalidateQueries({ queryKey: ['low-stock-count'] })
      qc.invalidateQueries({ queryKey: ['low-stock'] })
    },
  })
}

export function useDeleteStockCheckMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteStockCheckApi(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STOCK_CHECKS_KEY })
    },
  })
}

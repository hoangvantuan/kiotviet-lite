import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type {
  CreatePriceListInput,
  CreatePriceListItemInput,
  ListPriceListItemsQuery,
  ListPriceListsQuery,
  UpdatePriceListInput,
  UpdatePriceListItemInput,
} from '@kiotviet-lite/shared'

import {
  createPriceListApi,
  createPriceListItemApi,
  deletePriceListApi,
  deletePriceListItemApi,
  getPriceListApi,
  listPriceListItemsApi,
  listPriceListsApi,
  listTrashedPriceListsApi,
  recalculatePriceListApi,
  restorePriceListApi,
  updatePriceListApi,
  updatePriceListItemApi,
} from './price-lists-api'

const PRICE_LISTS_KEY = ['price-lists'] as const

export function usePriceListsQuery(query: Partial<ListPriceListsQuery>) {
  return useQuery({
    queryKey: [...PRICE_LISTS_KEY, 'list', query],
    queryFn: async () => listPriceListsApi(query),
    placeholderData: keepPreviousData,
  })
}

export function useDirectPriceListsQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...PRICE_LISTS_KEY, 'list', { method: 'direct', pageSize: 100 }],
    queryFn: async () =>
      listPriceListsApi({ method: 'direct', pageSize: 100, status: 'all', page: 1 }),
    enabled: options?.enabled,
  })
}

export function useTrashedPriceListsQuery(page: number, pageSize = 20) {
  return useQuery({
    queryKey: [...PRICE_LISTS_KEY, 'trashed', page, pageSize],
    queryFn: async () => listTrashedPriceListsApi(page, pageSize),
    placeholderData: keepPreviousData,
  })
}

export function usePriceListQuery(id: string | undefined) {
  return useQuery({
    queryKey: [...PRICE_LISTS_KEY, 'detail', id],
    queryFn: async () => (await getPriceListApi(id as string)).data,
    enabled: Boolean(id),
  })
}

export function usePriceListItemsQuery(
  priceListId: string | undefined,
  query: Partial<ListPriceListItemsQuery>,
) {
  return useQuery({
    queryKey: [...PRICE_LISTS_KEY, 'items', priceListId, query],
    queryFn: async () => listPriceListItemsApi(priceListId as string, query),
    enabled: Boolean(priceListId),
    placeholderData: keepPreviousData,
  })
}

export function useCreatePriceListMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreatePriceListInput) => createPriceListApi(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PRICE_LISTS_KEY })
    },
  })
}

export function useUpdatePriceListMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdatePriceListInput }) =>
      updatePriceListApi(vars.id, vars.input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PRICE_LISTS_KEY })
    },
  })
}

export function useDeletePriceListMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deletePriceListApi(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PRICE_LISTS_KEY })
    },
  })
}

export function useRestorePriceListMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => restorePriceListApi(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PRICE_LISTS_KEY })
    },
  })
}

export function useRecalculatePriceListMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => recalculatePriceListApi(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PRICE_LISTS_KEY })
    },
  })
}

export function useCreatePriceListItemMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { priceListId: string; input: CreatePriceListItemInput }) =>
      createPriceListItemApi(vars.priceListId, vars.input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PRICE_LISTS_KEY })
    },
  })
}

export function useUpdatePriceListItemMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { priceListId: string; itemId: string; input: UpdatePriceListItemInput }) =>
      updatePriceListItemApi(vars.priceListId, vars.itemId, vars.input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PRICE_LISTS_KEY })
    },
  })
}

export function useDeletePriceListItemMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { priceListId: string; itemId: string }) =>
      deletePriceListItemApi(vars.priceListId, vars.itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PRICE_LISTS_KEY })
    },
  })
}

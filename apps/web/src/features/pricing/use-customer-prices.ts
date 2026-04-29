import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type {
  CreateCustomerPriceInput,
  ListCustomerPricesQuery,
  UpdateCustomerPriceInput,
} from '@kiotviet-lite/shared'

import {
  createCustomerPriceApi,
  deleteCustomerPriceApi,
  getCustomerPriceApi,
  listCustomerPricesApi,
  updateCustomerPriceApi,
} from './customer-prices-api'

const CUSTOMER_PRICES_KEY = ['customer-prices'] as const

export function useCustomerPricesQuery(query: Partial<ListCustomerPricesQuery>) {
  return useQuery({
    queryKey: [...CUSTOMER_PRICES_KEY, 'list', query],
    queryFn: async () => listCustomerPricesApi(query),
    placeholderData: keepPreviousData,
  })
}

export function useCustomerPriceQuery(id: string | undefined) {
  return useQuery({
    queryKey: [...CUSTOMER_PRICES_KEY, 'detail', id],
    queryFn: async () => (await getCustomerPriceApi(id as string)).data,
    enabled: Boolean(id),
  })
}

export function useCreateCustomerPriceMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCustomerPriceInput) => createCustomerPriceApi(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CUSTOMER_PRICES_KEY })
    },
  })
}

export function useUpdateCustomerPriceMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateCustomerPriceInput }) =>
      updateCustomerPriceApi(vars.id, vars.input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CUSTOMER_PRICES_KEY })
    },
  })
}

export function useDeleteCustomerPriceMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteCustomerPriceApi(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CUSTOMER_PRICES_KEY })
    },
  })
}

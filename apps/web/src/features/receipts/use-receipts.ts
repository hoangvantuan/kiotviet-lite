import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { CreateReceiptInput, ListReceiptsQuery } from '@kiotviet-lite/shared'

import {
  createReceiptApi,
  getCustomerOpenDebtsApi,
  getReceiptApi,
  listReceiptsApi,
} from './receipts-api'

const RECEIPTS_KEY = ['receipts'] as const
const CUSTOMER_OPEN_DEBTS_KEY = ['customer-open-debts'] as const

export function useReceiptsQuery(query: Partial<ListReceiptsQuery>) {
  return useQuery({
    queryKey: [...RECEIPTS_KEY, 'list', query],
    queryFn: async () => listReceiptsApi(query),
    placeholderData: keepPreviousData,
  })
}

export function useReceiptQuery(id: string | undefined) {
  return useQuery({
    queryKey: [...RECEIPTS_KEY, 'detail', id],
    queryFn: async () => (await getReceiptApi(id as string)).data,
    enabled: Boolean(id),
  })
}

export function useCustomerOpenDebtsQuery(customerId: string | undefined) {
  return useQuery({
    queryKey: [...CUSTOMER_OPEN_DEBTS_KEY, customerId],
    queryFn: async () => (await getCustomerOpenDebtsApi(customerId as string)).data,
    enabled: Boolean(customerId),
  })
}

export function useCreateReceiptMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateReceiptInput) => createReceiptApi(input),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: RECEIPTS_KEY })
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: [...CUSTOMER_OPEN_DEBTS_KEY, variables.customerId] })
      qc.invalidateQueries({ queryKey: ['customer-debt', variables.customerId] })
    },
  })
}

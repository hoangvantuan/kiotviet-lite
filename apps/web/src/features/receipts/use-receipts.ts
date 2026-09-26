import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'

import type {
  CancelDocumentInput,
  CreateReceiptInput,
  ListReceiptsQuery,
} from '@kiotviet-lite/shared'

import { useDocumentMutation } from '@/hooks/use-document-mutation'

import {
  cancelReceiptApi,
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
  return useDocumentMutation({
    intent: 'receipt.create',
    mutationFn: (input: CreateReceiptInput, idempotencyKey) =>
      createReceiptApi(input, idempotencyKey),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: RECEIPTS_KEY })
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: [...CUSTOMER_OPEN_DEBTS_KEY, variables.customerId] })
      qc.invalidateQueries({ queryKey: ['customer-debt', variables.customerId] })
    },
  })
}

export function useCancelReceiptMutation() {
  const qc = useQueryClient()
  return useDocumentMutation({
    intent: 'receipt.cancel',
    instance: (v: { id: string; input: CancelDocumentInput }) => v.id,
    fingerprint: (v) => v.id,
    mutationFn: (v: { id: string; input: CancelDocumentInput }, idempotencyKey) =>
      cancelReceiptApi(v.id, v.input, idempotencyKey),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: RECEIPTS_KEY })
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: CUSTOMER_OPEN_DEBTS_KEY })
      qc.invalidateQueries({ queryKey: ['customer-debt', res.data.customerId] })
    },
  })
}

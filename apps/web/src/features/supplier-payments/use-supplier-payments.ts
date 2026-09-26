import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'

import type {
  CancelDocumentInput,
  CreateSupplierPaymentInput,
  ListSupplierPaymentsQuery,
} from '@kiotviet-lite/shared'

import { useDocumentMutation } from '@/hooks/use-document-mutation'

import {
  cancelSupplierPaymentApi,
  createSupplierPaymentApi,
  getSupplierPaymentApi,
  listSupplierPaymentsApi,
} from './supplier-payments-api'

const SUPPLIER_PAYMENTS_KEY = ['supplier-payments'] as const

export function useSupplierPaymentsQuery(query: Partial<ListSupplierPaymentsQuery>) {
  return useQuery({
    queryKey: [...SUPPLIER_PAYMENTS_KEY, 'list', query],
    queryFn: async () => listSupplierPaymentsApi(query),
    placeholderData: keepPreviousData,
  })
}

export function useSupplierPaymentQuery(id: string | undefined) {
  return useQuery({
    queryKey: [...SUPPLIER_PAYMENTS_KEY, 'detail', id],
    queryFn: async () => (await getSupplierPaymentApi(id as string)).data,
    enabled: Boolean(id),
  })
}

export function useCreateSupplierPaymentMutation() {
  const qc = useQueryClient()
  return useDocumentMutation({
    intent: 'supplier-payment.create',
    mutationFn: (input: CreateSupplierPaymentInput, idempotencyKey) =>
      createSupplierPaymentApi(input, idempotencyKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUPPLIER_PAYMENTS_KEY })
      qc.invalidateQueries({ queryKey: ['suppliers'] })
      qc.invalidateQueries({ queryKey: ['purchase-orders'] })
    },
  })
}

export function useCancelSupplierPaymentMutation() {
  const qc = useQueryClient()
  return useDocumentMutation({
    intent: 'supplier-payment.cancel',
    instance: (v: { id: string; input: CancelDocumentInput }) => v.id,
    fingerprint: (v) => v.id,
    mutationFn: (v: { id: string; input: CancelDocumentInput }, idempotencyKey) =>
      cancelSupplierPaymentApi(v.id, v.input, idempotencyKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUPPLIER_PAYMENTS_KEY })
      qc.invalidateQueries({ queryKey: ['suppliers'] })
      qc.invalidateQueries({ queryKey: ['purchase-orders'] })
    },
  })
}

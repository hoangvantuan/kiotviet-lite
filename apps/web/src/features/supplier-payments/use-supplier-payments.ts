import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { CreateSupplierPaymentInput, ListSupplierPaymentsQuery } from '@kiotviet-lite/shared'

import {
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
  return useMutation({
    mutationFn: (input: CreateSupplierPaymentInput) => createSupplierPaymentApi(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUPPLIER_PAYMENTS_KEY })
      qc.invalidateQueries({ queryKey: ['suppliers'] })
    },
  })
}

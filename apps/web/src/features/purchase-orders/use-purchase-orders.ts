import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'

import type {
  CancelDocumentInput,
  CreatePurchaseOrderInput,
  CreatePurchaseReturnInput,
  ListPurchaseOrdersQuery,
} from '@kiotviet-lite/shared'

import { useDocumentMutation } from '@/hooks/use-document-mutation'

import {
  cancelPurchaseOrderApi,
  createPurchaseOrderApi,
  createPurchaseReturnApi,
  getPurchaseOrderApi,
  listPurchaseOrdersApi,
} from './purchase-orders-api'

const PURCHASE_ORDERS_KEY = ['purchase-orders'] as const

export function usePurchaseOrdersQuery(
  query: Partial<ListPurchaseOrdersQuery>,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: [...PURCHASE_ORDERS_KEY, 'list', query],
    queryFn: async () => listPurchaseOrdersApi(query),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  })
}

export function usePurchaseOrderQuery(id: string | undefined) {
  return useQuery({
    queryKey: [...PURCHASE_ORDERS_KEY, 'detail', id],
    queryFn: async () => (await getPurchaseOrderApi(id as string)).data,
    enabled: Boolean(id),
  })
}

/** Mọi thay đổi phiếu nhập đụng tới tồn, giá vốn, công nợ NCC */
function invalidatePurchaseEffects(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: PURCHASE_ORDERS_KEY })
  qc.invalidateQueries({ queryKey: ['suppliers'] })
  qc.invalidateQueries({ queryKey: ['products'] })
  qc.invalidateQueries({ queryKey: ['low-stock-count'] })
  qc.invalidateQueries({ queryKey: ['low-stock'] })
  qc.invalidateQueries({ queryKey: ['inventory-transactions'] })
}

export function useCancelPurchaseOrderMutation() {
  const qc = useQueryClient()
  return useDocumentMutation({
    intent: 'purchase-order.cancel',
    instance: (v: { id: string; input: CancelDocumentInput }) => v.id,
    fingerprint: (v) => v.id,
    mutationFn: (v: { id: string; input: CancelDocumentInput }, idempotencyKey) =>
      cancelPurchaseOrderApi(v.id, v.input, idempotencyKey),
    onSuccess: () => invalidatePurchaseEffects(qc),
  })
}

export function useCreatePurchaseReturnMutation() {
  const qc = useQueryClient()
  return useDocumentMutation({
    intent: 'purchase-return.create',
    instance: (v: { id: string; input: CreatePurchaseReturnInput }) => v.id,
    mutationFn: (v: { id: string; input: CreatePurchaseReturnInput }, idempotencyKey) =>
      createPurchaseReturnApi(v.id, v.input, idempotencyKey),
    onSuccess: () => invalidatePurchaseEffects(qc),
  })
}

export function useCreatePurchaseOrderMutation() {
  const qc = useQueryClient()
  return useDocumentMutation({
    intent: 'purchase-order.create',
    mutationFn: (input: CreatePurchaseOrderInput, idempotencyKey) =>
      createPurchaseOrderApi(input, idempotencyKey),
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

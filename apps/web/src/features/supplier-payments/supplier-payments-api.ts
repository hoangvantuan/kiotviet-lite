import type {
  CreateSupplierPaymentInput,
  ListSupplierPaymentsQuery,
  SupplierPaymentDetail,
  SupplierPaymentListItem,
} from '@kiotviet-lite/shared'

import { apiClient } from '@/lib/api-client'

interface Envelope<T> {
  data: T
}

interface ListEnvelope<T> {
  data: T
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

function buildQuery(q: Partial<ListSupplierPaymentsQuery>): string {
  const params = new URLSearchParams()
  if (q.page) params.set('page', String(q.page))
  if (q.pageSize) params.set('pageSize', String(q.pageSize))
  if (q.supplierId) params.set('supplierId', q.supplierId)
  if (q.fromDate) params.set('fromDate', q.fromDate)
  if (q.toDate) params.set('toDate', q.toDate)
  if (q.search) params.set('search', q.search)
  const s = params.toString()
  return s ? `?${s}` : ''
}

export function listSupplierPaymentsApi(query: Partial<ListSupplierPaymentsQuery>) {
  return apiClient.get<ListEnvelope<SupplierPaymentListItem[]>>(
    `/api/v1/supplier-payments${buildQuery(query)}`,
  )
}

export function getSupplierPaymentApi(id: string) {
  return apiClient.get<Envelope<SupplierPaymentDetail>>(`/api/v1/supplier-payments/${id}`)
}

export function createSupplierPaymentApi(input: CreateSupplierPaymentInput) {
  return apiClient.post<Envelope<SupplierPaymentDetail>>('/api/v1/supplier-payments', input)
}

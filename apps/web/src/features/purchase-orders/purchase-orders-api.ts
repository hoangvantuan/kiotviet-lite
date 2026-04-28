import type {
  CreatePurchaseOrderInput,
  ListPurchaseOrdersQuery,
  PurchaseOrderDetail,
  PurchaseOrderListItem,
} from '@kiotviet-lite/shared'

import { apiClient } from '@/lib/api-client'

interface Envelope<T> {
  data: T
}

interface ListEnvelope<T> {
  data: T
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

function buildQuery(q: Partial<ListPurchaseOrdersQuery>): string {
  const params = new URLSearchParams()
  if (q.page) params.set('page', String(q.page))
  if (q.pageSize) params.set('pageSize', String(q.pageSize))
  if (q.search) params.set('search', q.search)
  if (q.supplierId) params.set('supplierId', q.supplierId)
  if (q.paymentStatus) params.set('paymentStatus', q.paymentStatus)
  if (q.fromDate) params.set('fromDate', q.fromDate)
  if (q.toDate) params.set('toDate', q.toDate)
  const s = params.toString()
  return s ? `?${s}` : ''
}

export function listPurchaseOrdersApi(query: Partial<ListPurchaseOrdersQuery>) {
  return apiClient.get<ListEnvelope<PurchaseOrderListItem[]>>(
    `/api/v1/purchase-orders${buildQuery(query)}`,
  )
}

export function getPurchaseOrderApi(id: string) {
  return apiClient.get<Envelope<PurchaseOrderDetail>>(`/api/v1/purchase-orders/${id}`)
}

export function createPurchaseOrderApi(input: CreatePurchaseOrderInput) {
  return apiClient.post<Envelope<PurchaseOrderDetail>>('/api/v1/purchase-orders', input)
}

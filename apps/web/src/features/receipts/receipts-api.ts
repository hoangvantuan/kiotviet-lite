import type {
  CreateReceiptInput,
  CustomerOpenDebtsResponse,
  ListReceiptsQuery,
  ReceiptDetail,
  ReceiptListItem,
} from '@kiotviet-lite/shared'

import { apiClient } from '@/lib/api-client'

interface Envelope<T> {
  data: T
}

interface ListEnvelope<T> {
  data: T
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

function buildQuery(q: Partial<ListReceiptsQuery>): string {
  const params = new URLSearchParams()
  if (q.page) params.set('page', String(q.page))
  if (q.pageSize) params.set('pageSize', String(q.pageSize))
  if (q.customerId) params.set('customerId', q.customerId)
  if (q.fromDate) params.set('fromDate', q.fromDate)
  if (q.toDate) params.set('toDate', q.toDate)
  if (q.search) params.set('search', q.search)
  const s = params.toString()
  return s ? `?${s}` : ''
}

export function listReceiptsApi(query: Partial<ListReceiptsQuery>) {
  return apiClient.get<ListEnvelope<ReceiptListItem[]>>(`/api/v1/receipts${buildQuery(query)}`)
}

export function getReceiptApi(id: string) {
  return apiClient.get<Envelope<ReceiptDetail>>(`/api/v1/receipts/${id}`)
}

export function createReceiptApi(input: CreateReceiptInput) {
  return apiClient.post<Envelope<ReceiptDetail>>('/api/v1/receipts', input)
}

export function getCustomerOpenDebtsApi(customerId: string) {
  return apiClient.get<Envelope<CustomerOpenDebtsResponse>>(
    `/api/v1/receipts/customer-debts/${customerId}`,
  )
}
